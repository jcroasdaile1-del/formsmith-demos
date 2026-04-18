/**
 * Headless 5-season simulation for archery-league-demo.html
 * Extracts the JS from the HTML, runs it in a sandboxed context with DOM mocks,
 * then simulates 5 full seasons with varying team counts.
 */
import { readFileSync } from 'fs';
import vm from 'vm';

// ── Read and extract script ──────────────────────────────────────────
const html = readFileSync('./archery-league-demo.html', 'utf8');
const mainMatch = html.match(/<script>\s*const LOGO_URI[\s\S]*?<\/script>/);
if (!mainMatch) { console.error('Could not extract main script block'); process.exit(1); }
let scriptSrc = mainMatch[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

// Remove the DOMContentLoaded init block (it touches DOM heavily)
scriptSrc = scriptSrc.replace(
  /document\.addEventListener\('DOMContentLoaded'[\s\S]*?\n\}\);[\s]*$/,
  ''
);

// ── DOM mocks ────────────────────────────────────────────────────────
function makeFakeElement() {
  return {
    value: '', innerHTML: '', textContent: '', className: '', style: {},
    checked: false, disabled: false, src: '', alt: '',
    getAttribute: () => null,
    setAttribute: () => {},
    addEventListener: () => {},
    querySelector: () => makeFakeElement(),
    querySelectorAll: () => [],
    appendChild: () => {},
    insertBefore: () => {},
    insertAdjacentHTML: () => {},
    remove: () => {},
    closest: () => null,
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    children: [], childNodes: [],
    parentNode: null,
    nextSibling: null,
    previousSibling: null,
    get firstChild() { return null; },
    scrollIntoView: () => {},
    focus: () => {},
    select: () => {},
    click: () => {},
  };
}

const fakeDoc = {
  getElementById: () => makeFakeElement(),
  querySelector: () => makeFakeElement(),
  querySelectorAll: () => [],
  createElement: () => makeFakeElement(),
  body: {
    insertAdjacentHTML: () => {},
    appendChild: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    style: {},
  },
  documentElement: { style: {} },
  addEventListener: () => {},
};

const fakeWindow = {
  Chart: null,
  devicePixelRatio: 1,
  innerWidth: 1920,
  addEventListener: () => {},
  getComputedStyle: () => ({}),
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  scrollTo: () => {},
  open: () => ({}),
  XLSX: null,
};

const fakeLocalStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};

const fakeNavigator = { clipboard: { writeText: async () => {} }, userAgent: 'node-test' };

