import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, '..', 'archery-league-demo.html');
const targetPath = path.resolve(__dirname, 'Index.html');

let html = fs.readFileSync(sourcePath, 'utf8');

// Remove GitHub Pages analytics from the private Google Sheets testing build.
html = html.replace(/<!-- Google Analytics -->\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-Q2Q1R2DXVF"><\/script>\s*<script>[\s\S]*?gtag\('config', 'G-Q2Q1R2DXVF'\);\s*<\/script>\s*/m, '');

// Header sheet controls.
html = html.replace(
  '<button class="btn-header" onclick="openHelp()">❓</button>',
  '<span id="sheetSyncStatus" style="font-size:0.72rem;color:#bbf7d0;white-space:nowrap;">Sheet: loading...</span>\n      <button class="btn-header" onclick="loadFromSheetNow()" title="Reload from Google Sheet">🔄 Reload Sheet</button>\n      <button class="btn-header" onclick="saveToSheetNow()" title="Save to Google Sheet">💾 Save Sheet</button>\n      <button class="btn-header" onclick="openHelp()">❓</button>'
);

// Remove visible sample-data entry points and references from this testing version.
html = html.replace(/\s*<button class="btn btn-warning" onclick="loadSampleData\(\)">📋 Load Sample Data<\/button>\r?\n/g, '');
html = html.replace(/(<button class="btn btn-purple" onclick="lockBrackets\(\)" id="btnLockBrackets">🔒 Lock Brackets<\/button>)\s+(<button class="btn btn-sm" style="background:#fef3c7)/, '$1\n    $2');
html = html.replace(
  "body.innerHTML = '<tr><td colspan=\"7\" style=\"text-align:center;padding:30px;color:var(--text-light);\">No teams yet. Add teams manually, import from CSV, or load sample data.</td></tr>';",
  "body.innerHTML = '<tr><td colspan=\"7\" style=\"text-align:center;padding:30px;color:var(--text-light);\">No teams yet. Add teams manually, import from CSV, or enter them in the Teams sheet.</td></tr>';"
);
html = html.replace(
  "document.getElementById('dashKpi').innerHTML = '<div style=\"grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);\"><h3>No teams yet</h3><p style=\"margin:8px 0 16px;\">Add teams on the Teams tab or load sample data.</p><button class=\"btn btn-warning\" onclick=\"loadSampleData()\">📋 Load Sample Data</button></div>';",
  "document.getElementById('dashKpi').innerHTML = '<div style=\"grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);\"><h3>No teams yet</h3><p style=\"margin:8px 0 16px;\">Add teams on the Teams tab, import a CSV, or enter them in the Teams sheet.</p></div>';"
);

// Replace embedded demo sample data with a no-op so no sample roster is available in the sheet-backed build.
html = html.replace(
  /\/\* ══════════════════════════════════════════\r?\n   SAMPLE DATA\r?\n   ══════════════════════════════════════════ \*\/[\s\S]*?\/\* ══════════════════════════════════════════\r?\n   DARK MODE/m,
  `/* ══════════════════════════════════════════
   SAMPLE DATA DISABLED (Google Sheets build)
   ══════════════════════════════════════════ */
function loadSampleData() {
  showToast('Sample data is disabled in the Google Sheets testing version. Add teams manually, import CSV, or enter them in the Teams sheet.');
}
function doLoadSampleData() { loadSampleData(); }

/* ══════════════════════════════════════════
   DARK MODE`
);

const syncJs = `

/* ══════════════════════════════════════════
   GOOGLE SHEETS SYNC (Apps Script testing build)
   ══════════════════════════════════════════ */
let sheetSyncReady = false;
let sheetIsLoading = false;
let sheetIsSaving = false;
let sheetSaveTimer = null;

function isAppsScriptRuntime() {
  return typeof google !== 'undefined' && google.script && google.script.run;
}

function setSheetStatus(msg, state) {
  const el = document.getElementById('sheetSyncStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = state === 'error' ? '#fecaca' : state === 'saving' ? '#fde68a' : '#bbf7d0';
}

function cloneForSheet(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function getSeasonState() {
  return {
    version: 5,
    savedAt: new Date().toISOString(),
    config: cloneForSheet(config),
    teams: cloneForSheet(teams) || [],
    scores: cloneForSheet(scores) || {},
    schedule: cloneForSheet(schedule) || {},
    qualSchedule: cloneForSheet(qualSchedule) || {},
    substitutes: cloneForSheet(substitutes) || {},
    submittedWeeks: cloneForSheet(submittedWeeks) || {},
    freeAgents: cloneForSheet(freeAgents) || []
  };
}

function applySeasonState(data) {
  data = data || {};
  config = Object.assign({}, config, data.config || {});
  teams = Array.isArray(data.teams) ? data.teams : [];
  scores = data.scores || {};
  schedule = data.schedule || {};
  qualSchedule = data.qualSchedule || {};
  substitutes = data.substitutes || {};
  submittedWeeks = data.submittedWeeks || {};
  freeAgents = Array.isArray(data.freeAgents) ? data.freeAgents : [];
  loadConfigUI();
  renderTeams();
  renderFreeAgents();
  populateWeekSelect();
  renderScoreEntry();
  updateWeekNav();
  refreshActiveTabAfterSheetLoad();
}

function refreshActiveTabAfterSheetLoad() {
  const active = document.querySelector('.tab-content.active');
  const id = active ? active.id.replace('tab-', '') : 'dashboard';
  if (id === 'dashboard') renderDashboard();
  else if (id === 'teams') { renderTeams(); renderFreeAgents(); }
  else if (id === 'scores') renderScoreTab();
  else if (id === 'standings') renderStandings();
  else if (id === 'schedule') renderScheduleTab();
  else if (id === 'stats') renderStats();
  else if (id === 'settings') loadSettingsUI();
}

function initializeSheetBackedApp() {
  if (!isAppsScriptRuntime()) {
    sheetSyncReady = true;
    setSheetStatus('Sheet: offline preview', 'error');
    loadConfigUI();
    renderDashboard();
    return;
  }
  sheetIsLoading = true;
  setSheetStatus('Sheet: loading...', 'saving');
  google.script.run
    .withSuccessHandler(function(data) {
      applySeasonState(data);
      sheetIsLoading = false;
      sheetSyncReady = true;
      setSheetStatus('Sheet: synced', 'ok');
      showToast('✅ Loaded from Google Sheet');
    })
    .withFailureHandler(function(err) {
      sheetIsLoading = false;
      sheetSyncReady = true;
      setSheetStatus('Sheet: load failed', 'error');
      loadConfigUI();
      renderDashboard();
      showToast('⚠️ Could not load Google Sheet: ' + (err && err.message ? err.message : err));
    })
    .loadSeason();
}

function queueSheetSave(reason) {
  if (!sheetSyncReady || sheetIsLoading || !isAppsScriptRuntime()) return;
  clearTimeout(sheetSaveTimer);
  sheetSaveTimer = setTimeout(function() { saveToSheetNow(reason || 'auto'); }, 900);
}

function saveToSheetNow(reason) {
  if (!isAppsScriptRuntime()) { showToast('⚠️ Sheet sync only works inside Google Apps Script'); return; }
  if (sheetIsSaving || sheetIsLoading) { queueSheetSave(reason || 'retry'); return; }
  sheetIsSaving = true;
  setSheetStatus('Sheet: saving...', 'saving');
  google.script.run
    .withSuccessHandler(function() {
      sheetIsSaving = false;
      setSheetStatus('Sheet: saved ' + new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}), 'ok');
    })
    .withFailureHandler(function(err) {
      sheetIsSaving = false;
      setSheetStatus('Sheet: save failed', 'error');
      showToast('⚠️ Could not save to Google Sheet: ' + (err && err.message ? err.message : err));
    })
    .saveSeason(getSeasonState());
}

function loadFromSheetNow() {
  if (!isAppsScriptRuntime()) { showToast('⚠️ Sheet reload only works inside Google Apps Script'); return; }
  appConfirm('Reload from the Google Sheet? Unsaved in-screen changes may be replaced.', function() {
    sheetIsLoading = true;
    setSheetStatus('Sheet: reloading...', 'saving');
    google.script.run
      .withSuccessHandler(function(data) {
        applySeasonState(data);
        sheetIsLoading = false;
        setSheetStatus('Sheet: synced', 'ok');
        showToast('🔄 Reloaded from Google Sheet');
      })
      .withFailureHandler(function(err) {
        sheetIsLoading = false;
        setSheetStatus('Sheet: reload failed', 'error');
        showToast('⚠️ Could not reload Google Sheet: ' + (err && err.message ? err.message : err));
      })
      .loadSeason();
  }, 'Reload Sheet');
}

function clearSpreadsheetAndApp() {
  if (!isAppsScriptRuntime()) {
    teams = [];
    scores = {};
    schedule = {};
    qualSchedule = {};
    substitutes = {};
    submittedWeeks = {};
    freeAgents = [];
    config.bracketsLocked = false;
    applySeasonState(getSeasonState());
    showToast('🗑️ Season cleared locally');
    return;
  }
  sheetIsLoading = true;
  setSheetStatus('Sheet: clearing...', 'saving');
  google.script.run
    .withSuccessHandler(function(data) {
      applySeasonState(data);
      sheetIsLoading = false;
      sheetSyncReady = true;
      setSheetStatus('Sheet: cleared', 'ok');
      showToast('🗑️ Season and spreadsheet cleared');
    })
    .withFailureHandler(function(err) {
      sheetIsLoading = false;
      setSheetStatus('Sheet: clear failed', 'error');
      showToast('⚠️ Could not clear spreadsheet: ' + (err && err.message ? err.message : err));
    })
    .clearSeason();
}

document.addEventListener('click', function(e) {
  if (!e.target || !e.target.closest || !e.target.closest('button')) return;
  setTimeout(function() { queueSheetSave('click'); }, 900);
}, true);

document.addEventListener('change', function(e) {
  if (!e.target || !e.target.matches || !e.target.matches('input,select,textarea')) return;
  if (e.target.type === 'file') return;
  setTimeout(function() { queueSheetSave('change'); }, 900);
}, true);
`;

html = html.replace(/let importHeaders = \[\], importRows = \[\], importMapping = \{\};\r?\n/, function(match) { return match + syncJs; });

// Save score changes immediately through the debounced sheet adapter.
html = html.replace(/\r?\n}\r?\n\r?\nfunction toggleQualTeam\(id\) \{ \}/, "\n  queueSheetSave('score');\n}\n\nfunction toggleQualTeam(id) { }");

// Persist generated random qualifying matchups.
html = html.replace(/  qualSchedule\[week\] = matchups;\r?\n}/, "  qualSchedule[week] = matchups;\n  queueSheetSave('qual schedule');\n}");

// Make Clear Entire Season clear both UI state and all app-owned spreadsheet tabs.
const clearStart = html.indexOf('function clearSeasonStep2()');
let standingsStart = html.indexOf('/* ══════════════════════════════════════════\r\n   RENDER: STANDINGS', clearStart);
if (standingsStart === -1) standingsStart = html.indexOf('/* ══════════════════════════════════════════\n   RENDER: STANDINGS', clearStart);
if (clearStart !== -1 && standingsStart !== -1) {
  html = html.slice(0, clearStart) + `function clearSeasonStep2() {
  appPrompt('Type CLEAR to permanently delete all season data from the app AND the Google Sheet:', function(typed) {
    if (!typed || typed.trim().toUpperCase() !== 'CLEAR') {
      showToast('❌ Season clear cancelled');
      return;
    }
    if (teams.length > 0) backupData();
    clearSpreadsheetAndApp();
  }, '🔒 Final Confirmation');
}

` + html.slice(standingsStart);
}

// Load initial state from Google Sheets instead of starting empty.
html = html.replace(/  loadDarkMode\(\);\r?\n  loadConfigUI\(\);\r?\n  renderDashboard\(\);\r?\n}\);/, '  loadDarkMode();\n  initializeSheetBackedApp();\n});');

fs.writeFileSync(targetPath, html, 'utf8');
console.log(`Generated ${targetPath}`);
