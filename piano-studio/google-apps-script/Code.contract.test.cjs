const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE_PATH = path.join(__dirname, 'Code.gs');
const RESET_TOKEN = 'RESET HARMONY HOUSE';
const COLLECTION_KEYS = [
  'students',
  'guardians',
  'studentGuardians',
  'recurringSchedules',
  'lessons',
  'repertoire',
  'assignments',
  'tuitionCharges',
  'payments',
  'makeupCredits',
  'inquiries',
  'recitals',
  'recitalParticipants',
  'expenses',
  'activity'
];

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatDate(dateValue, timeZone, format) {
  const date = new Date(dateValue);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'Etc/UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  if (format === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (format === 'HH:mm') return `${parts.hour}:${parts.minute}`;
  if (format === 'yyyyMMdd-HHmmss') {
    return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
  }
  throw new Error(`Unsupported mock date format: ${format}`);
}

class FakeRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  getValues() {
    return this.#matrixFrom(this.sheet.values);
  }

  getFormulas() {
    return this.#matrixFrom(this.sheet.formulas);
  }

  setValues(rows) {
    assert.equal(rows.length, this.rowCount, 'mock setValues row count');
    rows.forEach((row) => assert.equal(row.length, this.columnCount, 'mock setValues column count'));
    if (this.sheet.failNextSetValues > 0) {
      this.sheet.failNextSetValues -= 1;
      throw new Error(`Injected write failure on ${this.sheet.name}`);
    }
    this.sheet.ensureCell(this.row + this.rowCount - 1, this.column + this.columnCount - 1);
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        const value = rows[rowOffset][columnOffset];
        const rowIndex = this.row - 1 + rowOffset;
        const columnIndex = this.column - 1 + columnOffset;
        if (typeof value === 'string' && value.startsWith('=')) {
          this.sheet.formulas[rowIndex][columnIndex] = value;
          this.sheet.values[rowIndex][columnIndex] = '#FORMULA';
        } else {
          this.sheet.formulas[rowIndex][columnIndex] = '';
          this.sheet.values[rowIndex][columnIndex] = value;
        }
      }
    }
    return this;
  }

  setValue(value) {
    return this.setValues([[value]]);
  }

  clearContent() {
    this.sheet.ensureCell(this.row + this.rowCount - 1, this.column + this.columnCount - 1);
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        const rowIndex = this.row - 1 + rowOffset;
        const columnIndex = this.column - 1 + columnOffset;
        this.sheet.values[rowIndex][columnIndex] = '';
        this.sheet.formulas[rowIndex][columnIndex] = '';
      }
    }
    return this;
  }

  setFontWeight() {
    return this;
  }

  #matrixFrom(source) {
    const output = [];
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      const row = [];
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        row.push(
          source[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ''
        );
      }
      output.push(row);
    }
    return output;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.values = [];
    this.formulas = [];
    this.maxRows = 1000;
    this.maxColumns = 26;
    this.frozenRows = 0;
    this.failNextSetValues = 0;
  }

  ensureCell(row, column) {
    while (this.values.length < row) {
      this.values.push([]);
      this.formulas.push([]);
    }
    for (let rowIndex = 0; rowIndex < this.values.length; rowIndex += 1) {
      while (this.values[rowIndex].length < column) this.values[rowIndex].push('');
      while (this.formulas[rowIndex].length < column) this.formulas[rowIndex].push('');
    }
    this.maxRows = Math.max(this.maxRows, row);
    this.maxColumns = Math.max(this.maxColumns, column);
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }

  getLastRow() {
    let last = 0;
    for (let row = 0; row < this.values.length; row += 1) {
      const hasValue = (this.values[row] || []).some((value) => value !== '' && value != null);
      const hasFormula = (this.formulas[row] || []).some(Boolean);
      if (hasValue || hasFormula) last = row + 1;
    }
    return last;
  }

  getLastColumn() {
    let last = 0;
    const rows = Math.max(this.values.length, this.formulas.length);
    for (let row = 0; row < rows; row += 1) {
      const width = Math.max(this.values[row]?.length || 0, this.formulas[row]?.length || 0);
      for (let column = 0; column < width; column += 1) {
        if ((this.values[row]?.[column] !== '' && this.values[row]?.[column] != null) ||
            this.formulas[row]?.[column]) {
          last = Math.max(last, column + 1);
        }
      }
    }
    return last;
  }

  getMaxRows() {
    return this.maxRows;
  }

  getMaxColumns() {
    return this.maxColumns;
  }

  insertRowsAfter(afterRow, count) {
    this.maxRows = Math.max(this.maxRows, afterRow + count);
  }

  insertColumnsAfter(afterColumn, count) {
    this.maxColumns = Math.max(this.maxColumns, afterColumn + count);
  }

  setFrozenRows(count) {
    this.frozenRows = count;
  }

  deleteRow(row) {
    this.values.splice(row - 1, 1);
    this.formulas.splice(row - 1, 1);
  }
}