// ── Build sandbox ────────────────────────────────────────────────────
const sandbox = {
  document: fakeDoc,
  window: fakeWindow,
  localStorage: fakeLocalStorage,
  navigator: fakeNavigator,
  console,
  setTimeout: () => {},
  clearTimeout: () => {},
  setInterval: () => {},
  clearInterval: () => {},
  alert: () => {},
  confirm: () => true,
  prompt: () => '',
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

// ── Helpers ──────────────────────────────────────────────────────────
function run(code) {
  return vm.runInContext(code, sandbox);
}

function resetSeason() {
  run(`
    teams = [];
    scores = {};
    schedule = {};
    substitutes = {};
    submittedWeeks = {};
    freeAgents = [];
    config.bracketsLocked = false;
  `);
}

function addTeams(count) {
  const archersPerTeam = run('config.archersPerTeam') || 3;
  for (let i = 1; i <= count; i++) {
    const archers = [];
    const contacts = [];
    for (let a = 0; a < archersPerTeam; a++) {
      archers.push(`T${i}A${a + 1}`);
      contacts.push({ phone: `555-${i}${a}`, email: `t${i}a${a + 1}@test.com` });
    }
    run(`teams.push({
      id: ${i},
      name: '${i}',
      archers: ${JSON.stringify(archers)},
      contacts: ${JSON.stringify(contacts)},
      bracket: null
    })`);
  }
}

function enterScores(week, minScore = 180, maxScore = 280) {
  const teamCount = run('teams.length');
  const archersPerTeam = run('config.archersPerTeam') || 3;
  run(`if (!scores[${week}]) scores[${week}] = {};`);
  for (let t = 0; t < teamCount; t++) {
    const tid = run(`teams[${t}].id`);
    const isPhantom = run(`teams[${t}].phantom || false`);
    if (isPhantom) continue;
    const scoreArr = [];
    for (let a = 0; a < archersPerTeam; a++) {
      scoreArr.push(Math.round(minScore + Math.random() * (maxScore - minScore)));
    }
    run(`scores[${week}][${tid}] = ${JSON.stringify(scoreArr)};`);
  }
  run(`submittedWeeks[${week}] = true;`);
}

function assignBrackets() {
  const numBrackets = run('config.numBrackets');
  // Sort teams by qualifying average (snake split)
  run(`
    (function() {
      var ranked = teams.filter(function(t) { return !t.phantom; })
        .sort(function(a, b) { return getTeamQualAvg(b.id) - getTeamQualAvg(a.id); });
      var labels = 'ABCDEFGHIJ'.split('').slice(0, config.numBrackets);
      var n = ranked.length;
      var base = Math.floor(n / config.numBrackets);
      var remainder = n % config.numBrackets;
      var idx = 0;
      for (var d = 0; d < config.numBrackets; d++) {
        var count = base + (d < remainder ? 1 : 0);
        for (var c = 0; c < count; c++) {
          ranked[idx].bracket = labels[d];
          idx++;
        }
      }
      config.bracketsLocked = true;
    })();
  `);

  // Add phantom teams for odd brackets
  run(`
    (function() {
      var labels = 'ABCDEFGHIJ'.split('').slice(0, config.numBrackets);
      labels.forEach(function(bracket) {
        var bracketTeams = teams.filter(function(t) { return t.bracket === bracket && !t.phantom; });
        if (bracketTeams.length % 2 !== 0) {
          var phantomId = Math.max.apply(null, teams.map(function(t) { return t.id; })) + 1;
          teams.push({
            id: phantomId,
            name: 'BYE (' + bracket + ')',
            archers: ['BYE','BYE','BYE'],
            contacts: [],
            bracket: bracket,
            phantom: true
          });
        }
      });
    })();
  `);
}

function generateSchedule() {
  run('generateSchedule()');
}

function enterBracketScores(week) {
  // Enter scores only for teams that have matchups this week
  const archersPerTeam = run('config.archersPerTeam') || 3;
  const brackets = run('Object.keys(schedule)');
  for (const bracket of brackets) {
    const matchups = run(`schedule['${bracket}'].filter(function(m) { return m.week === ${week}; })`);
    for (const m of matchups) {
      for (const tid of [m.teamA, m.teamB]) {
        const isPhantom = run(`isPhantomTeam(${tid})`);
        if (isPhantom) continue;
        const scoreArr = [];
        for (let a = 0; a < archersPerTeam; a++) {
          scoreArr.push(Math.round(200 + Math.random() * 80));
        }
        run(`
          if (!scores[${week}]) scores[${week}] = {};
          scores[${week}][${tid}] = ${JSON.stringify(scoreArr)};
        `);
      }
    }
  }
  // Fill phantom scores
  run(`fillPhantomScores(${week})`);
  run(`submittedWeeks[${week}] = true;`);
}

// ── Run 5 Seasons ────────────────────────────────────────────────────
const seasonConfigs = [
  { teamCount: 8,  numBrackets: 2, qualWeeks: 2, bpWeeks: 8 },
  { teamCount: 15, numBrackets: 3, qualWeeks: 2, bpWeeks: 10 },
  { teamCount: 22, numBrackets: 4, qualWeeks: 2, bpWeeks: 11 },
  { teamCount: 31, numBrackets: 4, qualWeeks: 2, bpWeeks: 11 },
  { teamCount: 39, numBrackets: 4, qualWeeks: 2, bpWeeks: 11 },
];

const bugs = [];

for (let s = 0; s < seasonConfigs.length; s++) {
  const cfg = seasonConfigs[s];
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SEASON ${s + 1}: ${cfg.teamCount} teams, ${cfg.numBrackets} brackets, ${cfg.qualWeeks} qual + ${cfg.bpWeeks} bracket weeks`);
  console.log('═'.repeat(60));

  try {
    // RESET
    resetSeason();
    run(`config.numBrackets = ${cfg.numBrackets};`);
    run(`config.qualWeeks = ${cfg.qualWeeks};`);
    run(`config.bracketPlayWeeks = ${cfg.bpWeeks};`);
    console.log('  [OK] Season reset');

    // ADD TEAMS
    addTeams(cfg.teamCount);
    const teamLen = run('teams.length');
    if (teamLen !== cfg.teamCount) {
      bugs.push(`S${s+1}: Expected ${cfg.teamCount} teams, got ${teamLen}`);
    }
    console.log(`  [OK] Added ${teamLen} teams`);

    // Check getNextTeamNumber
    const nextNum = run('getNextTeamNumber()');
    if (nextNum !== cfg.teamCount + 1) {
      bugs.push(`S${s+1}: getNextTeamNumber() returned ${nextNum}, expected ${cfg.teamCount + 1}`);
    }
    console.log(`  [OK] getNextTeamNumber() = ${nextNum}`);

    // QUALIFYING WEEKS
    for (let w = 1; w <= cfg.qualWeeks; w++) {
      enterScores(w);
      console.log(`  [OK] Week ${w} qualifying scores entered`);
    }

    // Verify qualifying averages are non-zero
    let zeroAvgCount = 0;
    for (let t = 0; t < cfg.teamCount; t++) {
      const avg = run(`getTeamQualAvg(teams[${t}].id)`);
      if (avg === 0) zeroAvgCount++;
    }
    if (zeroAvgCount > 0) {
      bugs.push(`S${s+1}: ${zeroAvgCount} teams have zero qualifying average after ${cfg.qualWeeks} weeks`);
    }
    console.log(`  [OK] All ${cfg.teamCount} teams have qualifying averages (${zeroAvgCount} zero)`);

    // LOCK BRACKETS
    assignBrackets();
    const lockedTeams = run('teams.filter(function(t) { return !t.phantom && t.bracket; }).length');
    if (lockedTeams !== cfg.teamCount) {
      bugs.push(`S${s+1}: Only ${lockedTeams}/${cfg.teamCount} teams assigned to brackets`);
    }
    console.log(`  [OK] Brackets locked: ${lockedTeams} teams assigned`);

    // Check bracket distribution
    const bracketLabels = run(`[...new Set(teams.map(function(t) { return t.bracket; }).filter(Boolean))].sort()`);
    for (const b of bracketLabels) {
      const real = run(`teams.filter(function(t) { return t.bracket === '${b}' && !t.phantom; }).length`);
      const phantom = run(`teams.filter(function(t) { return t.bracket === '${b}' && t.phantom; }).length`);
      const total = real + phantom;
      if (total % 2 !== 0) {
        bugs.push(`S${s+1}: Bracket ${b} has ${total} teams (odd!) — ${real} real + ${phantom} phantom`);
      }
      console.log(`  [--] Bracket ${b}: ${real} real + ${phantom} phantom = ${total} total`);
    }

    // GENERATE SCHEDULE
    generateSchedule();
    const schedKeys = run('Object.keys(schedule)');
    if (schedKeys.length === 0) {
      bugs.push(`S${s+1}: Schedule generation produced no brackets`);
    }
    console.log(`  [OK] Schedule generated for brackets: ${schedKeys.join(', ')}`);

    // Verify schedule: each bracket has correct number of matchup weeks
    for (const b of schedKeys) {
      const weeks = run(`[...new Set(schedule['${b}'].map(function(m) { return m.week; }))].sort(function(a,b) { return a-b; })`);
      const expectedStart = cfg.qualWeeks + 1;
      const expectedEnd = cfg.qualWeeks + cfg.bpWeeks;
      if (weeks.length === 0) {
        bugs.push(`S${s+1}: Bracket ${b} has no matchup weeks in schedule`);
      } else if (weeks[0] !== expectedStart) {
        bugs.push(`S${s+1}: Bracket ${b} first matchup week is ${weeks[0]}, expected ${expectedStart}`);
      } else if (weeks[weeks.length - 1] !== expectedEnd) {
        bugs.push(`S${s+1}: Bracket ${b} last matchup week is ${weeks[weeks.length - 1]}, expected ${expectedEnd}`);
      }
      console.log(`  [--] Bracket ${b} schedule: weeks ${weeks[0]}–${weeks[weeks.length - 1]} (${weeks.length} weeks)`);
    }

    // BRACKET PLAY — enter scores for all bracket weeks
    const totalWeeks = cfg.qualWeeks + cfg.bpWeeks;
    for (let w = cfg.qualWeeks + 1; w <= totalWeeks; w++) {
      enterBracketScores(w);
    }
    console.log(`  [OK] Bracket play scores entered for weeks ${cfg.qualWeeks + 1}–${totalWeeks}`);

    // Verify match results (check all matchups produce a result)
    let nullResults = 0;
    let totalMatchups = 0;
    for (const b of schedKeys) {
      const matchups = run(`schedule['${b}']`);
      for (const m of matchups) {
        totalMatchups++;
        const result = run(`calcMatchResult(${m.teamA}, ${m.teamB}, ${m.week})`);
        if (!result) nullResults++;
      }
    }
    if (nullResults > 0) {
      bugs.push(`S${s+1}: ${nullResults}/${totalMatchups} matchups returned null result`);
    }
    console.log(`  [OK] ${totalMatchups} matchups validated, ${nullResults} null results`);

    // Verify bracket standings
    for (const b of schedKeys) {
      const standings = run(`calcBracketStandings('${b}', ${totalWeeks})`);
      if (!standings || standings.length === 0) {
        bugs.push(`S${s+1}: Bracket ${b} standings are empty`);
      } else {
        const leader = standings[0];
        console.log(`  [--] Bracket ${b} leader: Team ${leader.name} (${leader.wins}W–${leader.losses}L)`);
        // Check no team has negative wins/losses
        for (const st of standings) {
          if (st.wins < 0 || st.losses < 0) {
            bugs.push(`S${s+1}: Bracket ${b}, Team ${st.name} has negative record: ${st.wins}W–${st.losses}L`);
          }
        }
      }
    }

    // Test getTotalSeasonWeeks
    const tsw = run('getTotalSeasonWeeks()');
    if (tsw !== totalWeeks) {
      bugs.push(`S${s+1}: getTotalSeasonWeeks() = ${tsw}, expected ${totalWeeks}`);
    }
    console.log(`  [OK] getTotalSeasonWeeks() = ${tsw}`);

    // Test handicap sanity: check for unreasonable handicaps
    let maxHcp = 0;
    for (const b of schedKeys) {
      const matchups = run(`schedule['${b}'].filter(function(m) { return m.week === ${cfg.qualWeeks + 3}; })`);
      for (const m of matchups) {
        const result = run(`calcMatchResult(${m.teamA}, ${m.teamB}, ${m.week})`);
        if (result) {
          const hcp = Math.max(result.hcpA, result.hcpB);
          if (hcp > maxHcp) maxHcp = hcp;
          if (hcp > 200) {
            bugs.push(`S${s+1}: Unreasonable handicap ${hcp} in week ${m.week}, ${m.teamA} vs ${m.teamB}`);
          }
        }
      }
    }
    console.log(`  [OK] Max handicap observed: ${maxHcp}`);

    // Test free agents flow
    run(`freeAgents = [
      { name: 'FA1', phone: '555-9901', email: 'fa1@test.com' },
      { name: 'FA2', phone: '555-9902', email: 'fa2@test.com' },
      { name: 'FA3', phone: '555-9903', email: 'fa3@test.com' }
    ];`);
    run('autoAssignFreeAgents()');
    const remainingFA = run('freeAgents.length');
    if (remainingFA !== 0) {
      bugs.push(`S${s+1}: ${remainingFA} free agents remaining after autoAssign`);
    }
    const newTeamCount = run('teams.filter(function(t) { return !t.phantom; }).length');
    console.log(`  [OK] Free agents assigned. Teams now: ${newTeamCount} (was ${cfg.teamCount})`);

    // Verify getTeamWeekScore works for all teams/weeks
    let badScores = 0;
    for (let w = 1; w <= totalWeeks; w++) {
      for (let t = 0; t < cfg.teamCount; t++) {
        const tid = run(`teams[${t}].id`);
        const score = run(`getTeamWeekScore(${tid}, ${w})`);
        if (typeof score !== 'number' || isNaN(score)) {
          badScores++;
        }
      }
    }
    if (badScores > 0) {
      bugs.push(`S${s+1}: ${badScores} invalid getTeamWeekScore() returns`);
    }
    console.log(`  [OK] getTeamWeekScore() validated across all weeks`);

    console.log(`  ✓ Season ${s + 1} completed successfully`);

  } catch (err) {
    bugs.push(`S${s+1}: CRASH — ${err.message}`);
    console.error(`  ✗ Season ${s + 1} CRASHED: ${err.message}`);
    console.error(err.stack);
  }
}

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('BUG REPORT');
console.log('═'.repeat(60));
if (bugs.length === 0) {
  console.log('No bugs found across all 5 seasons!');
} else {
  console.log(`Found ${bugs.length} issue(s):`);
  bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
}
console.log();
