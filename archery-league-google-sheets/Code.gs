const SHEETS = {
  CONFIG: 'Config',
  TEAMS: 'Teams',
  FREE_AGENTS: 'Free Agents',
  SCORES: 'Scores',
  SCHEDULE: 'Schedule',
  QUAL_SCHEDULE: 'Qualifying Schedule',
  SUBSTITUTES: 'Substitutes',
  SUBMITTED_WEEKS: 'Submitted Weeks'
};

const DEFAULT_CONFIG = {
  leagueName: 'Buckskin Bowmen',
  season: '2026 Summer',
  numBrackets: 4,
  qualWeeks: 2,
  bracketPlayWeeks: 11,
  targets: 28,
  ptsPerTarget: 10,
  handicapPct: 80,
  archersPerTeam: 3,
  startDate: '2026-06-01',
  bracketsLocked: false
};

const TEAM_HEADERS = [
  'Team ID', 'Team Name', 'Bracket',
  'Archer 1', 'Phone 1', 'Email 1',
  'Archer 2', 'Phone 2', 'Email 2',
  'Archer 3', 'Phone 3', 'Email 3',
  'Archer 4', 'Phone 4', 'Email 4',
  'Archer 5', 'Phone 5', 'Email 5',
  'Archer 6', 'Phone 6', 'Email 6'
];
const SCORE_HEADERS = ['Week', 'Team ID', 'Archer 1 Score', 'Archer 2 Score', 'Archer 3 Score', 'Archer 4 Score', 'Archer 5 Score', 'Archer 6 Score'];
const SCHEDULE_HEADERS = ['Bracket', 'Week', 'Team A ID', 'Team B ID', 'Playoff'];
const QUAL_SCHEDULE_HEADERS = ['Week', 'Team A ID', 'Team B ID'];
const SUBSTITUTE_HEADERS = ['Week', 'Team ID', 'Archer Index', 'Substitute Name'];
const SUBMITTED_HEADERS = ['Week', 'Submitted'];
const FREE_AGENT_HEADERS = ['Name', 'Phone', 'Email'];
const CONFIG_HEADERS = ['Key', 'Value'];

function doGet() {
  ensureSheets_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Buckskin Bowmen League Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Archery League')
    .addItem('Open League App', 'showArcheryApp')
    .addItem('Set Up Sheet Tabs', 'setupArcherySheets')
    .addToUi();
}

function showArcheryApp() {
  ensureSheets_();
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(1200)
    .setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'Buckskin Bowmen League Manager');
}

function setupArcherySheets() {
  ensureSheets_();
  return loadSeason();
}

function loadSeason() {
  ensureSheets_();
  return {
    version: 5,
    loadedAt: new Date().toISOString(),
    config: readConfig_(),
    teams: readTeams_(),
    freeAgents: readFreeAgents_(),
    scores: readScores_(),
    schedule: readSchedule_(),
    qualSchedule: readQualSchedule_(),
    substitutes: readSubstitutes_(),
    submittedWeeks: readSubmittedWeeks_()
  };
}

function saveSeason(state) {
  ensureSheets_();
  state = state || {};
  writeConfig_(state.config || DEFAULT_CONFIG);
  writeTeams_(state.teams || []);
  writeFreeAgents_(state.freeAgents || []);
  writeScores_(state.scores || {});
  writeSchedule_(state.schedule || {});
  writeQualSchedule_(state.qualSchedule || {});
  writeSubstitutes_(state.substitutes || {});
  writeSubmittedWeeks_(state.submittedWeeks || {});
  return loadSeason();
}

function clearSeason() {
  ensureSheets_();
  writeConfig_(DEFAULT_CONFIG);
  writeTeams_([]);
  writeFreeAgents_([]);
  writeScores_({});
  writeSchedule_({});
  writeQualSchedule_({});
  writeSubstitutes_({});
  writeSubmittedWeeks_({});
  return loadSeason();
}