class FakeSpreadsheet {
  constructor(id = 'spreadsheet-test-id') {
    this.id = id;
    this.sheets = new Map();
  }

  getId() {
    return this.id;
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    if (this.sheets.has(name)) throw new Error(`Sheet already exists: ${name}`);
    const sheet = new FakeSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function baseState() {
  const state = {
    settings: {
      studioName: 'Contract Test Studio',
      ownerName: 'Test Teacher',
      email: 'teacher@example.com',
      phone: '555-0100',
      address: '1 Test Way',
      targetWeeklySlots: 20,
      defaultLessonLengths: [30, 45, 60],
      defaultTuition: 160,
      teachingDays: ['Monday', 'Tuesday'],
      openTime: '09:00',
      closeTime: '20:00',
      currency: 'USD',
      timezone: 'America/Chicago',
      cancellationPolicy: 'Twenty-four hours notice.',
      studioClosures: [],
      appearance: { theme: 'system' }
    }
  };
  COLLECTION_KEYS.forEach((key) => {
    state[key] = [];
  });
  state.students = [
    {
      id: 'stu-a',
      firstName: 'Avery',
      lastName: 'Adult',
      studentType: 'Adult',
      status: 'Active',
      tuitionAmount: 160,
      billingModel: 'Monthly tuition'
    },
    {
      id: 'stu-b',
      firstName: 'Blair',
      lastName: 'Brown',
      studentType: 'Adult',
      status: 'Active',
      tuitionAmount: 160,
      billingModel: 'Monthly tuition'
    },
    {
      id: 'stu-c',
      firstName: 'Casey',
      lastName: 'Clark',
      studentType: 'Adult',
      status: 'Active',
      tuitionAmount: 160,
      billingModel: 'Monthly tuition'
    },
    {
      id: 'stu-m',
      firstName: 'Mina',
      lastName: 'Minor',
      studentType: 'Minor',
      status: 'Active',
      tuitionAmount: 160,
      billingModel: 'Monthly tuition'
    }
  ];
  state.guardians = [
    {
      id: 'gua-one',
      familyKey: 'minor',
      firstName: 'Pat',
      lastName: 'Minor',
      email: 'pat@example.com',
      phone: '555-0101',
      preferredContact: 'Email',
      notes: 'Primary household contact.'
    }
  ];
  state.studentGuardians = [
    {
      id: 'sgr-one',
      studentId: 'stu-m',
      guardianId: 'gua-one',
      relationship: 'Parent',
      primaryContact: true,
      billingContact: true,
      notes: 'Pickup authorized.'
    }
  ];
  state.recurringSchedules = [
    {
      id: 'sch-a',
      studentId: 'stu-a',
      day: 'Monday',
      startTime: '10:00',
      duration: 30,
      location: 'In studio',
      active: true,
      effectiveFrom: '2026-01-01'
    },
    {
      id: 'sch-b',
      studentId: 'stu-b',
      day: 'Monday',
      startTime: '10:30',
      duration: 30,
      location: 'In studio',
      active: true,
      effectiveFrom: '2026-01-01'
    }
  ];
  state.lessons = [
    {
      id: 'les-occurrence',
      studentId: 'stu-a',
      sourceScheduleId: 'sch-a',
      date: '2026-08-03',
      startTime: '10:00',
      duration: 30,
      type: 'Regular',
      status: 'Scheduled',
      location: 'In studio'
    },
    {
      id: 'les-completed',
      studentId: 'stu-a',
      date: '2026-07-06',
      startTime: '10:00',
      duration: 30,
      type: 'Regular',
      status: 'Completed',
      location: 'In studio',
      summary: 'Permanent lesson notes.',
      completedAt: '2026-07-06T16:00:00.000Z'
    },
    {
      id: 'les-trial',
      inquiryId: 'inq-trial',
      date: '2026-07-07',
      startTime: '11:00',
      duration: 30,
      type: 'Trial',
      status: 'Completed',
      location: 'In studio',
      summary: 'Completed trial assessment.',
      completedAt: '2026-07-07T17:00:00.000Z'
    },
    {
      id: 'les-trial-scheduled',
      inquiryId: 'inq-trial-scheduled',
      date: '2026-08-05',
      startTime: '13:00',
      duration: 30,
      type: 'Trial',
      status: 'Scheduled',
      location: 'In studio'
    },
    {
      id: 'les-cancelled',
      studentId: 'stu-a',
      date: '2026-07-08',
      startTime: '10:00',
      duration: 30,
      type: 'Regular',
      status: 'Student Cancelled',
      location: 'In studio',
      cancellationReason: 'Eligible absence.'
    }
  ];
  state.repertoire = [
    {
      id: 'rep-completed',
      studentId: 'stu-a',
      title: 'Archive Song',
      composer: 'Historic Composer',
      collection: 'Completed works',
      dateAssigned: '2026-01-01',
      status: 'Completed',
      dateCompleted: '2026-06-01',
      lastWorkedOn: '2026-06-01',
      notes: 'Preserve this history.'
    },
    {
      id: 'rep-current-a',
      studentId: 'stu-a',
      title: 'Current Song',
      composer: 'Living Composer',
      collection: 'Current works',
      dateAssigned: '2026-07-01',
      status: 'Learning',
      lastWorkedOn: '2026-07-20'
    },
    {
      id: 'rep-current-b',
      studentId: 'stu-b',
      title: 'Recital Song',
      composer: 'Program Composer',
      collection: 'Current works',
      dateAssigned: '2026-07-01',
      status: 'Performance Ready',
      lastWorkedOn: '2026-07-20'
    }
  ];
  state.assignments = [
    {
      id: 'asn-current',
      studentId: 'stu-a',
      lessonId: 'les-completed',
      repertoireId: 'rep-current-a',
      dateAssigned: '2026-07-06',
      instructions: 'Practice slowly.',
      status: 'Current'
    }
  ];
  state.makeupCredits = [
    {
      id: 'mkp-owed',
      studentId: 'stu-a',
      lessonId: 'les-cancelled',
      createdDate: '2026-07-08',
      reason: 'Eligible absence.',
      status: 'Owed'
    }
  ];
  state.inquiries = [
    {
      id: 'inq-trial',
      prospectName: 'Taylor Trial',
      age: 22,
      email: 'taylor@example.com',
      dateReceived: '2026-07-01',
      status: 'Trial Completed',
      trialLessonId: 'les-trial'
    },
    {
      id: 'inq-trial-scheduled',
      prospectName: 'Sam Scheduled',
      age: 12,
      guardianName: 'Gale Scheduled',
      email: 'gale@example.com',
      dateReceived: '2026-07-10',
      status: 'Trial Scheduled',
      trialLessonId: 'les-trial-scheduled'
    }
  ];
  state.recitals = [
    {
      id: 'rct-completed',
      name: 'Past Recital',
      date: '2026-06-01',
      time: '15:00',
      location: 'Hall',
      status: 'Completed'
    },
    {
      id: 'rct-planning',
      name: 'Future Recital',
      date: '2026-10-01',
      time: '15:00',
      location: 'Hall',
      status: 'Planning'
    }
  ];
  state.recitalParticipants = [
    {
      id: 'rcp-completed',
      recitalId: 'rct-completed',
      studentId: 'stu-a',
      repertoireId: 'rep-completed',
      studentNameSnapshot: 'Avery Adult',
      pieceTitleSnapshot: 'Archive Song',
      composerSnapshot: 'Historic Composer',
      readiness: 'Performance Ready',
      order: 1
    },
    {
      id: 'rcp-planning',
      recitalId: 'rct-planning',
      studentId: 'stu-b',
      repertoireId: 'rep-current-b',
      readiness: 'Performance Ready',
      order: 1
    }
  ];
  return state;
}

function createHarness() {
  const spreadsheet = new FakeSpreadsheet();
  const properties = new Map();
  const runtime = {
    activeSpreadsheet: spreadsheet,
    openByIdCalls: 0,
    uuidCounter: 0
  };
  const scriptProperties = {
    getProperty(key) {
      return properties.get(key) || null;
    },
    setProperty(key, value) {
      properties.set(key, String(value));
      return scriptProperties;
    }
  };
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    isFinite,
    isNaN,
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return runtime.activeSpreadsheet;
      },
      openById(id) {
        runtime.openByIdCalls += 1;
        if (id !== spreadsheet.id) throw new Error(`Unknown spreadsheet ID: ${id}`);
        return spreadsheet;
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return scriptProperties;
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() {
            return true;
          },
          releaseLock() {}
        };
      }
    },
    Session: {
      getScriptTimeZone() {
        return 'America/Chicago';
      }
    },
    Utilities: {
      formatDate,
      getUuid() {
        runtime.uuidCounter += 1;
        return `${runtime.uuidCounter.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
      }
    },
    HtmlService: {}
  });
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), context, {
    filename: CODE_PATH
  });
  context.setupStudio();
  context.resetStudio(baseState(), RESET_TOKEN);
  return { api: context, spreadsheet, properties, runtime };
}

function load(api) {
  return plain(api.loadStudio());
}

function recordById(records, id) {
  return records.find((record) => record.id === id);
}

function expectError(callback, pattern) {
  assert.throws(callback, pattern);
}

test('setup/reset bind the sheet and web execution reopens it once then caches it', () => {
  const harness = createHarness();
  const { api, properties, runtime } = harness;
  assert.equal(properties.get('PIANO_STUDIO_BOUND_SPREADSHEET_ID'), 'spreadsheet-test-id');
  assert.equal(load(api).students.length, 4);

  runtime.activeSpreadsheet = null;
  api.STUDIO_SPREADSHEET_CACHE = null;
  assert.equal(load(api).lessons.length, 5);
  assert.equal(runtime.openByIdCalls, 1);
  assert.equal(load(api).lessons.length, 5);
  assert.equal(runtime.openByIdCalls, 1);
});

test('lessons require exactly one subject and every minor retains a guardian', () => {
  const { api } = createHarness();
  expectError(
    () => api.saveRecord('lessons', {
      id: 'les-invalid-both',
      studentId: 'stu-a',
      inquiryId: 'inq-trial',
      date: '2026-08-04',
      startTime: '12:00',
      duration: 30,
      type: 'Trial',
      status: 'Scheduled'
    }),
    /exactly one student or inquiry/
  );
  expectError(
    () => api.saveRecord('lessons', {
      id: 'les-invalid-neither',
      date: '2026-08-04',
      startTime: '12:00',
      duration: 30,
      type: 'Regular',
      status: 'Scheduled'
    }),
    /exactly one student or inquiry/
  );

  const withoutGuardian = load(api);
  withoutGuardian.studentGuardians = [];
  expectError(
    () => api.saveStudioCollections(withoutGuardian, ['studentGuardians']),
    /must have at least one guardian/
  );

  const multiGuardian = load(api);
  multiGuardian.guardians.push({
    id: 'gua-two',
    firstName: 'Robin',
    lastName: 'Minor',
    email: 'robin@example.com',
    preferredContact: 'Email',
    notes: 'Second household.'
  });
  multiGuardian.studentGuardians.push({
    id: 'sgr-two',
    studentId: 'stu-m',
    guardianId: 'gua-two',
    relationship: 'Parent',
    primaryContact: false,
    billingContact: false,
    notes: 'May receive schedule messages.'
  });
  api.saveStudioCollections(multiGuardian, ['guardians', 'studentGuardians']);
  assert.equal(
    recordById(load(api).studentGuardians, 'sgr-two').notes,
    'May receive schedule messages.'
  );
});

test('active recurring schedules cannot duplicate or overlap and occurrences are unique', () => {
  const { api } = createHarness();
  const duplicateStudent = load(api);
  duplicateStudent.recurringSchedules.push({
    id: 'sch-a-second',
    studentId: 'stu-a',
    day: 'Tuesday',
    startTime: '14:00',
    duration: 30,
    location: 'In studio',
    active: true,
    effectiveFrom: '2026-01-01'
  });
  expectError(
    () => api.saveStudioCollections(duplicateStudent, ['recurringSchedules']),
    /only one active recurring schedule/
  );

  const overlap = load(api);
  overlap.recurringSchedules.push({
    id: 'sch-overlap',
    studentId: 'stu-c',
    day: 'Monday',
    startTime: '10:15',
    duration: 30,
    location: 'In studio',
    active: true,
    effectiveFrom: '2026-01-01'
  });
  expectError(
    () => api.saveStudioCollections(overlap, ['recurringSchedules']),
    /overlap on Monday/
  );

  const duplicateOccurrence = load(api);
  duplicateOccurrence.lessons.push({
    id: 'les-duplicate-occurrence',
    studentId: 'stu-a',
    sourceScheduleId: 'sch-a',
    date: '2026-08-03',
    startTime: '10:00',
    duration: 30,
    type: 'Regular',
    status: 'Scheduled',
    location: 'In studio'
  });
  expectError(
    () => api.saveStudioCollections(duplicateOccurrence, ['lessons']),
    /more than one lesson occurrence/
  );

  const noOp = load(api);
  assert.equal(
    api.saveStudioCollections(noOp, ['recurringSchedules']).ok,
    true,
    'back-to-back slots are not treated as overlapping'
  );
});

test('completed lessons are immutable with one atomic trial-conversion exception', () => {
  const { api } = createHarness();
  const completed = recordById(load(api).lessons, 'les-completed');
  expectError(
    () => api.saveRecord('lessons', { ...completed, summary: 'Stale overwrite.' }),
    /Completed lesson .* read-only/
  );

  const conversion = load(api);
  conversion.students.push({
    id: 'stu-converted',
    firstName: 'Taylor',
    lastName: 'Trial',
    studentType: 'Adult',
    status: 'Active',
    tuitionAmount: 160,
    billingModel: 'Monthly tuition'
  });
  const inquiry = recordById(conversion.inquiries, 'inq-trial');
  inquiry.status = 'Converted';
  inquiry.convertedStudentId = 'stu-converted';
  inquiry.nextFollowUp = '';
  const trial = recordById(conversion.lessons, 'les-trial');
  trial.studentId = 'stu-converted';
  trial.inquiryId = '';
  const staleConversion = plain(conversion);
  recordById(staleConversion.inquiries, 'inq-trial').prospectName = 'Stale Name';
  expectError(
    () => api.saveStudioCollections(
      staleConversion,
      ['students', 'lessons', 'inquiries']
    ),
    /contact and history fields cannot be rewritten during conversion/
  );
  const converted = api.saveStudioCollections(
    conversion,
    ['students', 'lessons', 'inquiries']
  );
  assert.equal(recordById(plain(converted.state).lessons, 'les-trial').inquiryId, '');

  assert.equal(
    api.saveStudioCollections(
      plain(converted.state),
      ['students', 'lessons', 'inquiries']
    ).ok,
    true,
    'retrying the same conversion is idempotent'
  );

  const repoint = load(api);
  recordById(repoint.inquiries, 'inq-trial').convertedStudentId = 'stu-b';
  recordById(repoint.lessons, 'les-trial').studentId = 'stu-b';
  expectError(
    () => api.saveStudioCollections(repoint, ['lessons', 'inquiries']),
    /Completed lesson .* read-only|linkage is immutable/
  );

  const forgedInquiry = load(api);
  forgedInquiry.inquiries.push({
    id: 'inq-forged-converted',
    prospectName: 'Forged Conversion',
    email: 'forged@example.com',
    dateReceived: '2026-07-20',
    status: 'Converted',
    convertedStudentId: 'stu-b'
  });
  expectError(
    () => api.saveStudioCollections(forgedInquiry, ['inquiries']),
    /new inquiry cannot begin as Converted/
  );

  const reschedule = load(api);
  const oldTrial = recordById(reschedule.lessons, 'les-trial-scheduled');
  oldTrial.status = 'Rescheduled';
  oldTrial.cancellationReason = 'Moved to a new time.';
  reschedule.lessons.push({
    id: 'les-trial-rescheduled',
    inquiryId: 'inq-trial-scheduled',
    date: '2026-08-06',
    startTime: '14:00',
    duration: 30,
    type: 'Trial',
    status: 'Scheduled',
    rescheduledFromId: oldTrial.id,
    location: 'In studio'
  });
  recordById(
    reschedule.inquiries,
    'inq-trial-scheduled'
  ).trialLessonId = 'les-trial-rescheduled';
  assert.equal(
    api.saveStudioCollections(reschedule, ['lessons', 'inquiries']).ok,
    true,
    'a rescheduled trial keeps its archival predecessor'
  );
});

test('recital completion snapshots atomically then freezes recital history', () => {
  const { api, spreadsheet } = createHarness();
  const participantSheet = spreadsheet.getSheetByName('Recital Participants');
  const headers = participantSheet.values[0];
  const idColumn = headers.indexOf('Recital Participant ID');
  const legacyRow = participantSheet.values.findIndex(
    (row, index) => index > 0 && row[idColumn] === 'rcp-completed'
  );
  [
    'Student Name Snapshot',
    'Piece Title Snapshot',
    'Composer Snapshot'
  ].forEach((header) => {
    participantSheet.values[legacyRow][headers.indexOf(header)] = '';
  });
  const studentNoOp = recordById(load(api).students, 'stu-a');
  assert.equal(
    api.saveRecord('students', studentNoOp).ok,
    true,
    'an additive snapshot migration does not lock unrelated saves'
  );
  const legacyRepair = load(api);
  Object.assign(recordById(legacyRepair.recitalParticipants, 'rcp-completed'), {
    studentNameSnapshot: 'Avery Adult',
    pieceTitleSnapshot: 'Archive Song',
    composerSnapshot: 'Historic Composer'
  });
  assert.equal(
    api.saveStudioCollections(legacyRepair, ['recitalParticipants']).ok,
    true,
    'legacy blank snapshots can be repaired once with canonical values'
  );

  const staleRecital = recordById(load(api).recitals, 'rct-completed');
  expectError(
    () => api.saveRecord('recitals', { ...staleRecital, name: 'Rewritten Recital' }),
    /Completed recital .* read-only/
  );
  const staleParticipant = recordById(load(api).recitalParticipants, 'rcp-completed');
  expectError(
    () => api.saveRecord('recitalParticipants', {
      ...staleParticipant,
      notes: 'Rewritten history.'
    }),
    /completed recital.*read-only/i
  );

  const missingSnapshots = load(api);
  recordById(missingSnapshots.recitals, 'rct-planning').status = 'Completed';
  expectError(
    () => api.saveStudioCollections(
      missingSnapshots,
      ['recitalParticipants', 'recitals']
    ),
    /must snapshot the current student name/
  );

  const completing = load(api);
  recordById(completing.recitals, 'rct-planning').status = 'Completed';
  Object.assign(recordById(completing.recitalParticipants, 'rcp-planning'), {
    studentNameSnapshot: 'Blair Brown',
    pieceTitleSnapshot: 'Recital Song',
    composerSnapshot: 'Program Composer'
  });
  const result = api.saveStudioCollections(
    completing,
    ['recitalParticipants', 'recitals']
  );
  assert.equal(recordById(plain(result.state).recitals, 'rct-planning').status, 'Completed');

  const after = load(api);
  recordById(after.recitalParticipants, 'rcp-planning').order = 2;
  expectError(
    () => api.saveStudioCollections(after, ['recitalParticipants']),
    /completed recital.*read-only/i
  );
});

test('assignment archival is one-way and terminal rows cannot be changed or removed', () => {
  const { api } = createHarness();
  const multiple = load(api);
  multiple.assignments.push({
    id: 'asn-current-two',
    studentId: 'stu-a',
    lessonId: 'les-completed',
    repertoireId: 'rep-current-a',
    dateAssigned: '2026-07-06',
    instructions: 'Practice the second section.',
    status: 'Current'
  });
  assert.equal(
    api.saveStudioCollections(multiple, ['assignments']).ok,
    true,
    'one lesson may produce multiple archival assignments'
  );

  const archiving = load(api);
  recordById(archiving.assignments, 'asn-current').instructions = 'Stale rewrite.';
  recordById(archiving.assignments, 'asn-current').status = 'Previous';
  expectError(
    () => api.saveStudioCollections(archiving, ['assignments']),
    /may change only status while it is being archived/
  );

  const cleanArchiving = load(api);
  recordById(cleanArchiving.assignments, 'asn-current').status = 'Previous';
  api.saveStudioCollections(cleanArchiving, ['assignments']);

  const edit = load(api);
  recordById(edit.assignments, 'asn-current').instructions = 'Rewrite history.';
  expectError(
    () => api.saveStudioCollections(edit, ['assignments']),
    /Archived assignment .* read-only/
  );

  const regress = load(api);
  recordById(regress.assignments, 'asn-current').status = 'Current';
  expectError(
    () => api.saveStudioCollections(regress, ['assignments']),
    /Archived assignment .* read-only/
  );

  const remove = load(api);
  remove.assignments = [];
  expectError(
    () => api.saveStudioCollections(remove, ['assignments']),
    /historical records|cannot be removed|archival/
  );
});

test('makeup redemption stays synchronized and terminal credits cannot regress', () => {
  const { api } = createHarness();
  expectError(
    () => api.saveRecord('lessons', {
      id: 'les-orphan-makeup',
      studentId: 'stu-a',
      date: '2026-08-09',
      startTime: '12:00',
      duration: 30,
      type: 'Makeup',
      status: 'Scheduled',
      location: 'In studio'
    }),
    /must be scheduled through a linked makeup credit/
  );

  const forgedTerminal = load(api);
  forgedTerminal.makeupCredits.push({
    id: 'mkp-forged-terminal',
    studentId: 'stu-b',
    createdDate: '2026-07-20',
    reason: 'Forged history.',
    status: 'Waived'
  });
  expectError(
    () => api.saveStudioCollections(forgedTerminal, ['makeupCredits']),
    /New makeup credits must begin in Owed status/
  );

  const scheduling = load(api);
  scheduling.lessons.push({
    id: 'les-makeup',
    studentId: 'stu-a',
    date: '2026-08-10',
    startTime: '12:00',
    duration: 30,
    type: 'Makeup',
    status: 'Scheduled',
    rescheduledFromId: 'les-cancelled',
    location: 'In studio'
  });
  Object.assign(recordById(scheduling.makeupCredits, 'mkp-owed'), {
    status: 'Scheduled',
    scheduledLessonId: 'les-makeup'
  });
  api.saveStudioCollections(scheduling, ['lessons', 'makeupCredits']);

  const mismatchedDate = load(api);
  Object.assign(recordById(mismatchedDate.lessons, 'les-makeup'), {
    status: 'Completed',
    summary: 'Makeup completed.',
    completedAt: '2026-08-10T18:00:00.000Z'
  });
  Object.assign(recordById(mismatchedDate.makeupCredits, 'mkp-owed'), {
    status: 'Completed',
    completedDate: '2026-08-11'
  });
  expectError(
    () => api.saveStudioCollections(mismatchedDate, ['lessons', 'makeupCredits']),
    /redeemed lesson date|matching date/
  );

  const completing = load(api);
  Object.assign(recordById(completing.lessons, 'les-makeup'), {
    status: 'Completed',
    summary: 'Makeup completed.',
    completedAt: '2026-08-10T18:00:00.000Z'
  });
  Object.assign(recordById(completing.makeupCredits, 'mkp-owed'), {
    status: 'Completed',
    completedDate: '2026-08-10'
  });
  api.saveStudioCollections(completing, ['lessons', 'makeupCredits']);

  const regress = load(api);
  Object.assign(recordById(regress.makeupCredits, 'mkp-owed'), {
    status: 'Owed',
    scheduledLessonId: '',
    completedDate: ''
  });
  expectError(
    () => api.saveStudioCollections(regress, ['makeupCredits']),
    /cannot move from Completed to Owed|Used makeup credit .* read-only/
  );

  const remove = load(api);
  remove.makeupCredits = [];
  expectError(
    () => api.saveStudioCollections(remove, ['makeupCredits']),
    /history is retained|historical/
  );
});

test('repertoire reactivation copies into a linked record and preserves every completion', () => {
  const { api } = createHarness();
  const completed = recordById(load(api).repertoire, 'rep-completed');
  const current = recordById(load(api).repertoire, 'rep-current-a');
  expectError(
    () => api.saveRecord('repertoire', { ...current, studentId: 'stu-b' }),
    /field "studentId" is immutable/
  );
  expectError(
    () => api.saveRecord('repertoire', { ...completed, notes: 'Rewrite.' }),
    /Completed repertoire .* read-only/
  );
  expectError(
    () => api.deleteRecord('repertoire', 'rep-completed'),
    /cannot be deleted/
  );

  expectError(
    () => api.saveRecord('repertoire', {
      id: 'rep-forged',
      studentId: 'stu-a',
      reactivatedFromId: 'rep-completed',
      title: 'Archive Song',
      composer: 'Historic Composer',
      status: 'New'
    }),
    /must be created with reactivateRepertoire/
  );

  api.saveRecord('repertoire', {
    id: 'rep-normalized-duplicate',
    studentId: 'stu-a',
    title: '  archive song  ',
    composer: 'HISTORIC COMPOSER',
    status: 'New'
  });
  expectError(
    () => api.reactivateRepertoire('rep-completed'),
    /already has a current record/
  );
  api.deleteRecord('repertoire', 'rep-normalized-duplicate');

  const first = plain(api.reactivateRepertoire('rep-completed'));
  assert.equal(first.ok, true);
  assert.equal(first.record.reactivatedFromId, 'rep-completed');
  assert.equal(first.record.status, 'New');
  assert.equal(first.activity.metadata.reactivatedFromId, 'rep-completed');
  assert.ok(first.state.loadedAt);
  expectError(
    () => api.reactivateRepertoire('rep-completed'),
    /already has a current record/
  );

  const correctedSuccessor = plain(api.saveRecord('repertoire', {
    ...first.record,
    title: 'Archive Song — corrected edition'
  }));
  assert.equal(
    correctedSuccessor.record.title,
    'Archive Song — corrected edition',
    'the current successor can correct mutable metadata without changing its source link'
  );

  api.saveRecord('repertoire', {
    ...correctedSuccessor.record,
    status: 'Completed',
    dateCompleted: '2026-07-25'
  });
  const second = plain(api.reactivateRepertoire(first.record.id));
  assert.equal(second.record.reactivatedFromId, first.record.id);
  assert.equal(
    second.state.repertoire.filter((item) => item.status === 'Completed').length,
    2
  );
});

test('multi-sheet write failures restore every selected sheet', () => {
  const { api, spreadsheet } = createHarness();
  const before = load(api);
  const changed = plain(before);
  recordById(changed.students, 'stu-a').goals = 'This write must roll back.';
  recordById(changed.guardians, 'gua-one').notes = 'This sheet will fail.';
  spreadsheet.getSheetByName('Guardians').failNextSetValues = 1;

  expectError(
    () => api.saveStudioCollections(changed, ['students', 'guardians']),
    /rolled back: Injected write failure/
  );
  const after = load(api);
  assert.equal(
    recordById(after.students, 'stu-a').goals,
    recordById(before.students, 'stu-a').goals
  );
  assert.equal(
    recordById(after.guardians, 'gua-one').notes,
    recordById(before.guardians, 'gua-one').notes
  );
});

test('successful saves return canonical affected state and preserve no-op timestamps', () => {
  const { api } = createHarness();
  const before = load(api);
  const priorTimestamp = recordById(before.students, 'stu-a').updatedAt;
  const noOp = plain(api.saveStudioCollections(before, ['students']));
  assert.equal(recordById(noOp.state.students, 'stu-a').updatedAt, priorTimestamp);
  assert.equal(noOp.state.schemaVersion, 1);
  assert.ok(noOp.state.loadedAt);

  const saved = plain(api.saveRecord('students', {
    ...recordById(noOp.state.students, 'stu-a'),
    goals: '=not-a-formula'
  }));
  assert.equal(saved.state.students.find((student) => student.id === 'stu-a').goals, '=not-a-formula');
  assert.equal(load(api).students.find((student) => student.id === 'stu-a').goals, '=not-a-formula');
});
