/**
 * Headless import test — runs 5 import scenarios against the updated import logic.
 * Tests: auto-mapping, format detection, team grouping, free agent detection, edge cases.
 */
import { readFileSync } from 'fs';
import vm from 'vm';

// ── Extract JS from HTML ─────────────────────────────────────────────
const html = readFileSync('./archery-league-demo.html', 'utf8');
const mainMatch = html.match(/<script>\s*const LOGO_URI[\s\S]*?<\/script>/);
if (!mainMatch) { console.error('Could not extract main script block'); process.exit(1); }
let scriptSrc = mainMatch[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
scriptSrc = scriptSrc.replace(
  /document\.addEventListener\('DOMContentLoaded'[\s\S]*?\n\}\);[\s]*$/,
  ''
);

// ── DOM mocks ────────────────────────────────────────────────────────
function makeFakeElement() {
  return {
    value: '', innerHTML: '', textContent: '', className: '', style: {},
    checked: false, disabled: false, src: '', alt: '',
    getAttribute: () => null, setAttribute: () => {},
    addEventListener: () => {},
    querySelector: () => makeFakeElement(),
    querySelectorAll: () => [],
    appendChild: () => {}, insertBefore: () => {},
    insertAdjacentHTML: () => {}, remove: () => {},
    closest: () => null,
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    children: [], childNodes: [], parentNode: null,
    get firstChild() { return null; },
    scrollIntoView: () => {}, focus: () => {}, select: () => {}, click: () => {},
  };
}

const sandbox = {
  document: {
    getElementById: () => makeFakeElement(),
    querySelector: () => makeFakeElement(),
    querySelectorAll: () => [],
    createElement: () => makeFakeElement(),
    body: { insertAdjacentHTML: () => {}, appendChild: () => {}, classList: { add:()=>{}, remove:()=>{}, toggle:()=>{}, contains:()=>false }, style: {} },
    documentElement: { style: {} },
    addEventListener: () => {},
  },
  window: { Chart: null, devicePixelRatio: 1, innerWidth: 1920, addEventListener: () => {}, getComputedStyle: () => ({}), matchMedia: () => ({ matches: false, addEventListener: () => {} }), scrollTo: () => {}, open: () => ({}), XLSX: null },
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k,v) { this._d[k]=String(v); }, removeItem(k) { delete this._d[k]; } },
  navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node-test' },
  console, setTimeout: ()=>{}, clearTimeout: ()=>{}, setInterval: ()=>{}, clearInterval: ()=>{},
  alert: ()=>{}, confirm: ()=>true, prompt: ()=>'',
  parseInt, parseFloat, isNaN, isFinite,
  Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Error,
  Map, Set, Symbol, Promise, Proxy, Reflect,
  encodeURIComponent, decodeURIComponent,
  btoa: (s) => Buffer.from(s).toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString(),
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(scriptSrc, sandbox, { filename: 'archery-league-demo.js', timeout: 10000 });
} catch (e) {
  console.error('Script evaluation error:', e.message);
  process.exit(1);
}

function run(code) { return vm.runInContext(code, sandbox); }

function reset() {
  run(`
    teams = [];
    scores = {};
    schedule = {};
    substitutes = {};
    submittedWeeks = {};
    freeAgents = [];
    config.bracketsLocked = false;
    importHeaders = [];
    importRows = [];
    importMapping = {};
    previewTeams = [];
    previewFreeAgents = [];
  `);
}

// ── Helper: simulate the full import pipeline ────────────────────────
function simulateImport(headers, rows) {
  // Step 1: Set headers and rows (like handleImportFile does)
  run(`importHeaders = ${JSON.stringify(headers)};`);
  run(`importRows = ${JSON.stringify(rows)};`);

  // Step 2: Auto-map (like buildImportMapping does)
  run(`
    importMapping = {};
    importHeaders.forEach(function(h, i) {
      importMapping[i] = autoMatchImport(h);
    });
  `);

  // Step 3: Build preview (like goImportStep(3))
  run('buildImportPreview()');

  // Step 4: Do import (like doTeamImport)
  run('doTeamImport()');
}

// ── Read the sample CSV ──────────────────────────────────────────────
const csvText = readFileSync('./sample-league-import.csv', 'utf8');
const csvLines = csvText.split(/\r?\n/).filter(l => l.trim());
const csvHeaders = csvLines[0].split(',').map(s => s.trim());
const csvRows = csvLines.slice(1).map(l => {
  // Simple CSV parse (no quoted fields needed for this data)
  return l.split(',').map(s => s.trim());
});

const bugs = [];