function ensureSheets_() {
  const ss = getSpreadsheet_();
  ensureSheet_(ss, SHEETS.CONFIG, CONFIG_HEADERS);
  ensureSheet_(ss, SHEETS.TEAMS, TEAM_HEADERS);
  ensureSheet_(ss, SHEETS.FREE_AGENTS, FREE_AGENT_HEADERS);
  ensureSheet_(ss, SHEETS.SCORES, SCORE_HEADERS);
  ensureSheet_(ss, SHEETS.SCHEDULE, SCHEDULE_HEADERS);
  ensureSheet_(ss, SHEETS.QUAL_SCHEDULE, QUAL_SCHEDULE_HEADERS);
  ensureSheet_(ss, SHEETS.SUBSTITUTES, SUBSTITUTE_HEADERS);
  ensureSheet_(ss, SHEETS.SUBMITTED_WEEKS, SUBMITTED_HEADERS);
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet found. Deploy this as a container-bound script from a Google Sheet.');
  return ss;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = existing.every(v => v === '') || existing.join('|') !== headers.join('|');
  if (needsHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getDataRows_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function clearAndWrite_(sheetName, headers, rows) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.autoResizeColumns(1, Math.min(headers.length, 12));
}

function readConfig_() {
  const config = Object.assign({}, DEFAULT_CONFIG);
  getDataRows_(SHEETS.CONFIG).forEach(row => {
    const key = row[0];
    if (!key) return;
    config[key] = castConfigValue_(key, row[1]);
  });
  return config;
}

function writeConfig_(config) {
  config = Object.assign({}, DEFAULT_CONFIG, config || {});
  const rows = Object.keys(DEFAULT_CONFIG).map(key => [key, config[key]]);
  clearAndWrite_(SHEETS.CONFIG, CONFIG_HEADERS, rows);
}

function castConfigValue_(key, value) {
  if (value === '' || value === null || value === undefined) return DEFAULT_CONFIG[key];
  const defaultValue = DEFAULT_CONFIG[key];
  if (typeof defaultValue === 'number') return Number(value) || defaultValue;
  if (typeof defaultValue === 'boolean') return value === true || String(value).toLowerCase() === 'true';
  return String(value);
}

function readTeams_() {
  return getDataRows_(SHEETS.TEAMS).filter(row => row[0] !== '').map(row => {
    const archers = [];
    const contacts = [];
    for (let offset = 3; offset < TEAM_HEADERS.length; offset += 3) {
      const name = row[offset];
      const phone = row[offset + 1] || '';
      const email = row[offset + 2] || '';
      if (name) {
        archers.push(String(name));
        contacts.push({ phone: String(phone || ''), email: String(email || '') });
      }
    }
    return {
      id: Number(row[0]),
      name: String(row[1] || ''),
      bracket: row[2] ? String(row[2]) : null,
      archers: archers,
      contacts: contacts
    };
  });
}

function writeTeams_(teams) {
  const rows = (teams || []).map(team => {
    const row = [Number(team.id), team.name || '', team.bracket || ''];
    const contacts = team.contacts || [];
    for (let i = 0; i < 6; i++) {
      row.push((team.archers && team.archers[i]) || '');
      row.push((contacts[i] && contacts[i].phone) || '');
      row.push((contacts[i] && contacts[i].email) || '');
    }
    return row;
  });
  clearAndWrite_(SHEETS.TEAMS, TEAM_HEADERS, rows);
}

function readFreeAgents_() {
  return getDataRows_(SHEETS.FREE_AGENTS).filter(row => row[0] !== '').map(row => ({
    name: String(row[0] || ''),
    phone: String(row[1] || ''),
    email: String(row[2] || '')
  }));
}

function writeFreeAgents_(freeAgents) {
  const rows = (freeAgents || []).map(fa => [fa.name || '', fa.phone || '', fa.email || '']);
  clearAndWrite_(SHEETS.FREE_AGENTS, FREE_AGENT_HEADERS, rows);
}

function readScores_() {
  const scores = {};
  getDataRows_(SHEETS.SCORES).forEach(row => {
    const week = Number(row[0]);
    const teamId = Number(row[1]);
    if (!week || !teamId) return;
    if (!scores[week]) scores[week] = {};
    scores[week][teamId] = row.slice(2).map(v => Number(v) || 0);
  });
  return scores;
}

function writeScores_(scores) {
  const rows = [];
  Object.keys(scores || {}).sort((a, b) => Number(a) - Number(b)).forEach(week => {
    const weekScores = scores[week] || {};
    Object.keys(weekScores).sort((a, b) => Number(a) - Number(b)).forEach(teamId => {
      const values = weekScores[teamId] || [];
      const row = [Number(week), Number(teamId)];
      for (let i = 0; i < 6; i++) row.push(Number(values[i]) || 0);
      rows.push(row);
    });
  });
  clearAndWrite_(SHEETS.SCORES, SCORE_HEADERS, rows);
}

function readSchedule_() {
  const schedule = {};
  getDataRows_(SHEETS.SCHEDULE).forEach(row => {
    const bracket = row[0] ? String(row[0]) : '';
    const week = Number(row[1]);
    if (!bracket || !week) return;
    if (!schedule[bracket]) schedule[bracket] = [];
    schedule[bracket].push({
      week: week,
      teamA: Number(row[2]),
      teamB: Number(row[3]),
      playoff: row[4] === true || String(row[4]).toLowerCase() === 'true'
    });
  });
  return schedule;
}

function writeSchedule_(schedule) {
  const rows = [];
  Object.keys(schedule || {}).sort().forEach(bracket => {
    (schedule[bracket] || []).forEach(m => rows.push([bracket, Number(m.week), Number(m.teamA), Number(m.teamB), !!m.playoff]));
  });
  clearAndWrite_(SHEETS.SCHEDULE, SCHEDULE_HEADERS, rows);
}

function readQualSchedule_() {
  const qualSchedule = {};
  getDataRows_(SHEETS.QUAL_SCHEDULE).forEach(row => {
    const week = Number(row[0]);
    if (!week) return;
    if (!qualSchedule[week]) qualSchedule[week] = [];
    qualSchedule[week].push({ teamA: Number(row[1]), teamB: Number(row[2]) });
  });
  return qualSchedule;
}

function writeQualSchedule_(qualSchedule) {
  const rows = [];
  Object.keys(qualSchedule || {}).sort((a, b) => Number(a) - Number(b)).forEach(week => {
    (qualSchedule[week] || []).forEach(m => rows.push([Number(week), Number(m.teamA), Number(m.teamB)]));
  });
  clearAndWrite_(SHEETS.QUAL_SCHEDULE, QUAL_SCHEDULE_HEADERS, rows);
}

function readSubstitutes_() {
  const substitutes = {};
  getDataRows_(SHEETS.SUBSTITUTES).forEach(row => {
    const week = Number(row[0]);
    const teamId = Number(row[1]);
    const archerIdx = Number(row[2]);
    const name = row[3] ? String(row[3]) : '';
    if (!week || !teamId || name === '') return;
    if (!substitutes[week]) substitutes[week] = {};
    if (!substitutes[week][teamId]) substitutes[week][teamId] = {};
    substitutes[week][teamId][archerIdx] = name;
  });
  return substitutes;
}

function writeSubstitutes_(substitutes) {
  const rows = [];
  Object.keys(substitutes || {}).sort((a, b) => Number(a) - Number(b)).forEach(week => {
    const weekSubs = substitutes[week] || {};
    Object.keys(weekSubs).sort((a, b) => Number(a) - Number(b)).forEach(teamId => {
      const teamSubs = weekSubs[teamId] || {};
      Object.keys(teamSubs).sort((a, b) => Number(a) - Number(b)).forEach(archerIdx => {
        rows.push([Number(week), Number(teamId), Number(archerIdx), teamSubs[archerIdx]]);
      });
    });
  });
  clearAndWrite_(SHEETS.SUBSTITUTES, SUBSTITUTE_HEADERS, rows);
}

function readSubmittedWeeks_() {
  const submittedWeeks = {};
  getDataRows_(SHEETS.SUBMITTED_WEEKS).forEach(row => {
    const week = Number(row[0]);
    if (!week) return;
    submittedWeeks[week] = row[1] === true || String(row[1]).toLowerCase() === 'true';
  });
  return submittedWeeks;
}

function writeSubmittedWeeks_(submittedWeeks) {
  const rows = Object.keys(submittedWeeks || {})
    .sort((a, b) => Number(a) - Number(b))
    .map(week => [Number(week), !!submittedWeeks[week]]);
  clearAndWrite_(SHEETS.SUBMITTED_WEEKS, SUBMITTED_HEADERS, rows);
}