// ══════════════════════════════════════════════════════════════════════
// TEST 1: Full CSV import — Name, Phone, Email, Team Number
// ══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('TEST 1: Full sample CSV import (40 teams + 3 free agents)');
console.log('═'.repeat(60));
try {
  reset();

  // Verify auto-mapping
  run(`importHeaders = ${JSON.stringify(csvHeaders)};`);
  run(`importMapping = {};
    importHeaders.forEach(function(h, i) {
      importMapping[i] = autoMatchImport(h);
    });
  `);
  const mapping = run('JSON.parse(JSON.stringify(importMapping))');
  console.log('  Auto-mapping:', JSON.stringify(mapping));

  if (mapping['0'] !== 'archer1') bugs.push('T1: "Name" mapped to ' + mapping['0'] + ', expected archer1');
  if (mapping['1'] !== 'phone1') bugs.push('T1: "Phone" mapped to ' + mapping['1'] + ', expected phone1');
  if (mapping['2'] !== 'email1') bugs.push('T1: "Email" mapped to ' + mapping['2'] + ', expected email1');
  if (mapping['3'] !== 'teamName') bugs.push('T1: "Team Number" mapped to ' + mapping['3'] + ', expected teamName');

  // Build preview
  run(`importRows = ${JSON.stringify(csvRows)};`);
  run('buildImportPreview()');

  const teamCount = run('previewTeams.length');
  const faCount = run('previewFreeAgents.length');
  console.log(`  Preview: ${teamCount} teams, ${faCount} free agents`);

  if (teamCount !== 40) bugs.push(`T1: Expected 40 teams, got ${teamCount}`);
  if (faCount !== 3) bugs.push(`T1: Expected 3 free agents, got ${faCount}`);

  // Check team 1 has 3 archers
  const t1 = run('previewTeams[0]');
  if (t1.name !== '1') bugs.push(`T1: First team name is "${t1.name}", expected "1"`);
  if (t1.archers.length !== 3) bugs.push(`T1: Team 1 has ${t1.archers.length} archers, expected 3`);
  if (t1.archers[0] !== 'Dave Grisar') bugs.push(`T1: Team 1 archer 1 is "${t1.archers[0]}", expected "Dave Grisar"`);
  console.log(`  Team 1: ${t1.name} — ${t1.archers.join(', ')}`);

  // Check contacts carried over
  if (t1.contacts[0].phone !== '920-555-0101') bugs.push(`T1: Team 1 archer 1 phone is "${t1.contacts[0].phone}"`);
  if (t1.contacts[0].email !== 'dgrisar@example.com') bugs.push(`T1: Team 1 archer 1 email is "${t1.contacts[0].email}"`);

  // Check last team
  const t40 = run('previewTeams[39]');
  if (t40.name !== '40') bugs.push(`T1: Last team name is "${t40.name}", expected "40"`);
  if (t40.archers.length !== 3) bugs.push(`T1: Team 40 has ${t40.archers.length} archers, expected 3`);
  console.log(`  Team 40: ${t40.name} — ${t40.archers.join(', ')}`);

  // Check free agents
  const fa1 = run('previewFreeAgents[0]');
  if (fa1.name !== 'Bob Butler') bugs.push(`T1: First free agent is "${fa1.name}", expected "Bob Butler"`);
  console.log(`  Free agents: ${faCount} — first: ${fa1.name}`);

  // Do the actual import
  run('doTeamImport()');
  const finalTeams = run('teams.length');
  const finalFA = run('freeAgents.length');
  if (finalTeams !== 40) bugs.push(`T1: After import, teams.length = ${finalTeams}, expected 40`);
  if (finalFA !== 3) bugs.push(`T1: After import, freeAgents.length = ${finalFA}, expected 3`);
  console.log(`  ✓ Import complete: ${finalTeams} teams, ${finalFA} free agents in app`);

  // Verify teams 12, 25, 38 have 2 archers
  const t12 = run('teams.find(function(t){return t.name==="12";})');
  const t25 = run('teams.find(function(t){return t.name==="25";})');
  const t38 = run('teams.find(function(t){return t.name==="38";})');
  if (t12.archers.length !== 2) bugs.push(`T1: Team 12 has ${t12.archers.length} archers, expected 2`);
  if (t25.archers.length !== 2) bugs.push(`T1: Team 25 has ${t25.archers.length} archers, expected 2`);
  if (t38.archers.length !== 2) bugs.push(`T1: Team 38 has ${t38.archers.length} archers, expected 2`);
  console.log(`  Teams 12/25/38 archers: ${t12.archers.length}/${t25.archers.length}/${t38.archers.length} (all should be 2)`);

  // Verify free agents include the 3 removed archers
  const faNames = run('freeAgents.map(function(f){return f.name;})').sort();
  ['Bob Butler','Sam Henrich','Don Lange'].forEach(function(n){
    if (!faNames.includes(n)) bugs.push(`T1: Free agent "${n}" not found`);
  });
  if (faNames.length !== 3) bugs.push(`T1: Expected 3 free agents total, got ${faNames.length}`);
  console.log(`  Free agents: ${faNames.join(', ')}`);

} catch (e) {
  bugs.push(`T1: CRASH — ${e.message}`);
  console.error(`  ✗ CRASHED: ${e.message}\n${e.stack}`);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 2: Subset import — 10 teams, 2 free agents
// ══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('TEST 2: Partial import (10 teams + 2 free agents)');
console.log('═'.repeat(60));
try {
  reset();
  const subset = csvRows.filter(r => {
    const tn = r[3];
    if (!tn) return true; // free agents — take first 2
    const n = parseInt(tn);
    return n >= 1 && n <= 10;
  });
  // Limit free agents to 2
  let fasSeen = 0;
  const filteredSubset = subset.filter(r => {
    if (!r[3]) { fasSeen++; return fasSeen <= 2; }
    return true;
  });

  simulateImport(csvHeaders, filteredSubset);
  const tc = run('teams.length');
  const fc = run('freeAgents.length');
  if (tc !== 10) bugs.push(`T2: Expected 10 teams, got ${tc}`);
  if (fc !== 2) bugs.push(`T2: Expected 2 free agents, got ${fc}`);

  // Verify each team has 3 archers
  let badTeams = 0;
  for (let i = 0; i < tc; i++) {
    const ac = run(`teams[${i}].archers.length`);
    if (ac !== 3) { badTeams++; bugs.push(`T2: Team ${i+1} has ${ac} archers`); }
  }
  console.log(`  ✓ ${tc} teams (${badTeams} with wrong archer count), ${fc} free agents`);

} catch (e) {
  bugs.push(`T2: CRASH — ${e.message}`);
  console.error(`  ✗ CRASHED: ${e.message}`);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 3: All free agents (no team numbers at all)
// ══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('TEST 3: All free agents (no team numbers)');
console.log('═'.repeat(60));
try {
  reset();
  const freeOnly = [
    ['Alice Smith', '555-0001', 'alice@test.com', ''],
    ['Bob Jones', '555-0002', '', ''],
    ['Carol White', '', 'carol@test.com', ''],
    ['Dan Brown', '555-0004', 'dan@test.com', ''],
    ['Eve Davis', '', '', ''],
  ];
  simulateImport(['Name', 'Phone', 'Email', 'Team Number'], freeOnly);
  const tc = run('teams.length');
  const fc = run('freeAgents.length');
  if (tc !== 0) bugs.push(`T3: Expected 0 teams, got ${tc}`);
  if (fc !== 5) bugs.push(`T3: Expected 5 free agents, got ${fc}`);

  // Verify contact data
  const fa0 = run('freeAgents[0]');
  if (fa0.name !== 'Alice Smith') bugs.push(`T3: FA0 name is "${fa0.name}"`);
  if (fa0.phone !== '555-0001') bugs.push(`T3: FA0 phone is "${fa0.phone}"`);
  if (fa0.email !== 'alice@test.com') bugs.push(`T3: FA0 email is "${fa0.email}"`);
  console.log(`  ✓ ${tc} teams, ${fc} free agents — all went to free agent pool`);

} catch (e) {
  bugs.push(`T3: CRASH — ${e.message}`);
  console.error(`  ✗ CRASHED: ${e.message}`);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 4: Mixed — teams with different archer counts + free agents
// ══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('TEST 4: Non-uniform teams (2-4 archers per team) + free agents');
console.log('═'.repeat(60));
try {
  reset();
  const mixedRows = [
    ['Archer A1', '555-1001', 'a1@t.com', '1'],
    ['Archer A2', '555-1002', '', '1'],
    ['Archer B1', '555-2001', '', '2'],
    ['Archer B2', '', '', '2'],
    ['Archer B3', '555-2003', 'b3@t.com', '2'],
    ['Archer B4', '555-2004', '', '2'],
    ['Archer C1', '555-3001', 'c1@t.com', '3'],
    ['Archer C2', '', '', '3'],
    ['Archer C3', '555-3003', '', '3'],
    ['Free1', '555-9001', 'free1@t.com', ''],
    ['Free2', '', 'free2@t.com', ''],
  ];
  simulateImport(['Name', 'Phone Number', 'Email', 'Team Number'], mixedRows);
  const tc = run('teams.length');
  const fc = run('freeAgents.length');
  if (tc !== 3) bugs.push(`T4: Expected 3 teams, got ${tc}`);
  if (fc !== 2) bugs.push(`T4: Expected 2 free agents, got ${fc}`);

  const t1archers = run('teams[0].archers.length');
  const t2archers = run('teams[1].archers.length');
  const t3archers = run('teams[2].archers.length');
  if (t1archers !== 2) bugs.push(`T4: Team 1 has ${t1archers} archers, expected 2`);
  if (t2archers !== 4) bugs.push(`T4: Team 2 has ${t2archers} archers, expected 4`);
  if (t3archers !== 3) bugs.push(`T4: Team 3 has ${t3archers} archers, expected 3`);
  console.log(`  ✓ ${tc} teams (${t1archers}, ${t2archers}, ${t3archers} archers), ${fc} free agents`);

  // Verify "Phone Number" header auto-mapped correctly
  run(`importHeaders = ['Name', 'Phone Number', 'Email', 'Team Number'];`);
  run(`importMapping = {}; importHeaders.forEach(function(h, i) { importMapping[i] = autoMatchImport(h); });`);
  const m = run('JSON.parse(JSON.stringify(importMapping))');
  if (m['1'] !== 'phone1') bugs.push(`T4: "Phone Number" mapped to ${m['1']}, expected phone1`);
  console.log(`  "Phone Number" mapped to: ${m['1']}`);

} catch (e) {
  bugs.push(`T4: CRASH — ${e.message}`);
  console.error(`  ✗ CRASHED: ${e.message}`);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 5: Double import — import CSV, then import more data on top
// ══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('TEST 5: Double import (add more teams to existing data)');
console.log('═'.repeat(60));
try {
  reset();
  // First import: 5 teams
  const batch1 = csvRows.filter(r => {
    const tn = r[3];
    if (!tn) return false;
    return parseInt(tn) >= 1 && parseInt(tn) <= 5;
  });
  simulateImport(csvHeaders, batch1);
  const tc1 = run('teams.length');
  const fa1 = run('freeAgents.length');
  console.log(`  After batch 1: ${tc1} teams, ${fa1} free agents`);

  // Second import: 5 more teams + 3 free agents
  const batch2rows = [
    ['New Archer 1', '555-5001', 'new1@t.com', '6'],
    ['New Archer 2', '555-5002', '', '6'],
    ['New Archer 3', '', '', '6'],
    ['New Archer 4', '555-5004', '', '7'],
    ['New Archer 5', '', 'new5@t.com', '7'],
    ['New Archer 6', '555-5006', '', '7'],
    ['New Archer 7', '555-5007', '', '8'],
    ['New Archer 8', '', '', '8'],
    ['New Archer 9', '555-5009', 'new9@t.com', '8'],
    ['New Archer 10', '555-5010', '', '9'],
    ['New Archer 11', '', '', '9'],
    ['New Archer 12', '555-5012', '', '9'],
    ['New Archer 13', '555-5013', 'new13@t.com', '10'],
    ['New Archer 14', '', '', '10'],
    ['New Archer 15', '555-5015', '', '10'],
    ['FreeX', '555-9100', 'fx@t.com', ''],
    ['FreeY', '', 'fy@t.com', ''],
    ['FreeZ', '555-9300', '', ''],
  ];
  simulateImport(['Name', 'Phone', 'Email', 'Team Number'], batch2rows);
  const tc2 = run('teams.length');
  const fa2 = run('freeAgents.length');
  if (tc2 !== 10) bugs.push(`T5: Expected 10 total teams after double import, got ${tc2}`);
  if (fa2 !== 3) bugs.push(`T5: Expected 3 free agents, got ${fa2}`);

  // Check IDs are unique
  const ids = run('teams.map(function(t) { return t.id; })');
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) bugs.push(`T5: Duplicate team IDs found!`);

  // Check team names don't collide (batch1 had teams 1-5, batch2 had teams 6-10)
  const names = run('teams.map(function(t) { return t.name; })');
  console.log(`  ✓ After batch 2: ${tc2} teams, ${fa2} free agents, ${uniqueIds.size} unique IDs`);
  console.log(`  Team names: ${names.join(', ')}`);

  // Verify getNextTeamNumber works after import
  const nextNum = run('getNextTeamNumber()');
  if (nextNum !== 11) bugs.push(`T5: getNextTeamNumber() = ${nextNum}, expected 11`);
  console.log(`  getNextTeamNumber() = ${nextNum}`);

} catch (e) {
  bugs.push(`T5: CRASH — ${e.message}`);
  console.error(`  ✗ CRASHED: ${e.message}`);
}

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('IMPORT TEST BUG REPORT');
console.log('═'.repeat(60));
if (bugs.length === 0) {
  console.log('✅ No bugs found across all 5 import tests!');
} else {
  console.log(`Found ${bugs.length} issue(s):`);
  bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
}
console.log();
