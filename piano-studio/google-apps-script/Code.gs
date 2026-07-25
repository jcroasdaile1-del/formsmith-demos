/**
 * Private Piano Studio - Google Apps Script backend
 *
 * Container-bound to the Google Spreadsheet that owns the studio data.
 * The browser calls the public functions in this file with google.script.run.
 *
 * Design goals:
 * - one batched read for the application bootstrap;
 * - stable, human-readable sheet headers;
 * - ID-based writes that never depend on row numbers;
 * - lock-protected, validated writes;
 * - non-destructive header/schema migration;
 * - explicit protection for historical and financial records.
 */

// ===== Public configuration =================================================

var STUDIO_SCHEMA_VERSION = 1;
var STUDIO_RESET_CONFIRMATION_TOKEN = 'RESET HARMONY HOUSE';
var STUDIO_SPREADSHEET_PROPERTY = 'PIANO_STUDIO_BOUND_SPREADSHEET_ID';
var STUDIO_SPREADSHEET_CACHE = null;
var STUDIO_LOCK_TIMEOUT_MS = 30000;
var STUDIO_MAX_RECORDS_PER_COLLECTION = 5000;
var STUDIO_MAX_TEXT_LENGTH = 50000;
var STUDIO_MAX_JSON_LENGTH = 250000;

var STUDIO_SETTINGS_SHEET = {
  sheetName: 'Settings',
  headers: ['Setting Path', 'Value', 'Value Type', 'Updated At'],
  aliases: {
    'Setting Path': ['path', 'settingPath'],
    'Value': ['value'],
    'Value Type': ['type', 'valueType'],
    'Updated At': ['updatedAt']
  }
};

var STUDIO_META_SHEET = {
  sheetName: '_Studio Meta',
  headers: ['Metadata Key', 'Metadata Value', 'Updated At'],
  aliases: {
    'Metadata Key': ['key', 'metadataKey'],
    'Metadata Value': ['value', 'metadataValue'],
    'Updated At': ['updatedAt']
  }
};

var DEFAULT_STUDIO_SETTINGS = {
  studioName: '',
  ownerName: '',
  email: '',
  phone: '',
  address: '',
  targetWeeklySlots: 28,
  defaultLessonLengths: [30, 45, 60],
  defaultTuition: 0,
  teachingDays: [],
  openTime: '10:00',
  closeTime: '19:30',
  currency: 'USD',
  timezone: 'America/Chicago',
  cancellationPolicy: '',
  studioClosures: [],
  appearance: {
    theme: 'system'
  }
};

/**
 * Collection definitions are the single source of truth for sheet names,
 * client keys, value types, references, and deletion policy.
 */
var STUDIO_COLLECTIONS = {
  students: collection_(
    'Students',
    'STU',
    withTimestamps_([
      field_('id', 'Student ID', 'id', { required: true }),
      field_('firstName', 'First Name', 'string', { required: true, maxLength: 200 }),
      field_('lastName', 'Last Name', 'string', { required: true, maxLength: 200 }),
      field_('preferredName', 'Preferred Name', 'string', { maxLength: 200 }),
      field_('birthDate', 'Date of Birth', 'date', { aliases: ['dateOfBirth'] }),
      field_('studentType', 'Student Type', 'string', { enum: ['Minor', 'Adult'], defaultValue: 'Minor' }),
      field_('status', 'Status', 'string', {
        enum: ['Active', 'Inactive', 'Trial', 'Waitlist', 'Paused'],
        defaultValue: 'Active'
      }),
      field_('startDate', 'Start Date', 'date'),
      field_('inactiveDate', 'Inactive Date', 'date', { aliases: ['endDate', 'End Date'] }),
      field_('level', 'Piano Level', 'string', { maxLength: 200 }),
      field_('yearsStudying', 'Years Studying', 'number', { min: 0 }),
      field_('goals', 'Primary Goals', 'string', { aliases: ['primaryGoals'] }),
      field_('learningNotes', 'Learning Notes', 'string'),
      field_('techniqueFocus', 'Technique Focus', 'string'),
      field_('teacherNotes', 'Teacher Notes', 'string'),
      field_('email', 'Email', 'string', { maxLength: 500 }),
      field_('phone', 'Phone', 'string', { maxLength: 100 }),
      field_('preferredContact', 'Preferred Contact Method', 'string', {
        enum: ['Email', 'Phone', 'Text', 'Any', ''],
        defaultValue: ''
      }),
      field_('tuitionAmount', 'Monthly Tuition Amount', 'number', { min: 0, defaultValue: 0 }),
      field_('billingModel', 'Billing Model', 'string', {
        enum: ['Monthly tuition', 'Per lesson', 'Package', 'Other'],
        defaultValue: 'Monthly tuition'
      }),
      field_('location', 'Lesson Location or Method', 'string', {
        maxLength: 500,
        aliases: ['lessonLocation']
      })
    ]),
    { deletePolicy: 'if_unreferenced' }
  ),

  guardians: collection_(
    'Guardians',
    'GUA',
    withTimestamps_([
      field_('id', 'Guardian ID', 'id', { required: true }),
      field_('familyKey', 'Family Key', 'string', { maxLength: 200 }),
      field_('firstName', 'First Name', 'string', { required: true, maxLength: 200 }),
      field_('lastName', 'Last Name', 'string', { required: true, maxLength: 200 }),
      field_('email', 'Email', 'string', { maxLength: 500 }),
      field_('phone', 'Phone', 'string', { maxLength: 100 }),
      field_('preferredContact', 'Preferred Contact Method', 'string', {
        enum: ['Email', 'Phone', 'Text', 'Any', ''],
        defaultValue: 'Email'
      }),
      field_('notes', 'Notes', 'string')
    ]),
    { deletePolicy: 'if_unreferenced' }
  ),

  studentGuardians: collection_(
    'Student Guardians',
    'SGR',
    withTimestamps_([
      field_('id', 'Student Guardian ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('guardianId', 'Guardian ID', 'id', { required: true, ref: 'guardians' }),
      field_('relationship', 'Relationship', 'string', { maxLength: 200 }),
      field_('primaryContact', 'Primary Contact', 'boolean', { defaultValue: false }),
      field_('billingContact', 'Billing Contact', 'boolean', { defaultValue: false }),
      field_('notes', 'Notes', 'string')
    ]),
    { deletePolicy: 'allowed' }
  ),

  recurringSchedules: collection_(
    'Recurring Schedules',
    'SCH',
    withTimestamps_([
      field_('id', 'Recurring Schedule ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('day', 'Day of Week', 'string', {
        required: true,
        enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        aliases: ['dayOfWeek']
      }),
      field_('startTime', 'Start Time', 'time', { required: true }),
      field_('duration', 'Duration Minutes', 'number', {
        required: true,
        min: 1,
        integer: true,
        aliases: ['durationMinutes']
      }),
      field_('location', 'Location or Method', 'string', {
        maxLength: 500,
        aliases: ['locationMethod']
      }),
      field_('active', 'Active', 'boolean', { defaultValue: true }),
      field_('effectiveFrom', 'Effective Start Date', 'date', { aliases: ['startDate'] }),
      field_('effectiveTo', 'Effective End Date', 'date', { aliases: ['endDate'] }),
      field_('notes', 'Notes', 'string')
    ]),
    { deletePolicy: 'if_unreferenced' }
  ),

  lessons: collection_(
    'Lessons',
    'LES',
    withTimestamps_([
      field_('id', 'Lesson ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { ref: 'students' }),
      field_('inquiryId', 'Inquiry ID', 'id', { ref: 'inquiries' }),
      field_('sourceScheduleId', 'Recurring Schedule ID', 'id', {
        ref: 'recurringSchedules',
        aliases: ['recurringScheduleId']
      }),
      field_('date', 'Lesson Date', 'date', { required: true }),
      field_('startTime', 'Start Time', 'time', { required: true }),
      field_('duration', 'Duration Minutes', 'number', {
        required: true,
        min: 1,
        integer: true,
        aliases: ['durationMinutes']
      }),
      field_('type', 'Lesson Type', 'string', {
        enum: ['Regular', 'Trial', 'Makeup', 'Rescheduled'],
        defaultValue: 'Regular',
        aliases: ['lessonType']
      }),
      field_('status', 'Lesson Status', 'string', {
        enum: ['Scheduled', 'Completed', 'Student Cancelled', 'Teacher Cancelled', 'No Show', 'Rescheduled'],
        defaultValue: 'Scheduled'
      }),
      field_('rescheduledFromId', 'Rescheduled From Lesson ID', 'id', {
        ref: 'lessons',
        aliases: ['rescheduledFromLessonId']
      }),
      field_('cancellationReason', 'Cancellation Reason', 'string'),
      field_('location', 'Location or Method', 'string', { maxLength: 500 }),
      field_('summary', 'Lesson Summary', 'string', { aliases: ['lessonSummary'] }),
      field_('whatWentWell', 'What Went Well', 'string'),
      field_('focusNext', 'Focus for Next Lesson', 'string', { aliases: ['areasToImprove'] }),
      field_('technique', 'Technique Areas', 'array', { defaultValue: [] }),
      field_('techniqueNotes', 'Technique Notes', 'string'),
      field_('repertoireProgress', 'Repertoire Progress', 'array', { defaultValue: [] }),
      field_('completedAt', 'Completed At', 'datetime')
    ]),
    {
      deletePolicy: 'never',
      deletionReason: 'Lesson history is archival. Cancel or reschedule the lesson instead of deleting it.'
    }
  ),

  repertoire: collection_(
    'Repertoire',
    'REP',
    withTimestamps_([
      field_('id', 'Repertoire ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('reactivatedFromId', 'Reactivated From Repertoire ID', 'id', { ref: 'repertoire' }),
      field_('title', 'Piece Title', 'string', { required: true, maxLength: 1000 }),
      field_('composer', 'Composer', 'string', { maxLength: 500 }),
      field_('collection', 'Collection or Book', 'string', {
        maxLength: 1000,
        aliases: ['collectionBook']
      }),
      field_('dateAssigned', 'Date Assigned', 'date'),
      field_('status', 'Repertoire Status', 'string', {
        enum: ['New', 'Learning', 'Developing', 'Polishing', 'Performance Ready', 'Completed'],
        defaultValue: 'New'
      }),
      field_('dateCompleted', 'Date Completed', 'date'),
      field_('lastWorkedOn', 'Last Worked On', 'date'),
      field_('notes', 'Notes', 'string')
    ]),
    {
      deletePolicy: 'if_unreferenced',
      immutableFields: ['studentId']
    }
  ),

  assignments: collection_(
    'Assignments',
    'ASN',
    withTimestamps_([
      field_('id', 'Assignment ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('lessonId', 'Lesson ID', 'id', { ref: 'lessons' }),
      field_('repertoireId', 'Repertoire ID', 'id', { ref: 'repertoire' }),
      field_('dateAssigned', 'Date Assigned', 'date', { required: true }),
      field_('section', 'Section, Measures, or Pages', 'string', {
        maxLength: 1000,
        aliases: ['sectionMeasures']
      }),
      field_('targetTempo', 'Target Tempo', 'number', { min: 0 }),
      field_('instructions', 'Practice Instructions', 'string', { required: true }),
      field_('practiceGoal', 'Practice Goal', 'string', {
        maxLength: 1000,
        aliases: ['practiceFrequency']
      }),
      field_('progressNotes', 'Progress Notes', 'string'),
      field_('status', 'Assignment Status', 'string', {
        enum: ['Current', 'Previous', 'Completed', 'Cancelled'],
        defaultValue: 'Current'
      })
    ]),
    {
      deletePolicy: 'never',
      deletionReason: 'Practice assignments are historical records. Mark an assignment cancelled instead.',
      immutableFields: [
        'studentId',
        'lessonId',
        'dateAssigned'
      ]
    }
  ),

  tuitionCharges: collection_(
    'Tuition Charges',
    'CHG',
    withTimestamps_([
      field_('id', 'Tuition Charge ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('period', 'Billing Period', 'string', {
        required: true,
        maxLength: 100,
        aliases: ['billingPeriod']
      }),
      field_('description', 'Description', 'string', { maxLength: 1000 }),
      field_('dueDate', 'Due Date', 'date', { required: true }),
      field_('amount', 'Charge Amount', 'number', { required: true, min: 0.01 }),
      field_('notes', 'Notes', 'string'),
      field_('status', 'Transaction Status', 'string', {
        enum: ['Posted', 'Void'],
        defaultValue: 'Posted'
      }),
      field_('voidedAt', 'Voided At', 'datetime'),
      field_('voidReason', 'Void Reason', 'string')
    ]),
    {
      deletePolicy: 'never',
      deletionReason: 'Tuition charges are financial history. Void a charge instead of deleting it.',
      immutableFields: ['studentId', 'period', 'dueDate', 'amount']
    }
  ),

  payments: collection_(
    'Payments',
    'PAY',
    withTimestamps_([
      field_('id', 'Payment ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('chargeId', 'Tuition Charge ID', 'id', {
        ref: 'tuitionCharges',
        aliases: ['tuitionChargeId']
      }),
      field_('date', 'Payment Date', 'date', { required: true }),
      field_('amount', 'Payment Amount', 'number', { required: true, min: 0.01 }),
      field_('method', 'Payment Method', 'string', {
        required: true,
        maxLength: 200,
        enum: ['Cash', 'Check', 'Venmo', 'Zelle', 'Bank transfer', 'Other']
      }),
      field_('notes', 'Notes', 'string'),
      field_('status', 'Transaction Status', 'string', {
        enum: ['Posted', 'Void'],
        defaultValue: 'Posted'
      }),
      field_('voidedAt', 'Voided At', 'datetime'),
      field_('voidReason', 'Void Reason', 'string')
    ]),
    {
      deletePolicy: 'never',
      deletionReason: 'Payments are transaction history. Void a payment instead of deleting it.',
      immutableFields: ['studentId', 'chargeId', 'date', 'amount', 'method']
    }
  ),

  makeupCredits: collection_(
    'Makeup Credits',
    'MKP',
    withTimestamps_([
      field_('id', 'Makeup Credit ID', 'id', { required: true }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('lessonId', 'Original Lesson ID', 'id', {
        ref: 'lessons',
        aliases: ['originalLessonId']
      }),
      field_('scheduledLessonId', 'Scheduled Makeup Lesson ID', 'id', { ref: 'lessons' }),
      field_('createdDate', 'Credit Created Date', 'date', { required: true }),
      field_('reason', 'Reason', 'string'),
      field_('status', 'Makeup Status', 'string', {
        enum: ['Owed', 'Scheduled', 'Completed', 'Expired', 'Waived'],
        defaultValue: 'Owed'
      }),
      field_('completedDate', 'Completed Date', 'date'),
      field_('notes', 'Notes', 'string')
    ]),
    {
      deletePolicy: 'never',
      deletionReason: 'Makeup-credit history is retained. Mark a credit expired or waived instead.'
    }
  ),

  inquiries: collection_(
    'Inquiries',
    'INQ',
    withTimestamps_([
      field_('id', 'Inquiry ID', 'id', { required: true }),
      field_('prospectName', 'Prospective Student Name', 'string', { required: true, maxLength: 500 }),
      field_('age', 'Age', 'number', { min: 0, max: 120, integer: true }),
      field_('guardianName', 'Parent or Guardian Name', 'string', { maxLength: 500 }),
      field_('email', 'Email', 'string', { maxLength: 500 }),
      field_('phone', 'Phone', 'string', { maxLength: 100 }),
      field_('experience', 'Experience Level', 'string', {
        maxLength: 500,
        aliases: ['experienceLevel']
      }),
      field_('availability', 'Desired Lesson Availability', 'string', {
        aliases: ['desiredAvailability']
      }),
      field_('source', 'Inquiry Source', 'string', { maxLength: 500 }),
      field_('dateReceived', 'Date Received', 'date', { required: true }),
      field_('status', 'Inquiry Status', 'string', {
        enum: [
          'New Inquiry',
          'Contacted',
          'Trial Scheduled',
          'Trial Completed',
          'Enrolling',
          'Converted',
          'Waitlist',
          'Not Moving Forward'
        ],
        defaultValue: 'New Inquiry'
      }),
      field_('nextFollowUp', 'Next Follow-up Date', 'date', { aliases: ['nextFollowUpDate'] }),
      field_('trialLessonId', 'Trial Lesson ID', 'id', { ref: 'lessons' }),
      field_('convertedStudentId', 'Converted Student ID', 'id', { ref: 'students' }),
      field_('notes', 'Notes', 'string')
    ]),
    { deletePolicy: 'allowed' }
  ),

  recitals: collection_(
    'Recitals',
    'RCT',
    withTimestamps_([
      field_('id', 'Recital ID', 'id', { required: true }),
      field_('name', 'Recital Name', 'string', { required: true, maxLength: 1000 }),
      field_('date', 'Recital Date', 'date', { required: true }),
      field_('time', 'Recital Time', 'time'),
      field_('location', 'Location', 'string', { maxLength: 2000 }),
      field_('status', 'Recital Status', 'string', {
        enum: ['Planning', 'Scheduled', 'Completed', 'Cancelled'],
        defaultValue: 'Planning'
      }),
      field_('notes', 'Notes', 'string')
    ]),
    { deletePolicy: 'if_unreferenced' }
  ),

  recitalParticipants: collection_(
    'Recital Participants',
    'RCP',
    withTimestamps_([
      field_('id', 'Recital Participant ID', 'id', { required: true }),
      field_('recitalId', 'Recital ID', 'id', { required: true, ref: 'recitals' }),
      field_('studentId', 'Student ID', 'id', { required: true, ref: 'students' }),
      field_('repertoireId', 'Repertoire ID', 'id', { ref: 'repertoire' }),
      field_('studentNameSnapshot', 'Student Name Snapshot', 'string', { maxLength: 500 }),
      field_('pieceTitleSnapshot', 'Piece Title Snapshot', 'string', { maxLength: 1000 }),
      field_('composerSnapshot', 'Composer Snapshot', 'string', { maxLength: 500 }),
      field_('readiness', 'Performance Readiness', 'string', {
        enum: ['Learning', 'Developing', 'Polishing', 'Performance Ready'],
        defaultValue: 'Learning'
      }),
      field_('order', 'Performance Order', 'number', {
        min: 1,
        integer: true,
        aliases: ['performanceOrder']
      }),
      field_('notes', 'Notes', 'string')
    ]),
    { deletePolicy: 'allowed' }
  ),

  expenses: collection_(
    'Expenses',
    'EXP',
    withTimestamps_([
      field_('id', 'Expense ID', 'id', { required: true }),
      field_('date', 'Expense Date', 'date', { required: true }),
      field_('vendor', 'Vendor', 'string', { required: true, maxLength: 1000 }),
      field_('category', 'Category', 'string', { required: true, maxLength: 500 }),
      field_('description', 'Description', 'string'),
      field_('amount', 'Amount', 'number', { required: true, min: 0.01 }),
      field_('paymentMethod', 'Payment Method', 'string', { maxLength: 200 }),
      field_('deductible', 'Tax Deductible', 'boolean', { defaultValue: false }),
      field_('notes', 'Notes', 'string')
    ]),
    { deletePolicy: 'allowed' }
  ),

  activity: collection_(
    'Activity',
    'ACT',
    withTimestamps_([
      field_('id', 'Activity ID', 'id', { required: true }),
      field_('at', 'Activity Date', 'datetime', { required: true, aliases: ['date'] }),
      field_('type', 'Activity Type', 'string', { required: true, maxLength: 200 }),
      field_('text', 'Activity Text', 'string', { required: true }),
      field_('entityType', 'Related Entity Type', 'string', { maxLength: 200 }),
      field_('entityId', 'Related Entity ID', 'id'),
      field_('route', 'Application Route', 'string', { maxLength: 2000 }),
      field_('metadata', 'Metadata', 'object', { defaultValue: {} })
    ]),
    {
      deletePolicy: 'never',
      deletionReason: 'Activity is append-only audit history.',
      appendOnly: true
    }
  )
};

var STUDIO_COLLECTION_KEYS = [
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


// ===== Web app and spreadsheet menu ========================================

/**
 * Serves Index.html. Framing is intentionally left at Apps Script's secure
 * default; this private studio app does not opt into ALLOWALL.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Private Piano Studio')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Optional helper for HTML partials if Index.html uses templates. */
function include(filename) {
  validateTemplateFilename_(filename);
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Piano Studio')
    .addItem('Open Studio App', 'showStudioApp')
    .addItem('Set Up / Migrate Studio Sheets', 'setupStudio')
    .addToUi();
}

function showStudioApp() {
  var html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setWidth(1200)
    .setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'Private Piano Studio');
}

/**
 * Idempotently creates missing sheets and migrates headers in place.
 * Existing rows, unknown columns, formatting, and formulas are preserved.
 */
function setupStudio() {
  return withWriteLock_(function() {
    bindActiveSpreadsheet_();
    ensureStudio_();
    return loadStudioUnlocked_();
  });
}

/** Short alias that is convenient to run from the Apps Script editor. */
function setup() {
  return setupStudio();
}


// ===== Public read/write API ===============================================

/**
 * Loads every collection and nested settings in one server round trip.
 */
function loadStudio() {
  return withWriteLock_(function() {
    ensureStudio_();
    return loadStudioUnlocked_();
  });
}

/**
 * Creates or updates one record by its stable ID.
 *
 * If record.id is omitted, a new ID is generated. If it is present, this is
 * an upsert by ID; spreadsheet row numbers are never accepted from clients.
 */
function saveRecord(collection, record) {
  return withWriteLock_(function() {
    ensureStudio_();
    var key = validateCollectionKey_(collection, false);
    var def = STUDIO_COLLECTIONS[key];
    assertPlainObject_(record, 'record');

    var currentState = loadStudioUnlocked_();
    var existingMap = recordsById_(currentState[key]);
    var requestedId = record.id === undefined || record.id === null || record.id === ''
      ? ''
      : validateId_(record.id, 'record.id');
    var existing = requestedId ? existingMap[requestedId] || null : null;

    if (existing && def.appendOnly) {
      throw new Error(key + ' records are append-only and cannot be updated.');
    }

    var normalized = normalizeRecord_(key, record, existing, {
      allowGeneratedId: true,
      allowProvidedTimestamps: false,
      preserveUpdatedAt: false
    });
    enforceImmutableFields_(def, existing, normalized);

    var prospective = cloneJson_(currentState);
    var next = prospective[key].slice();
    if (existing) {
      next = next.map(function(item) {
        return item.id === normalized.id ? normalized : item;
      });
    } else {
      next.push(normalized);
    }
    prospective[key] = next;
    enforceStateLifecycleTransitions_(currentState, prospective);
    validateProspectiveState_(prospective);

    writeSingleRecord_(key, normalized);
    return {
      ok: true,
      collection: key,
      record: normalized,
      state: canonicalStateEnvelope_(prospective)
    };
  });
}

/**
 * Reactivates completed repertoire by creating a new current successor.
 * The completed source remains immutable and linked for historical lookup.
 */
function reactivateRepertoire(repertoireId) {
  return withWriteLock_(function() {
    ensureStudio_();
    var safeId = validateId_(repertoireId, 'repertoireId');
    var currentState = loadStudioUnlocked_();
    var source = recordsById_(currentState.repertoire)[safeId] || null;
    if (!source) throw new Error('No repertoire record exists with ID ' + safeId + '.');
    if (source.status !== 'Completed') {
      throw new Error('Only completed repertoire can be reactivated.');
    }

    var duplicate = currentState.repertoire.some(function(item) {
      return item.status !== 'Completed' &&
        item.studentId === source.studentId &&
        normalizedLookupText_(item.title) === normalizedLookupText_(source.title) &&
        normalizedLookupText_(item.composer) === normalizedLookupText_(source.composer);
    });
    if (duplicate) {
      throw new Error('This student already has a current record for that piece.');
    }

    var now = nowIso_();
    var today = Utilities.formatDate(new Date(), scriptTimeZone_(), 'yyyy-MM-dd');
    var record = normalizeRecord_('repertoire', {
      studentId: source.studentId,
      reactivatedFromId: source.id,
      title: source.title,
      composer: source.composer,
      collection: source.collection,
      dateAssigned: today,
      status: 'New',
      dateCompleted: '',
      lastWorkedOn: today,
      notes: source.notes
    }, null, {
      allowGeneratedId: true,
      allowProvidedTimestamps: false,
      now: now
    });
    var activity = normalizeRecord_('activity', {
      at: now,
      type: 'repertoire',
      text: 'Reactivated ' + source.title + ' as current repertoire.',
      entityType: 'repertoire',
      entityId: record.id,
      route: '#repertoire',
      metadata: { reactivatedFromId: source.id }
    }, null, {
      allowGeneratedId: true,
      allowProvidedTimestamps: false,
      now: now
    });

    var prospective = cloneJson_(currentState);
    prospective.repertoire.push(record);
    prospective.activity.push(activity);
    enforceStateLifecycleTransitions_(currentState, prospective, {
      allowedReactivationId: record.id
    });
    validateProspectiveState_(prospective);

    var repertoireSheet = getSpreadsheet_().getSheetByName(STUDIO_COLLECTIONS.repertoire.sheetName);
    var activitySheet = getSpreadsheet_().getSheetByName(STUDIO_COLLECTIONS.activity.sheetName);
    var repertoireSnapshot = snapshotSheet_(repertoireSheet);
    var activitySnapshot = snapshotSheet_(activitySheet);
    try {
      writeSingleRecord_('repertoire', record);
      writeSingleRecord_('activity', activity);
    } catch (err) {
      try {
        restoreSheetSnapshot_(repertoireSheet, repertoireSnapshot);
        restoreSheetSnapshot_(activitySheet, activitySnapshot);
      } catch (rollbackError) {
        console.error('Repertoire reactivation rollback failed: ' + rollbackError.message);
      }
      throw new Error('Repertoire reactivation failed and was rolled back: ' + err.message);
    }

    return {
      ok: true,
      record: record,
      activity: activity,
      state: canonicalStateEnvelope_(prospective)
    };
  });
}

/**
 * Deletes one record by ID when that collection permits deletion and no
 * remaining record references it.
 */
function deleteRecord(collection, id) {
  return withWriteLock_(function() {
    ensureStudio_();
    var key = validateCollectionKey_(collection, false);
    var def = STUDIO_COLLECTIONS[key];
    var safeId = validateId_(id, 'id');

    if (def.deletePolicy === 'never') {
      throw new Error(def.deletionReason || (key + ' records cannot be deleted.'));
    }

    var state = loadStudioUnlocked_();
    var existing = state[key].filter(function(record) { return record.id === safeId; })[0] || null;
    if (!existing) throw new Error('No ' + key + ' record exists with ID ' + safeId + '.');
    assertRecordDeletionAllowed_(state, key, existing);

    var blockers = findReferenceBlockers_(state, key, safeId);
    if (blockers.length) {
      var first = blockers[0];
      throw new Error(
        'Cannot delete ' + safeId + ' because ' + first.collection + ' record ' +
        first.recordId + ' references it through ' + first.field + '.'
      );
    }

    var prospective = cloneJson_(state);
    prospective[key] = prospective[key].filter(function(record) {
      return record.id !== safeId;
    });
    enforceStateLifecycleTransitions_(state, prospective);
    validateProspectiveState_(prospective);

    var sheet = getSpreadsheet_().getSheetByName(def.sheetName);
    var rowNumber = findRowById_(sheet, def, safeId);
    if (rowNumber < 2) throw new Error('The record disappeared before it could be deleted.');
    sheet.deleteRow(rowNumber);
    return {
      ok: true,
      collection: key,
      id: safeId,
      state: canonicalStateEnvelope_(prospective)
    };
  });
}

/**
 * Merges and saves nested studio settings.
 */
function saveSettings(settingsPatch) {
  return withWriteLock_(function() {
    ensureStudio_();
    assertPlainObject_(settingsPatch, 'settingsPatch');
    var current = readSettings_();
    var merged = deepMergeObjects_(current, settingsPatch);
    var normalized = normalizeSettings_(merged);
    var sheet = getSpreadsheet_().getSheetByName(STUDIO_SETTINGS_SHEET.sheetName);
    var snapshot = snapshotSheet_(sheet);
    try {
      writeSettings_(normalized);
    } catch (err) {
      restoreSheetSnapshot_(sheet, snapshot);
      throw err;
    }
    return { ok: true, settings: normalized };
  });
}

/**
 * Transactionally replaces selected collections from a complete/partial
 * client state. Every selected collection is validated before the first write.
 *
 * Example:
 *   saveStudioCollections(state, ['lessons', 'assignments', 'repertoire'])
 *
 * `settings` may also be included in the collections list.
 */
function saveStudioCollections(state, collections) {
  return withWriteLock_(function() {
    ensureStudio_();
    assertPlainObject_(state, 'state');
    var selected = validateCollectionList_(collections);
    var currentState = loadStudioUnlocked_();
    var prospective = cloneJson_(currentState);
    var normalizedByKey = newDictionary_();
    var now = nowIso_();

    selected.forEach(function(key) {
      if (key === 'settings') {
        if (!Object.prototype.hasOwnProperty.call(state, 'settings')) {
          throw new Error('state.settings is required when settings is selected.');
        }
        normalizedByKey.settings = normalizeSettings_(state.settings);
        prospective.settings = normalizedByKey.settings;
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(state, key)) {
        throw new Error('state.' + key + ' is required when that collection is selected.');
      }
      if (!Array.isArray(state[key])) {
        throw new Error('state.' + key + ' must be an array.');
      }

      var def = STUDIO_COLLECTIONS[key];
      var existingMap = recordsById_(currentState[key]);
      var normalized = normalizeCollectionPayload_(key, state[key], existingMap, now);
      enforceBulkHistoryPolicy_(key, currentState[key], normalized);
      normalizedByKey[key] = normalized;
      prospective[key] = normalized;
    });

    enforceStateLifecycleTransitions_(currentState, prospective);
    validateProspectiveState_(prospective);

    var snapshots = newDictionary_();
    selected.forEach(function(key) {
      var sheetName = key === 'settings'
        ? STUDIO_SETTINGS_SHEET.sheetName
        : STUDIO_COLLECTIONS[key].sheetName;
      snapshots[key] = snapshotSheet_(getSpreadsheet_().getSheetByName(sheetName));
    });

    try {
      selected.forEach(function(key) {
        if (key === 'settings') writeSettings_(normalizedByKey.settings);
        else writeCollection_(key, normalizedByKey[key]);
      });
    } catch (err) {
      selected.forEach(function(key) {
        var sheetName = key === 'settings'
          ? STUDIO_SETTINGS_SHEET.sheetName
          : STUDIO_COLLECTIONS[key].sheetName;
        try {
          restoreSheetSnapshot_(getSpreadsheet_().getSheetByName(sheetName), snapshots[key]);
        } catch (rollbackError) {
          // Preserve the original failure while leaving a diagnostic in logs.
          console.error('Rollback failed for ' + sheetName + ': ' + rollbackError.message);
        }
      });
      throw new Error('Studio save failed and was rolled back: ' + err.message);
    }

    return {
      ok: true,
      savedCollections: selected,
      state: canonicalStateEnvelope_(prospective)
    };
  });
}

/**
 * Replaces the entire studio only after an explicit confirmation token.
 * All collections and settings must be present in seedState.
 */
function resetStudio(seedState, confirmationToken) {
  if (confirmationToken !== STUDIO_RESET_CONFIRMATION_TOKEN) {
    throw new Error(
      'Reset not confirmed. Pass the exact confirmation token "' +
      STUDIO_RESET_CONFIRMATION_TOKEN + '".'
    );
  }

  return withWriteLock_(function() {
    ensureStudio_();
    assertPlainObject_(seedState, 'seedState');
    STUDIO_COLLECTION_KEYS.forEach(function(key) {
      if (!Object.prototype.hasOwnProperty.call(seedState, key) || !Array.isArray(seedState[key])) {
        throw new Error('A confirmed reset requires seedState.' + key + ' as an array.');
      }
    });
    if (!Object.prototype.hasOwnProperty.call(seedState, 'settings')) {
      throw new Error('A confirmed reset requires seedState.settings.');
    }

    var normalized = { settings: normalizeSettings_(seedState.settings) };
    var prospective = { settings: normalized.settings };
    var now = nowIso_();
    STUDIO_COLLECTION_KEYS.forEach(function(key) {
      normalized[key] = normalizeCollectionPayload_(key, seedState[key], {}, now, true);
      prospective[key] = normalized[key];
    });
    validateProspectiveState_(prospective, { strictImportedHistory: true });

    var targetKeys = STUDIO_COLLECTION_KEYS.concat(['settings']);
    var snapshots = newDictionary_();
    targetKeys.forEach(function(key) {
      var sheetName = key === 'settings'
        ? STUDIO_SETTINGS_SHEET.sheetName
        : STUDIO_COLLECTIONS[key].sheetName;
      snapshots[key] = snapshotSheet_(getSpreadsheet_().getSheetByName(sheetName));
    });

    try {
      STUDIO_COLLECTION_KEYS.forEach(function(key) {
        writeCollection_(key, normalized[key]);
      });
      writeSettings_(normalized.settings);
      setMetaValue_('Last Reset At', nowIso_());
    } catch (err) {
      targetKeys.forEach(function(key) {
        var sheetName = key === 'settings'
          ? STUDIO_SETTINGS_SHEET.sheetName
          : STUDIO_COLLECTIONS[key].sheetName;
        try {
          restoreSheetSnapshot_(getSpreadsheet_().getSheetByName(sheetName), snapshots[key]);
        } catch (rollbackError) {
          console.error('Reset rollback failed for ' + sheetName + ': ' + rollbackError.message);
        }
      });
      throw new Error('Studio reset failed and was rolled back: ' + err.message);
    }

    return {
      ok: true,
      state: canonicalStateEnvelope_(prospective)
    };
  });
}


// ===== Schema setup and non-destructive migration ===========================

function ensureStudio_() {
  var ss = getSpreadsheet_();
  ensureHeaderSheet_(ss, STUDIO_META_SHEET);

  var storedVersion = Number(getMetaValue_('Schema Version') || 0);
  if (!isFiniteNumber_(storedVersion) || storedVersion < 0) {
    throw new Error('The stored studio schema version is invalid.');
  }
  if (storedVersion > STUDIO_SCHEMA_VERSION) {
    throw new Error(
      'This script supports schema version ' + STUDIO_SCHEMA_VERSION +
      ', but the spreadsheet is already on newer version ' + storedVersion + '.'
    );
  }

  STUDIO_COLLECTION_KEYS.forEach(function(key) {
    ensureCollectionSheet_(ss, STUDIO_COLLECTIONS[key]);
  });
  ensureHeaderSheet_(ss, STUDIO_SETTINGS_SHEET);

  runVersionMigrations_(storedVersion, ss);
  if (storedVersion !== STUDIO_SCHEMA_VERSION) {
    setMetaValue_('Schema Version', STUDIO_SCHEMA_VERSION);
  }
  if (!getMetaValue_('Initialized At')) {
    setMetaValue_('Initialized At', nowIso_());
  }
}

/**
 * Version migrations are additive. Header migration runs on every setup and
 * appends missing canonical columns or renames recognized legacy aliases.
 */
function runVersionMigrations_(fromVersion, ss) {
  var version = fromVersion;
  while (version < STUDIO_SCHEMA_VERSION) {
    switch (version + 1) {
      case 1:
        // Version 1 is established by the additive header setup above.
        break;
      default:
        throw new Error('No migration is registered for schema version ' + (version + 1) + '.');
    }
    version += 1;
  }
}

function ensureCollectionSheet_(ss, def) {
  var headerDef = {
    sheetName: def.sheetName,
    headers: def.fields.map(function(field) { return field.header; }),
    aliases: {}
  };
  def.fields.forEach(function(field) {
    headerDef.aliases[field.header] = field.aliases || [];
  });
  ensureHeaderSheet_(ss, headerDef);
}

/**
 * Ensures canonical headers without clearing, reordering, or dropping any
 * existing columns. Unknown user columns stay where they are.
 */
function ensureHeaderSheet_(ss, headerDef) {
  var sheet = ss.getSheetByName(headerDef.sheetName);
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet(headerDef.sheetName);
    created = true;
  }

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow === 0 || lastColumn === 0) {
    ensureGridSize_(sheet, 1, headerDef.headers.length);
    sheet.getRange(1, 1, 1, headerDef.headers.length).setValues([headerDef.headers]);
    formatHeader_(sheet, headerDef.headers.length);
    return sheet;
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  });
  assertNoDuplicateHeaders_(headers, headerDef.sheetName);

  var recognized = 0;
  headerDef.headers.forEach(function(canonical) {
    if (headers.indexOf(canonical) >= 0) {
      recognized += 1;
      return;
    }
    var aliases = (headerDef.aliases && headerDef.aliases[canonical]) || [];
    var aliasIndex = -1;
    for (var i = 0; i < aliases.length; i += 1) {
      aliasIndex = headers.indexOf(aliases[i]);
      if (aliasIndex >= 0) break;
    }
    if (aliasIndex >= 0) {
      sheet.getRange(1, aliasIndex + 1).setValue(canonical);
      headers[aliasIndex] = canonical;
      recognized += 1;
    }
  });

  var hasAnyContent = headers.some(function(header) { return header !== ''; }) || lastRow > 1;
  if (!created && hasAnyContent && recognized === 0) {
    throw new Error(
      'Sheet "' + headerDef.sheetName + '" already contains unrecognized data. ' +
      'Rename or back up that sheet before running setup; no data was overwritten.'
    );
  }

  var missing = headerDef.headers.filter(function(canonical) {
    return headers.indexOf(canonical) < 0;
  });
  if (missing.length) {
    ensureGridSize_(sheet, 1, lastColumn + missing.length);
    sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
    lastColumn += missing.length;
  }
  formatHeader_(sheet, lastColumn);
  return sheet;
}

function formatHeader_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount).setFontWeight('bold');
}

function assertNoDuplicateHeaders_(headers, sheetName) {
  var seen = newDictionary_();
  headers.forEach(function(header) {
    if (!header) return;
    if (seen[header]) {
      throw new Error('Sheet "' + sheetName + '" has duplicate header "' + header + '".');
    }
    seen[header] = true;
  });
}


// ===== Reads ================================================================

function loadStudioUnlocked_() {
  var state = {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    loadedAt: nowIso_(),
    settings: readSettings_()
  };
  STUDIO_COLLECTION_KEYS.forEach(function(key) {
    state[key] = readCollection_(key);
  });
  return state;
}

function readCollection_(key) {
  var def = STUDIO_COLLECTIONS[key];
  var sheet = getSpreadsheet_().getSheetByName(def.sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn === 0) return [];

  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(function(value) { return String(value || '').trim(); });
  var headerMap = headerIndexMap_(headers);
  var idColumn = headerMap[def.idField.header];
  var seen = newDictionary_();
  var out = [];

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex];
    if (rowEveryBlank_(row)) continue;
    var rawId = row[idColumn];
    if (rawId === '' || rawId === null || rawId === undefined) {
      throw new Error(def.sheetName + ' row ' + (rowIndex + 1) + ' has data but no ' + def.idField.header + '.');
    }
    var record = {};
    def.fields.forEach(function(field) {
      var column = headerMap[field.header];
      record[field.key] = deserializeField_(row[column], field, def.sheetName, rowIndex + 1);
    });
    record.id = validateId_(record.id, def.sheetName + ' row ' + (rowIndex + 1) + ' ID');
    if (seen[record.id]) {
      throw new Error(def.sheetName + ' contains duplicate ID ' + record.id + '.');
    }
    seen[record.id] = true;
    out.push(record);
  }
  return out;
}

function readSettings_() {
  var sheet = getSpreadsheet_().getSheetByName(STUDIO_SETTINGS_SHEET.sheetName);
  if (!sheet || sheet.getLastRow() < 2) return {};

  var settings = cloneJson_(DEFAULT_STUDIO_SETTINGS);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(value) { return String(value || '').trim(); });
  var map = headerIndexMap_(headers);
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var path = String(values[rowIndex][map['Setting Path']] || '').trim();
    if (!path) continue;
    validateSettingPath_(path);
    var rawValue = values[rowIndex][map.Value];
    var type = inferSettingType_(rawValue, values[rowIndex][map['Value Type']]);
    var value = deserializeSettingValue_(rawValue, type, rowIndex + 1);
    setNestedPath_(settings, path, value);
  }
  return normalizeSettings_(settings);
}


// ===== Single-record and collection writes =================================

function writeSingleRecord_(key, record) {
  var def = STUDIO_COLLECTIONS[key];
  var sheet = getSpreadsheet_().getSheetByName(def.sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  var map = headerIndexMap_(headers);
  var rowNumber = findRowById_(sheet, def, record.id);
  var width = sheet.getLastColumn();
  var row;

  if (rowNumber >= 2) {
    row = formulaAwareMatrix_(sheet.getRange(rowNumber, 1, 1, width))[0];
  } else {
    rowNumber = sheet.getLastRow() + 1;
    ensureGridSize_(sheet, rowNumber, width);
    row = blankRow_(width);
  }

  def.fields.forEach(function(field) {
    row[map[field.header]] = serializeField_(record[field.key], field);
  });
  sheet.getRange(rowNumber, 1, 1, width).setValues([row]);
}

/**
 * Replaces a selected collection while preserving unknown columns for records
 * that keep the same ID.
 */
function writeCollection_(key, records) {
  var def = STUDIO_COLLECTIONS[key];
  var sheet = getSpreadsheet_().getSheetByName(def.sheetName);
  var width = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  var map = headerIndexMap_(headers);
  var existingRows = existingFormulaAwareRowsById_(sheet, def, map);

  var rows = records.map(function(record) {
    var row = existingRows[record.id] ? existingRows[record.id].slice() : blankRow_(width);
    def.fields.forEach(function(field) {
      row[map[field.header]] = serializeField_(record[field.key], field);
    });
    return row;
  });

  replaceDataRows_(sheet, rows, width);
}

function writeSettings_(settings) {
  var normalized = normalizeSettings_(settings);
  var entries = flattenSettings_(normalized);
  var sheet = getSpreadsheet_().getSheetByName(STUDIO_SETTINGS_SHEET.sheetName);
  var width = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  var map = headerIndexMap_(headers);
  var existing = existingRowsByKey_(sheet, map['Setting Path']);
  var now = nowIso_();

  var rows = entries.map(function(entry) {
    var row = existing[entry.path] ? existing[entry.path].slice() : blankRow_(width);
    var encoded = serializeSettingValue_(entry.value);
    row[map['Setting Path']] = serializeSafeString_(entry.path);
    row[map.Value] = encoded.value;
    row[map['Value Type']] = encoded.type;
    row[map['Updated At']] = now;
    return row;
  });
  replaceDataRows_(sheet, rows, width);
}

function replaceDataRows_(sheet, rows, width) {
  var currentRows = Math.max(0, sheet.getLastRow() - 1);
  var rowsToClear = Math.max(currentRows, rows.length);
  ensureGridSize_(sheet, rows.length + 1, width);
  if (rowsToClear > 0) {
    sheet.getRange(2, 1, rowsToClear, width).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, width).setValues(rows);
  }
}


// ===== Validation and business integrity ===================================

function normalizeCollectionPayload_(key, records, existingMap, now, resetMode) {
  if (records.length > STUDIO_MAX_RECORDS_PER_COLLECTION) {
    throw new Error(
      key + ' exceeds the limit of ' + STUDIO_MAX_RECORDS_PER_COLLECTION + ' records per batch.'
    );
  }
  var seen = newDictionary_();
  return records.map(function(raw, index) {
    assertPlainObject_(raw, key + '[' + index + ']');
    var requestedId = raw.id === undefined || raw.id === null || raw.id === ''
      ? ''
      : validateId_(raw.id, key + '[' + index + '].id');
    var existing = requestedId ? existingMap[requestedId] || null : null;
    var record = normalizeRecord_(key, raw, existing, {
      allowGeneratedId: true,
      allowProvidedTimestamps: !!resetMode,
      preserveUpdatedAt: !!(STUDIO_COLLECTIONS[key].appendOnly && existing),
      now: now,
      resetMode: !!resetMode
    });
    if (seen[record.id]) throw new Error(key + ' contains duplicate ID ' + record.id + '.');
    seen[record.id] = true;
    enforceImmutableFields_(STUDIO_COLLECTIONS[key], existing, record);
    if (existing && recordsEqualExceptFields_(
      STUDIO_COLLECTIONS[key],
      existing,
      record,
      ['updatedAt']
    )) {
      record.updatedAt = existing.updatedAt;
    }
    return record;
  });
}

function normalizeRecord_(key, raw, existing, options) {
  var def = STUDIO_COLLECTIONS[key];
  var allowed = newDictionary_();
  def.fields.forEach(function(field) { allowed[field.key] = true; });
  Object.keys(raw).forEach(function(property) {
    if (!allowed[property]) {
      throw new Error(key + ' record contains unsupported field "' + property + '".');
    }
  });

  var source = existing ? shallowMerge_(existing, raw) : shallowMerge_({}, raw);
  var now = options.now || nowIso_();
  var id = source.id;
  if (id === undefined || id === null || id === '') {
    if (!options.allowGeneratedId) throw new Error(key + ' record requires an ID.');
    id = newRecordId_(def.idPrefix);
  }
  id = validateId_(id, key + ' record ID');
  source.id = id;

  var normalized = {};
  def.fields.forEach(function(field) {
    if (field.key === 'createdAt' || field.key === 'updatedAt') return;
    normalized[field.key] = normalizeFieldValue_(source[field.key], field, key + '.' + field.key);
  });

  if ((key === 'tuitionCharges' || key === 'payments') &&
      normalized.status === 'Void' && (!existing || existing.status !== 'Void')) {
    normalized.voidedAt = now;
  }

  var suppliedCreatedAt = options.allowProvidedTimestamps && source.createdAt
    ? normalizeFieldValue_(source.createdAt, def.fieldByKey.createdAt, key + '.createdAt')
    : '';
  normalized.createdAt = existing && existing.createdAt
    ? existing.createdAt
    : suppliedCreatedAt || now;

  if (options.preserveUpdatedAt && existing && existing.updatedAt) {
    normalized.updatedAt = existing.updatedAt;
  } else if (options.resetMode && options.allowProvidedTimestamps && source.updatedAt) {
    normalized.updatedAt = normalizeFieldValue_(source.updatedAt, def.fieldByKey.updatedAt, key + '.updatedAt');
  } else {
    normalized.updatedAt = now;
  }

  validateRequiredFields_(def, normalized, key);
  validateRecordSpecificRules_(key, normalized);
  return normalized;
}

function normalizeFieldValue_(value, field, label) {
  var isMissing = value === undefined || value === null || value === '';
  if (isMissing && field.defaultValue !== undefined) {
    value = cloneValue_(field.defaultValue);
    isMissing = false;
  }
  if (isMissing) {
    if (field.type === 'boolean') return false;
    if (field.type === 'array') return [];
    if (field.type === 'object') return {};
    if (field.type === 'number') return null;
    return '';
  }

  var normalized;
  switch (field.type) {
    case 'id':
      normalized = validateId_(value, label);
      break;
    case 'string':
      if (typeof value === 'object' || typeof value === 'function') {
        throw new Error(label + ' must be text.');
      }
      normalized = String(value);
      break;
    case 'number':
      normalized = Number(value);
      if (!isFiniteNumber_(normalized)) throw new Error(label + ' must be a finite number.');
      if (field.integer && Math.floor(normalized) !== normalized) {
        throw new Error(label + ' must be a whole number.');
      }
      if (field.min !== undefined && normalized < field.min) {
        throw new Error(label + ' must be at least ' + field.min + '.');
      }
      if (field.max !== undefined && normalized > field.max) {
        throw new Error(label + ' must be no more than ' + field.max + '.');
      }
      break;
    case 'boolean':
      if (value === true || value === false) normalized = value;
      else if (value === 1 || String(value).toLowerCase() === 'true') normalized = true;
      else if (value === 0 || String(value).toLowerCase() === 'false') normalized = false;
      else throw new Error(label + ' must be true or false.');
      break;
    case 'array':
      if (!Array.isArray(value)) throw new Error(label + ' must be an array.');
      assertSafeJson_(value, label);
      normalized = cloneJson_(value);
      break;
    case 'object':
      assertPlainObject_(value, label);
      assertSafeJson_(value, label);
      normalized = cloneJson_(value);
      break;
    case 'date':
      normalized = validateDate_(value, label);
      break;
    case 'time':
      normalized = validateTime_(value, label);
      break;
    case 'datetime':
      normalized = validateDateTime_(value, label);
      break;
    default:
      throw new Error('Unsupported schema type "' + field.type + '" for ' + label + '.');
  }

  if (typeof normalized === 'string') {
    var limit = field.maxLength || STUDIO_MAX_TEXT_LENGTH;
    if (normalized.length > limit) {
      throw new Error(label + ' exceeds the maximum length of ' + limit + ' characters.');
    }
  }
  if (field.enum && field.enum.indexOf(normalized) < 0) {
    throw new Error(label + ' must be one of: ' + field.enum.join(', ') + '.');
  }
  return normalized;
}

function validateRequiredFields_(def, record, key) {
  def.fields.forEach(function(field) {
    if (!field.required) return;
    var value = record[field.key];
    var empty = value === '' || value === null || value === undefined ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);
    if (empty) throw new Error(key + '.' + field.key + ' is required.');
  });
}

function validateRecordSpecificRules_(key, record) {
  if ((key === 'students' || key === 'guardians' || key === 'inquiries') && record.email) {
    validateEmail_(record.email, key + '.email');
  }
  if (key === 'lessons' && (!!record.studentId === !!record.inquiryId)) {
    throw new Error('A lesson must reference exactly one student or inquiry.');
  }
  if (key === 'lessons' && record.status === 'Completed' && !record.completedAt) {
    throw new Error('A completed lesson requires completedAt.');
  }
  if (key === 'lessons' && record.status !== 'Completed' && record.completedAt) {
    throw new Error('Only a completed lesson may carry completedAt.');
  }
  if (key === 'students' && record.inactiveDate && record.startDate &&
      record.inactiveDate < record.startDate) {
    throw new Error('A student inactive date cannot be before the start date.');
  }
  if (key === 'recurringSchedules' && record.effectiveTo && record.effectiveFrom &&
      record.effectiveTo < record.effectiveFrom) {
    throw new Error('A recurring schedule end date cannot be before its start date.');
  }
  if (key === 'tuitionCharges' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.period)) {
    throw new Error('A tuition charge period must use YYYY-MM.');
  }
  if (key === 'repertoire') {
    if (record.status === 'Completed' && !record.dateCompleted) {
      throw new Error('Completed repertoire requires a completion date.');
    }
    if (record.status !== 'Completed' && record.dateCompleted) {
      throw new Error('Current repertoire cannot carry a current dateCompleted value.');
    }
    if (record.reactivatedFromId && record.reactivatedFromId === record.id) {
      throw new Error('A repertoire record cannot reactivate itself.');
    }
  }
  if (key === 'tuitionCharges' || key === 'payments') {
    if (record.status === 'Void' && !String(record.voidReason || '').trim()) {
      throw new Error(key + '.voidReason is required when a transaction is voided.');
    }
    if (record.status === 'Posted' && (record.voidedAt || record.voidReason)) {
      throw new Error(key + ' void metadata is only allowed on a void transaction.');
    }
  }
  if (key === 'recitals' && record.status === 'Completed' && !record.date) {
    throw new Error('A completed recital requires a date.');
  }
}

function validateProspectiveState_(state, options) {
  STUDIO_COLLECTION_KEYS.forEach(function(key) {
    if (!Array.isArray(state[key])) throw new Error('Prospective state is missing ' + key + '.');
  });

  var ids = newDictionary_();
  STUDIO_COLLECTION_KEYS.forEach(function(key) {
    ids[key] = newDictionary_();
    state[key].forEach(function(record) {
      validateId_(record.id, key + ' ID');
      if (ids[key][record.id]) throw new Error(key + ' contains duplicate ID ' + record.id + '.');
      ids[key][record.id] = true;
    });
  });

  STUDIO_COLLECTION_KEYS.forEach(function(key) {
    var def = STUDIO_COLLECTIONS[key];
    state[key].forEach(function(record) {
      def.fields.forEach(function(field) {
        if (!field.ref || !record[field.key]) return;
        if (!ids[field.ref][record[field.key]]) {
          throw new Error(
            key + ' record ' + record.id + ' references missing ' + field.ref +
            ' ID ' + record[field.key] + ' through ' + field.key + '.'
          );
        }
      });
    });
  });

  validateCrossRecordRules_(state, options || {});
}

function validateCrossRecordRules_(state, options) {
  var students = recordsById_(state.students);
  var inquiries = recordsById_(state.inquiries);
  var schedules = recordsById_(state.recurringSchedules);
  var lessons = recordsById_(state.lessons);
  var repertoire = recordsById_(state.repertoire);
  var recitals = recordsById_(state.recitals);
  var charges = recordsById_(state.tuitionCharges);
  var pairs = newDictionary_();
  var guardianCounts = newDictionary_();

  state.studentGuardians.forEach(function(link) {
    var pair = link.studentId + '::' + link.guardianId;
    if (pairs[pair]) {
      throw new Error('A student and guardian may only be linked once (' + pair + ').');
    }
    pairs[pair] = true;
    guardianCounts[link.studentId] = (guardianCounts[link.studentId] || 0) + 1;
  });

  ['primaryContact', 'billingContact'].forEach(function(field) {
    var contactsByStudent = newDictionary_();
    state.studentGuardians.forEach(function(link) {
      if (!link[field]) return;
      if (contactsByStudent[link.studentId]) {
        throw new Error(
          'Student ' + link.studentId + ' may have only one ' +
          (field === 'primaryContact' ? 'primary' : 'billing') + ' guardian.'
        );
      }
      contactsByStudent[link.studentId] = link.guardianId;
    });
  });

  state.students.forEach(function(student) {
    if (student.studentType === 'Minor' && !guardianCounts[student.id]) {
      throw new Error('Minor student ' + student.id + ' must have at least one guardian.');
    }
  });

  validateSchedulesAndOccurrences_(state, students);

  state.lessons.forEach(function(lesson) {
    if (lesson.inquiryId) {
      var inquiry = inquiries[lesson.inquiryId];
      if (lesson.type !== 'Trial') {
        throw new Error('Only a Trial lesson may reference an inquiry.');
      }
      if (inquiry && inquiry.trialLessonId !== lesson.id &&
          !lessonIsRescheduledPredecessor_(
            lesson.id,
            inquiry.trialLessonId,
            lessons
          )) {
        throw new Error('Inquiry ' + inquiry.id + ' must link back to trial lesson ' + lesson.id + '.');
      }
    }
    if (lesson.sourceScheduleId) {
      var schedule = schedules[lesson.sourceScheduleId];
      if (schedule && schedule.studentId !== lesson.studentId) {
        throw new Error('Lesson ' + lesson.id + ' uses a recurring schedule belonging to another student.');
      }
    }
  });

  state.assignments.forEach(function(assignment) {
    if (assignment.lessonId && lessons[assignment.lessonId] &&
        lessons[assignment.lessonId].studentId !== assignment.studentId) {
      throw new Error('Assignment ' + assignment.id + ' links to a lesson for another student.');
    }
    if (assignment.repertoireId && repertoire[assignment.repertoireId] &&
        repertoire[assignment.repertoireId].studentId !== assignment.studentId) {
      throw new Error('Assignment ' + assignment.id + ' links to repertoire for another student.');
    }
  });

  validateMakeupConsistency_(state, lessons, options);
  validateInquiryConsistency_(state, lessons);
  validateRepertoireConsistency_(state, repertoire);

  state.recitalParticipants.forEach(function(participant) {
    var recital = recitals[participant.recitalId];
    if (!recital) return;
    if (participant.repertoireId && repertoire[participant.repertoireId] &&
        repertoire[participant.repertoireId].studentId !== participant.studentId) {
      throw new Error('Recital participant ' + participant.id + ' uses repertoire for another student.');
    }
    if (options.strictImportedHistory && recital.status === 'Completed') {
      assertCompletionSnapshot_(participant, state);
    }
  });

  state.payments.forEach(function(payment) {
    if (!payment.chargeId) return;
    var charge = charges[payment.chargeId];
    if (charge && payment.studentId && charge.studentId !== payment.studentId) {
      throw new Error('Payment ' + payment.id + ' is assigned to a charge for another student.');
    }
    if (charge && charge.status === 'Void' && payment.status !== 'Void') {
      throw new Error('Posted payment ' + payment.id + ' cannot be assigned to a void charge.');
    }
  });

  var paidByCharge = newDictionary_();
  state.payments.forEach(function(payment) {
    if (!payment.chargeId || payment.status === 'Void') return;
    paidByCharge[payment.chargeId] = (paidByCharge[payment.chargeId] || 0) + payment.amount;
  });
  Object.keys(paidByCharge).forEach(function(chargeId) {
    var charge = charges[chargeId];
    if (charge && paidByCharge[chargeId] > charge.amount + 0.000001) {
      throw new Error('Payments assigned to charge ' + chargeId + ' exceed the charge amount.');
    }
  });
}

function validateSchedulesAndOccurrences_(state, students) {
  var activeByStudent = newDictionary_();
  var activeSchedules = [];
  state.recurringSchedules.forEach(function(schedule) {
    if (!schedule.active) return;
    if (activeByStudent[schedule.studentId]) {
      throw new Error('Student ' + schedule.studentId + ' may have only one active recurring schedule.');
    }
    if (students[schedule.studentId] && students[schedule.studentId].status !== 'Active') {
      throw new Error('Only active students may have an active recurring schedule.');
    }
    activeByStudent[schedule.studentId] = schedule.id;
    activeSchedules.push(schedule);
  });

  for (var leftIndex = 0; leftIndex < activeSchedules.length; leftIndex += 1) {
    var left = activeSchedules[leftIndex];
    var leftStart = minutesFromTime_(left.startTime);
    var leftEnd = leftStart + left.duration;
    if (leftEnd > 24 * 60) {
      throw new Error('Recurring schedule ' + left.id + ' extends past midnight.');
    }
    for (var rightIndex = leftIndex + 1; rightIndex < activeSchedules.length; rightIndex += 1) {
      var right = activeSchedules[rightIndex];
      if (left.day !== right.day || !scheduleDateRangesOverlap_(left, right)) continue;
      var rightStart = minutesFromTime_(right.startTime);
      var rightEnd = rightStart + right.duration;
      if (leftStart < rightEnd && leftEnd > rightStart) {
        throw new Error(
          'Active recurring schedules ' + left.id + ' and ' + right.id +
          ' overlap on ' + left.day + '.'
        );
      }
    }
  }

  var occurrences = newDictionary_();
  state.lessons.forEach(function(lesson) {
    if (!lesson.sourceScheduleId) return;
    var occurrence = lesson.sourceScheduleId + '::' + lesson.date;
    if (occurrences[occurrence]) {
      throw new Error(
        'Recurring schedule ' + lesson.sourceScheduleId +
        ' has more than one lesson occurrence on ' + lesson.date + '.'
      );
    }
    occurrences[occurrence] = lesson.id;
  });
}

function scheduleDateRangesOverlap_(left, right) {
  var leftStart = left.effectiveFrom || '0000-01-01';
  var leftEnd = left.effectiveTo || '9999-12-31';
  var rightStart = right.effectiveFrom || '0000-01-01';
  var rightEnd = right.effectiveTo || '9999-12-31';
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function minutesFromTime_(time) {
  var parts = String(time).split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function validateMakeupConsistency_(state, lessons, options) {
  var sourceLessons = newDictionary_();
  var scheduledLessons = newDictionary_();
  state.makeupCredits.forEach(function(credit) {
    if (credit.lessonId) {
      if (sourceLessons[credit.lessonId]) {
        throw new Error('Lesson ' + credit.lessonId + ' may create only one makeup credit.');
      }
      sourceLessons[credit.lessonId] = credit.id;
      var sourceLesson = lessons[credit.lessonId];
      if (sourceLesson && sourceLesson.studentId !== credit.studentId) {
        throw new Error('Makeup credit ' + credit.id + ' belongs to a different student than its source lesson.');
      }
      if (sourceLesson &&
          (sourceLesson.type === 'Makeup' ||
           ['Student Cancelled', 'Teacher Cancelled'].indexOf(sourceLesson.status) < 0)) {
        throw new Error(
          'Makeup credit ' + credit.id +
          ' must come from an eligible cancelled non-Makeup lesson.'
        );
      }
      if (sourceLesson && credit.createdDate !== sourceLesson.date) {
        throw new Error(
          'Makeup credit ' + credit.id + ' must use its source lesson date as createdDate.'
        );
      }
    }
    if (credit.scheduledLessonId) {
      if (credit.scheduledLessonId === credit.lessonId) {
        throw new Error('A makeup credit cannot redeem the lesson that created it.');
      }
      if (scheduledLessons[credit.scheduledLessonId]) {
        throw new Error('A makeup lesson may redeem only one credit.');
      }
      scheduledLessons[credit.scheduledLessonId] = credit.id;
      var scheduledLesson = lessons[credit.scheduledLessonId];
      if (scheduledLesson && scheduledLesson.studentId !== credit.studentId) {
        throw new Error('Makeup credit ' + credit.id + ' belongs to a different student than its makeup lesson.');
      }
      if (scheduledLesson && scheduledLesson.type !== 'Makeup') {
        throw new Error('Makeup credit ' + credit.id + ' must link to a Makeup lesson.');
      }
    }

    if (credit.status === 'Owed') {
      if (credit.scheduledLessonId || credit.completedDate) {
        throw new Error('Owed makeup credit ' + credit.id + ' cannot have redemption details.');
      }
    } else if (credit.status === 'Scheduled') {
      var pendingLesson = lessons[credit.scheduledLessonId];
      if (!credit.scheduledLessonId || !pendingLesson || pendingLesson.status !== 'Scheduled') {
        throw new Error('Scheduled makeup credit ' + credit.id + ' requires a scheduled Makeup lesson.');
      }
      if (credit.completedDate) {
        throw new Error('Scheduled makeup credit ' + credit.id + ' cannot have a completion date.');
      }
    } else if (credit.status === 'Completed') {
      if (!credit.completedDate) {
        throw new Error('Completed makeup credit ' + credit.id + ' requires a completion date.');
      }
      if ((options && options.strictImportedHistory) && !credit.scheduledLessonId) {
        throw new Error(
          'Imported completed makeup credit ' + credit.id + ' requires its redeemed lesson.'
        );
      }
      if (credit.scheduledLessonId) {
        var completedLesson = lessons[credit.scheduledLessonId];
        if (!completedLesson || completedLesson.status !== 'Completed') {
          throw new Error('Completed makeup credit ' + credit.id + ' must link to a completed lesson.');
        }
        if (credit.completedDate !== completedLesson.date) {
          throw new Error(
            'Completed makeup credit ' + credit.id +
            ' must use the redeemed lesson date as completedDate.'
          );
        }
      }
    } else if (credit.scheduledLessonId || credit.completedDate) {
      throw new Error(credit.status + ' makeup credit ' + credit.id + ' cannot retain redemption details.');
    }
  });
}

function validateInquiryConsistency_(state, lessons) {
  var convertedStudents = newDictionary_();
  var trialOwners = newDictionary_();
  var inquiries = recordsById_(state.inquiries);
  state.inquiries.forEach(function(inquiry) {
    var converted = inquiry.status === 'Converted';
    if (converted !== !!inquiry.convertedStudentId) {
      throw new Error(
        'Inquiry ' + inquiry.id + ' must have status Converted exactly when convertedStudentId is set.'
      );
    }
    if (inquiry.convertedStudentId) {
      if (convertedStudents[inquiry.convertedStudentId]) {
        throw new Error('A student may be linked as the conversion result of only one inquiry.');
      }
      convertedStudents[inquiry.convertedStudentId] = inquiry.id;
    }
    if (!inquiry.trialLessonId) {
      if (inquiry.status === 'Trial Scheduled' || inquiry.status === 'Trial Completed') {
        throw new Error(inquiry.status + ' inquiry ' + inquiry.id + ' requires a trial lesson.');
      }
      return;
    }
    if (trialOwners[inquiry.trialLessonId]) {
      throw new Error('A trial lesson may belong to only one inquiry.');
    }
    trialOwners[inquiry.trialLessonId] = inquiry.id;
    var trial = lessons[inquiry.trialLessonId];
    if (!trial || trial.type !== 'Trial') {
      throw new Error('Inquiry ' + inquiry.id + ' must link to a Trial lesson.');
    }
    if (converted) {
      if (trial.studentId !== inquiry.convertedStudentId || trial.inquiryId) {
        throw new Error(
          'Converted inquiry ' + inquiry.id + ' must transfer its trial lesson to the converted student.'
        );
      }
    } else if (trial.inquiryId !== inquiry.id || trial.studentId) {
      throw new Error('Inquiry ' + inquiry.id + ' must own its unconverted trial lesson.');
    }
    if (inquiry.status === 'Trial Completed' && trial.status !== 'Completed') {
      throw new Error('Trial Completed inquiry ' + inquiry.id + ' requires a completed trial lesson.');
    }
  });

  state.lessons.forEach(function(lesson) {
    if (lesson.type !== 'Trial') return;
    if (lesson.inquiryId) {
      var owner = inquiries[lesson.inquiryId] || null;
      if (trialOwners[lesson.id] !== lesson.inquiryId &&
          (!owner || !lessonIsRescheduledPredecessor_(
            lesson.id,
            owner.trialLessonId,
            lessons
          ))) {
        throw new Error('Trial lesson ' + lesson.id + ' must be linked from its inquiry.');
      }
      return;
    }
    if (!lesson.studentId || !trialOwners[lesson.id]) {
      throw new Error(
        'A student-owned Trial lesson must remain linked to the inquiry that converted it.'
      );
    }
  });
}

function lessonIsRescheduledPredecessor_(candidateId, currentId, lessons) {
  var candidate = lessons[candidateId] || null;
  if (!candidate || candidate.status !== 'Rescheduled' || !currentId) return false;
  var cursor = lessons[currentId] || null;
  var seen = newDictionary_();
  while (cursor && cursor.rescheduledFromId && !seen[cursor.id]) {
    if (cursor.rescheduledFromId === candidateId) return true;
    seen[cursor.id] = true;
    cursor = lessons[cursor.rescheduledFromId] || null;
  }
  return false;
}

function validateRepertoireConsistency_(state, repertoire) {
  var activeBySource = newDictionary_();
  state.repertoire.forEach(function(item) {
    if (!item.reactivatedFromId) return;
    var source = repertoire[item.reactivatedFromId];
    if (!source || source.status !== 'Completed') {
      throw new Error('Reactivated repertoire ' + item.id + ' must link to a completed repertoire record.');
    }
    if (source.studentId !== item.studentId) {
      throw new Error('Reactivated repertoire ' + item.id + ' must belong to the same student as its source.');
    }
    if (item.status !== 'Completed') {
      if (activeBySource[item.reactivatedFromId]) {
        throw new Error('A completed repertoire record may have only one current reactivation.');
      }
      activeBySource[item.reactivatedFromId] = item.id;
    }
  });
}

/**
 * Validates allowed before/after transitions. Final-state validation alone
 * cannot detect a stale client rewriting an archival row into another state.
 */
function enforceStateLifecycleTransitions_(currentState, nextState, options) {
  var opts = options || {};
  enforceCompletedLessonTransitions_(currentState, nextState);
  enforceRecitalTransitions_(currentState, nextState);
  enforceAssignmentTransitions_(currentState, nextState);
  enforceMakeupTransitions_(currentState, nextState);
  enforceInquiryTransitions_(currentState, nextState);
  enforceRepertoireTransitions_(currentState, nextState, opts);
}

function enforceCompletedLessonTransitions_(currentState, nextState) {
  var nextLessons = recordsById_(nextState.lessons);
  currentState.lessons.forEach(function(existing) {
    if (existing.status !== 'Completed') return;
    var next = nextLessons[existing.id];
    if (!next) {
      throw new Error('Completed lesson ' + existing.id + ' cannot be deleted.');
    }
    if (recordsEqualExceptFields_(
      STUDIO_COLLECTIONS.lessons,
      existing,
      next,
      ['updatedAt']
    )) return;
    if (!isAtomicCompletedTrialConversion_(existing, next, currentState, nextState)) {
      throw new Error(
        'Completed lesson ' + existing.id +
        ' is read-only except for its atomic inquiry-to-student conversion.'
      );
    }
  });
}

function isAtomicCompletedTrialConversion_(existing, next, currentState, nextState) {
  if (existing.type !== 'Trial' || next.type !== 'Trial' ||
      existing.status !== 'Completed' || next.status !== 'Completed' ||
      !existing.inquiryId || existing.studentId ||
      !next.studentId || next.inquiryId) {
    return false;
  }
  if (!recordsEqualExceptFields_(
    STUDIO_COLLECTIONS.lessons,
    existing,
    next,
    ['studentId', 'inquiryId', 'updatedAt']
  )) return false;

  var currentInquiry = recordsById_(currentState.inquiries)[existing.inquiryId] || null;
  var nextInquiry = recordsById_(nextState.inquiries)[existing.inquiryId] || null;
  if (!currentInquiry || !nextInquiry ||
      currentInquiry.status === 'Converted' ||
      currentInquiry.convertedStudentId ||
      currentInquiry.trialLessonId !== existing.id) {
    return false;
  }
  return nextInquiry.status === 'Converted' &&
    nextInquiry.convertedStudentId === next.studentId &&
    nextInquiry.trialLessonId === existing.id;
}

function enforceRecitalTransitions_(currentState, nextState) {
  var currentRecitals = recordsById_(currentState.recitals);
  var nextRecitals = recordsById_(nextState.recitals);
  var nextParticipants = recordsById_(nextState.recitalParticipants);

  currentState.recitals.forEach(function(existing) {
    if (existing.status !== 'Completed') return;
    var next = nextRecitals[existing.id];
    if (!next || !recordsEqualExceptFields_(
      STUDIO_COLLECTIONS.recitals,
      existing,
      next,
      ['updatedAt']
    )) {
      throw new Error('Completed recital ' + existing.id + ' is read-only and cannot be deleted.');
    }
  });

  currentState.recitalParticipants.forEach(function(existing) {
    var recital = currentRecitals[existing.recitalId];
    if (!recital || recital.status !== 'Completed') return;
    var next = nextParticipants[existing.id];
    if (!next) {
      throw new Error(
        'Participant ' + existing.id + ' belongs to a completed recital and is read-only.'
      );
    }
    if (recordsEqualExceptFields_(
      STUDIO_COLLECTIONS.recitalParticipants,
      existing,
      next,
      ['updatedAt']
    )) return;
    if (!isCompletedParticipantSnapshotRepair_(existing, next, nextState)) {
      throw new Error(
        'Participant ' + existing.id + ' belongs to a completed recital and is read-only.'
      );
    }
  });

  nextState.recitalParticipants.forEach(function(next) {
    var existing = recordsById_(currentState.recitalParticipants)[next.id] || null;
    var previouslyCompleted = currentRecitals[next.recitalId] &&
      currentRecitals[next.recitalId].status === 'Completed';
    if (previouslyCompleted && (!existing || existing.recitalId !== next.recitalId)) {
      throw new Error('Participants cannot be added to a completed recital.');
    }
  });

  nextState.recitals.forEach(function(nextRecital) {
    var existingRecital = currentRecitals[nextRecital.id] || null;
    if (nextRecital.status !== 'Completed' ||
        (existingRecital && existingRecital.status === 'Completed')) return;
    nextState.recitalParticipants.forEach(function(participant) {
      if (participant.recitalId === nextRecital.id) {
        assertCompletionSnapshot_(participant, nextState);
      }
    });
  });
}

function isCompletedParticipantSnapshotRepair_(existing, next, nextState) {
  var snapshotFields = [
    'studentNameSnapshot',
    'pieceTitleSnapshot',
    'composerSnapshot'
  ];
  if (!recordsEqualExceptFields_(
    STUDIO_COLLECTIONS.recitalParticipants,
    existing,
    next,
    snapshotFields.concat(['updatedAt'])
  )) return false;

  var changed = false;
  for (var index = 0; index < snapshotFields.length; index += 1) {
    var field = snapshotFields[index];
    if (existing[field] && existing[field] !== next[field]) return false;
    if (!existing[field] && next[field]) changed = true;
  }
  if (!changed) return false;
  assertCompletionSnapshot_(next, nextState);
  return true;
}

function assertCompletionSnapshot_(participant, state) {
  var student = recordsById_(state.students)[participant.studentId] || null;
  var repertoire = participant.repertoireId
    ? recordsById_(state.repertoire)[participant.repertoireId] || null
    : null;
  var expectedStudentName = student
    ? [student.preferredName || student.firstName, student.lastName]
      .filter(function(value) { return !!value; })
      .join(' ')
    : '';
  if (participant.studentNameSnapshot !== expectedStudentName) {
    throw new Error(
      'Participant ' + participant.id +
      ' must snapshot the current student name before the recital is completed.'
    );
  }
  if (repertoire &&
      (participant.pieceTitleSnapshot !== repertoire.title ||
       participant.composerSnapshot !== repertoire.composer)) {
    throw new Error(
      'Participant ' + participant.id +
      ' must snapshot the current piece details before the recital is completed.'
    );
  }
}

function enforceAssignmentTransitions_(currentState, nextState) {
  var nextAssignments = recordsById_(nextState.assignments);
  var currentAssignments = recordsById_(currentState.assignments);
  var terminal = {
    Previous: true,
    Completed: true,
    Cancelled: true
  };
  currentState.assignments.forEach(function(existing) {
    var next = nextAssignments[existing.id];
    if (!next) {
      throw new Error('Assignment ' + existing.id + ' is archival and cannot be deleted.');
    }
    if (terminal[existing.status]) {
      if (!recordsEqualExceptFields_(
        STUDIO_COLLECTIONS.assignments,
        existing,
        next,
        ['updatedAt']
      )) {
        throw new Error('Archived assignment ' + existing.id + ' is read-only.');
      }
      return;
    }
    if (existing.status !== 'Current') {
      throw new Error('Assignment ' + existing.id + ' has an unsupported prior status.');
    }
    if (['Current', 'Previous', 'Completed', 'Cancelled'].indexOf(next.status) < 0) {
      throw new Error('Assignment ' + existing.id + ' has an invalid status transition.');
    }
    if (next.status !== 'Current' && !recordsEqualExceptFields_(
      STUDIO_COLLECTIONS.assignments,
      existing,
      next,
      ['status', 'updatedAt']
    )) {
      throw new Error(
        'Assignment ' + existing.id +
        ' may change only status while it is being archived.'
      );
    }
  });

  nextState.assignments.forEach(function(next) {
    if (!currentAssignments[next.id] && next.status !== 'Current') {
      throw new Error('New assignments must begin in Current status.');
    }
  });
}

function enforceMakeupTransitions_(currentState, nextState) {
  var nextCredits = recordsById_(nextState.makeupCredits);
  var currentCredits = recordsById_(currentState.makeupCredits);
  var nextLessons = recordsById_(nextState.lessons);
  var currentLessons = recordsById_(currentState.lessons);
  var terminal = {
    Completed: true,
    Waived: true,
    Expired: true
  };
  var allowed = {
    Owed: { Owed: true, Scheduled: true, Waived: true, Expired: true },
    Scheduled: { Scheduled: true, Owed: true, Completed: true },
    Completed: { Completed: true },
    Waived: { Waived: true },
    Expired: { Expired: true }
  };

  currentState.makeupCredits.forEach(function(existing) {
    var next = nextCredits[existing.id];
    if (!next) {
      throw new Error('Makeup credit ' + existing.id + ' is historical and cannot be deleted.');
    }
    ['studentId', 'lessonId', 'createdDate'].forEach(function(field) {
      if (!deepEqual_(existing[field], next[field])) {
        throw new Error('Makeup credit ' + existing.id + ' field "' + field + '" is immutable.');
      }
    });
    if (!allowed[existing.status] || !allowed[existing.status][next.status]) {
      throw new Error(
        'Makeup credit ' + existing.id + ' cannot move from ' +
        existing.status + ' to ' + next.status + '.'
      );
    }
    if (terminal[existing.status]) {
      if (!recordsEqualExceptFields_(
        STUDIO_COLLECTIONS.makeupCredits,
        existing,
        next,
        ['updatedAt']
      )) {
        throw new Error('Used makeup credit ' + existing.id + ' is read-only.');
      }
      return;
    }

    if (existing.status === 'Scheduled' && next.status === 'Owed') {
      var returnedLesson = nextLessons[existing.scheduledLessonId] || null;
      if (!returnedLesson ||
          ['Student Cancelled', 'Teacher Cancelled', 'No Show', 'Rescheduled']
            .indexOf(returnedLesson.status) < 0) {
        throw new Error(
          'A scheduled makeup can return to Owed only when its linked lesson is cancelled or rescheduled.'
        );
      }
    }
    if (existing.status === 'Scheduled' && next.status === 'Scheduled' &&
        existing.scheduledLessonId !== next.scheduledLessonId) {
      var replacedLesson = nextLessons[existing.scheduledLessonId] || null;
      if (!replacedLesson ||
          ['Student Cancelled', 'Teacher Cancelled', 'No Show', 'Rescheduled']
            .indexOf(replacedLesson.status) < 0) {
        throw new Error(
          'A scheduled makeup lesson may be replaced only while preserving the old occurrence as history.'
        );
      }
    }
    if (existing.status === 'Scheduled' && next.status === 'Completed' &&
        existing.scheduledLessonId !== next.scheduledLessonId) {
      throw new Error('A completed makeup credit must redeem its scheduled lesson.');
    }
    if (existing.status === 'Scheduled' && next.status === 'Completed') {
      var redeemedLesson = nextLessons[next.scheduledLessonId] || null;
      if (!next.scheduledLessonId || !redeemedLesson ||
          redeemedLesson.status !== 'Completed' ||
          next.completedDate !== redeemedLesson.date) {
        throw new Error(
          'A completed makeup credit must retain its completed Makeup lesson and matching date.'
        );
      }
    }
  });

  nextState.makeupCredits.forEach(function(next) {
    if (!currentCredits[next.id] && next.status !== 'Owed') {
      throw new Error('New makeup credits must begin in Owed status.');
    }
  });

  var linkedMakeupLessons = newDictionary_();
  nextState.makeupCredits.forEach(function(credit) {
    if (credit.scheduledLessonId) linkedMakeupLessons[credit.scheduledLessonId] = true;
  });
  nextState.lessons.forEach(function(next) {
    var existing = currentLessons[next.id] || null;
    if (next.type === 'Makeup' &&
        (!existing || existing.type !== 'Makeup') &&
        !linkedMakeupLessons[next.id]) {
      throw new Error(
        'A new Makeup lesson must be scheduled through a linked makeup credit.'
      );
    }
  });
}

function enforceInquiryTransitions_(currentState, nextState) {
  var nextInquiries = recordsById_(nextState.inquiries);
  var currentInquiries = recordsById_(currentState.inquiries);
  var currentStudents = recordsById_(currentState.students);
  currentState.inquiries.forEach(function(existing) {
    var next = nextInquiries[existing.id];
    if (existing.status === 'Converted') {
      if (!next) {
        throw new Error('Converted inquiry ' + existing.id + ' cannot be deleted.');
      }
      ['status', 'convertedStudentId', 'trialLessonId'].forEach(function(field) {
        if (!deepEqual_(existing[field], next[field])) {
          throw new Error(
            'Converted inquiry ' + existing.id + ' linkage is immutable.'
          );
        }
      });
      return;
    }
    if (!next || next.status !== 'Converted') return;
    if (!next.convertedStudentId || currentStudents[next.convertedStudentId]) {
      throw new Error(
        'Inquiry ' + existing.id +
        ' must be converted atomically to one newly created student.'
      );
    }
    if (next.trialLessonId !== existing.trialLessonId) {
      throw new Error('Inquiry conversion must retain its existing trialLessonId.');
    }
    if (!recordsEqualExceptFields_(
      STUDIO_COLLECTIONS.inquiries,
      existing,
      next,
      ['status', 'convertedStudentId', 'nextFollowUp', 'updatedAt']
    )) {
      throw new Error(
        'Inquiry ' + existing.id +
        ' contact and history fields cannot be rewritten during conversion.'
      );
    }
  });

  nextState.inquiries.forEach(function(next) {
    if (!currentInquiries[next.id] && next.status === 'Converted') {
      throw new Error(
        'A new inquiry cannot begin as Converted; convert an existing inquiry atomically.'
      );
    }
  });
}

function enforceRepertoireTransitions_(currentState, nextState, options) {
  var nextRepertoire = recordsById_(nextState.repertoire);
  var currentRepertoire = recordsById_(currentState.repertoire);
  currentState.repertoire.forEach(function(existing) {
    var next = nextRepertoire[existing.id];
    if (existing.status === 'Completed') {
      if (!next || !recordsEqualExceptFields_(
        STUDIO_COLLECTIONS.repertoire,
        existing,
        next,
        ['updatedAt']
      )) {
        throw new Error('Completed repertoire ' + existing.id + ' is read-only.');
      }
      return;
    }
    if (next && existing.reactivatedFromId !== next.reactivatedFromId) {
      throw new Error('A repertoire reactivation link is immutable after creation.');
    }
  });

  nextState.repertoire.forEach(function(next) {
    if (currentRepertoire[next.id] || !next.reactivatedFromId) return;
    if (options.allowedReactivationId !== next.id) {
      throw new Error(
        'Reactivated repertoire must be created with reactivateRepertoire(repertoireId).'
      );
    }
  });
}

function assertRecordDeletionAllowed_(state, key, record) {
  if (key === 'repertoire' && record.status === 'Completed') {
    throw new Error('Completed repertoire is read-only and cannot be deleted.');
  }
  if (key === 'recitals' && record.status === 'Completed') {
    throw new Error('Completed recitals are read-only and cannot be deleted.');
  }
  if (key === 'recitalParticipants') {
    var recital = recordsById_(state.recitals)[record.recitalId] || null;
    if (recital && recital.status === 'Completed') {
      throw new Error('Participants in a completed recital cannot be deleted.');
    }
  }
  if (key === 'inquiries' && record.status === 'Converted') {
    throw new Error('Converted inquiries are historical and cannot be deleted.');
  }
}

function enforceImmutableFields_(def, existing, normalized) {
  if (!existing) return;
  if (existing.status === 'Void') {
    if (normalized.status !== 'Void' ||
        normalized.voidedAt !== existing.voidedAt ||
        normalized.voidReason !== existing.voidReason) {
      throw new Error(def.sheetName + ' void records cannot be reopened or rewritten.');
    }
  }
  if (!def.immutableFields || !def.immutableFields.length) return;
  def.immutableFields.forEach(function(key) {
    if (!deepEqual_(existing[key], normalized[key])) {
      throw new Error(
        def.sheetName + ' field "' + key + '" is immutable after creation. ' +
        'Void the record and create a corrected transaction instead.'
      );
    }
  });
}

function enforceBulkHistoryPolicy_(key, existingRecords, nextRecords) {
  var def = STUDIO_COLLECTIONS[key];
  if (def.deletePolicy !== 'never') return;
  var nextById = recordsById_(nextRecords);
  existingRecords.forEach(function(existing) {
    if (!nextById[existing.id]) {
      throw new Error(def.deletionReason || (key + ' history cannot be removed by a bulk save.'));
    }
    if (def.appendOnly && !recordsEqualForSchema_(def, existing, nextById[existing.id])) {
      throw new Error(key + ' record ' + existing.id + ' is append-only and cannot be changed.');
    }
  });
}

function findReferenceBlockers_(state, targetCollection, targetId) {
  var blockers = [];
  STUDIO_COLLECTION_KEYS.forEach(function(key) {
    var def = STUDIO_COLLECTIONS[key];
    state[key].forEach(function(record) {
      def.fields.forEach(function(field) {
        if (field.ref === targetCollection && record[field.key] === targetId) {
          blockers.push({ collection: key, recordId: record.id, field: field.key });
        }
      });
    });
  });
  return blockers;
}


// ===== Serialization ========================================================

function serializeField_(value, field) {
  if (value === undefined || value === null || value === '') return '';
  switch (field.type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return !!value;
    case 'array':
    case 'object': {
      var json = JSON.stringify(value);
      if (json.length > STUDIO_MAX_JSON_LENGTH) {
        throw new Error(field.key + ' JSON is too large to store safely.');
      }
      return serializeSafeString_(json);
    }
    case 'id':
    case 'string':
    case 'date':
    case 'time':
    case 'datetime':
      return serializeSafeString_(String(value));
    default:
      throw new Error('Unsupported serialization type ' + field.type + '.');
  }
}

function deserializeField_(value, field, sheetName, rowNumber) {
  var label = sheetName + ' row ' + rowNumber + ' (' + field.header + ')';
  if (value === '' || value === null || value === undefined) {
    if (field.defaultValue !== undefined) return cloneValue_(field.defaultValue);
    if (field.type === 'boolean') return false;
    if (field.type === 'array') return [];
    if (field.type === 'object') return {};
    if (field.type === 'number') return null;
    return '';
  }
  if (field.type === 'array' || field.type === 'object') {
    var source = stripSafeStringPrefix_(String(value));
    var parsed;
    try {
      parsed = JSON.parse(source);
    } catch (err) {
      throw new Error(label + ' contains invalid JSON.');
    }
    return normalizeFieldValue_(parsed, field, label);
  }
  if (field.type === 'date' && value instanceof Date) {
    return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM-dd');
  }
  if (field.type === 'time' && value instanceof Date) {
    return Utilities.formatDate(value, scriptTimeZone_(), 'HH:mm');
  }
  if (field.type === 'datetime' && value instanceof Date) {
    return value.toISOString();
  }
  return normalizeFieldValue_(stripSafeStringPrefix_(value), field, label);
}

/**
 * Prefixes formula-like text so client data cannot become a spreadsheet
 * formula. The apostrophe is stripped when reading if Sheets returns it.
 */
function serializeSafeString_(value) {
  var text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function stripSafeStringPrefix_(value) {
  if (typeof value !== 'string') return value;
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function serializeSettingValue_(value) {
  assertSafeJson_(value, 'setting value');
  if (value === null) return { type: 'null', value: '' };
  if (Array.isArray(value) || isPlainObject_(value)) {
    var json = JSON.stringify(value);
    if (json.length > STUDIO_MAX_JSON_LENGTH) throw new Error('A setting value is too large.');
    return { type: 'json', value: serializeSafeString_(json) };
  }
  if (typeof value === 'boolean') return { type: 'boolean', value: value };
  if (typeof value === 'number') {
    if (!isFiniteNumber_(value)) throw new Error('Setting numbers must be finite.');
    return { type: 'number', value: value };
  }
  if (typeof value === 'string') return { type: 'string', value: serializeSafeString_(value) };
  throw new Error('Unsupported setting value type.');
}

function deserializeSettingValue_(value, type, rowNumber) {
  var label = 'Settings row ' + rowNumber;
  switch (type) {
    case 'null': return null;
    case 'boolean':
      if (value === true || String(value).toLowerCase() === 'true') return true;
      if (value === false || String(value).toLowerCase() === 'false') return false;
      throw new Error(label + ' contains an invalid boolean.');
    case 'number': {
      var number = Number(value);
      if (!isFiniteNumber_(number)) throw new Error(label + ' contains an invalid number.');
      return number;
    }
    case 'json':
      try {
        var parsed = JSON.parse(stripSafeStringPrefix_(String(value || 'null')));
        assertSafeJson_(parsed, label);
        return parsed;
      } catch (err) {
        throw new Error(label + ' contains invalid JSON.');
      }
    case 'string':
    default:
      return String(stripSafeStringPrefix_(value === null || value === undefined ? '' : value));
  }
}

/**
 * Older Settings tabs may predate the explicit Value Type column. Preserve
 * native Sheet number/boolean cells and JSON arrays/objects instead of
 * silently converting them to strings when that column is added.
 */
function inferSettingType_(value, storedType) {
  var type = String(storedType || '').trim().toLowerCase();
  if (['null', 'boolean', 'number', 'json', 'string'].indexOf(type) >= 0) return type;
  if (type) throw new Error('Settings contains unsupported value type "' + type + '".');
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    var source = stripSafeStringPrefix_(value).trim();
    if (/^(true|false)$/i.test(source)) return 'boolean';
    if (/^[\[{]/.test(source)) {
      try {
        var parsed = JSON.parse(source);
        if (Array.isArray(parsed) || isPlainObject_(parsed)) return 'json';
      } catch (err) {
        // Preserve malformed legacy text as text; explicit JSON rows still fail loudly.
      }
    }
  }
  return 'string';
}


// ===== Settings helpers =====================================================

function normalizeSettings_(settings) {
  assertPlainObject_(settings, 'settings');
  var merged = deepMergeObjects_(cloneJson_(DEFAULT_STUDIO_SETTINGS), settings);
  assertSafeJson_(merged, 'settings');
  validateStudioSettings_(merged);
  flattenSettings_(merged); // Also validates every path and leaf type.
  return merged;
}

function validateStudioSettings_(settings) {
  [
    'studioName',
    'ownerName',
    'email',
    'phone',
    'address',
    'currency',
    'timezone',
    'cancellationPolicy'
  ].forEach(function(key) {
    if (typeof settings[key] !== 'string') {
      throw new Error('settings.' + key + ' must be text.');
    }
  });
  if (settings.email) validateEmail_(settings.email, 'settings.email');
  if (!/^[A-Z]{3}$/.test(settings.currency)) {
    throw new Error('settings.currency must be a three-letter uppercase currency code.');
  }
  if (!settings.timezone || settings.timezone.length > 200) {
    throw new Error('settings.timezone must be a valid non-empty timezone name.');
  }
  if (!isFiniteNumber_(settings.targetWeeklySlots) ||
      Math.floor(settings.targetWeeklySlots) !== settings.targetWeeklySlots ||
      settings.targetWeeklySlots < 0 || settings.targetWeeklySlots > 200) {
    throw new Error('settings.targetWeeklySlots must be a whole number from 0 to 200.');
  }
  if (!isFiniteNumber_(settings.defaultTuition) || settings.defaultTuition < 0) {
    throw new Error('settings.defaultTuition must be a non-negative number.');
  }
  validateTime_(settings.openTime, 'settings.openTime');
  validateTime_(settings.closeTime, 'settings.closeTime');
  if (!Array.isArray(settings.defaultLessonLengths) || !settings.defaultLessonLengths.length) {
    throw new Error('settings.defaultLessonLengths must be a non-empty array.');
  }
  settings.defaultLessonLengths.forEach(function(minutes, index) {
    if (!isFiniteNumber_(minutes) || Math.floor(minutes) !== minutes || minutes < 1 || minutes > 240) {
      throw new Error('settings.defaultLessonLengths[' + index + '] must be 1-240 whole minutes.');
    }
  });
  var validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (!Array.isArray(settings.teachingDays)) {
    throw new Error('settings.teachingDays must be an array.');
  }
  settings.teachingDays.forEach(function(day) {
    if (validDays.indexOf(day) < 0) {
      throw new Error('settings.teachingDays contains unsupported day "' + day + '".');
    }
  });
  if (!Array.isArray(settings.studioClosures)) {
    throw new Error('settings.studioClosures must be an array.');
  }
  settings.studioClosures.forEach(function(closure, index) {
    assertPlainObject_(closure, 'settings.studioClosures[' + index + ']');
    if (closure.id) validateId_(closure.id, 'settings.studioClosures[' + index + '].id');
    validateDate_(closure.date, 'settings.studioClosures[' + index + '].date');
    if (typeof closure.name !== 'string' || !closure.name.trim()) {
      throw new Error('settings.studioClosures[' + index + '].name is required.');
    }
  });
  if (!isPlainObject_(settings.appearance) ||
      ['light', 'dark', 'system'].indexOf(settings.appearance.theme) < 0) {
    throw new Error('settings.appearance.theme must be light, dark, or system.');
  }
}

function flattenSettings_(settings) {
  var entries = [];
  function visit(value, path) {
    if (isPlainObject_(value) && Object.keys(value).length > 0) {
      Object.keys(value).sort().forEach(function(key) {
        validateSettingSegment_(key);
        visit(value[key], path ? path + '.' + key : key);
      });
      return;
    }
    if (!path) throw new Error('Settings must contain named values.');
    validateSettingPath_(path);
    entries.push({ path: path, value: cloneValue_(value) });
  }
  visit(settings, '');
  return entries;
}

function setNestedPath_(root, path, value) {
  var parts = path.split('.');
  var cursor = root;
  for (var i = 0; i < parts.length - 1; i += 1) {
    validateSettingSegment_(parts[i]);
    if (!isPlainObject_(cursor[parts[i]])) cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  validateSettingSegment_(parts[parts.length - 1]);
  cursor[parts[parts.length - 1]] = value;
}

function validateSettingPath_(path) {
  if (typeof path !== 'string' || !path || path.length > 500) {
    throw new Error('Setting paths must be non-empty text no longer than 500 characters.');
  }
  path.split('.').forEach(validateSettingSegment_);
  return path;
}

function validateSettingSegment_(segment) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(segment)) {
    throw new Error('Invalid setting path segment "' + segment + '".');
  }
  if (segment === '__proto__' || segment === 'prototype' || segment === 'constructor') {
    throw new Error('Reserved setting path segment "' + segment + '" is not allowed.');
  }
}


// ===== Metadata =============================================================

function getMetaValue_(key) {
  var sheet = getSpreadsheet_().getSheetByName(STUDIO_META_SHEET.sheetName);
  if (!sheet || sheet.getLastRow() < 2) return '';
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(value) { return String(value || '').trim(); });
  var map = headerIndexMap_(headers);
  for (var row = 1; row < values.length; row += 1) {
    if (String(values[row][map['Metadata Key']]) === String(key)) {
      return values[row][map['Metadata Value']];
    }
  }
  return '';
}

function setMetaValue_(key, value) {
  var sheet = getSpreadsheet_().getSheetByName(STUDIO_META_SHEET.sheetName);
  var width = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function(header) { return String(header || '').trim(); });
  var map = headerIndexMap_(headers);
  var values = sheet.getDataRange().getValues();
  var rowNumber = -1;
  for (var row = 1; row < values.length; row += 1) {
    if (String(values[row][map['Metadata Key']]) === String(key)) {
      rowNumber = row + 1;
      break;
    }
  }
  if (rowNumber < 2) {
    rowNumber = sheet.getLastRow() + 1;
    ensureGridSize_(sheet, rowNumber, width);
  }
  var output = rowNumber <= sheet.getLastRow()
    ? formulaAwareMatrix_(sheet.getRange(rowNumber, 1, 1, width))[0]
    : blankRow_(width);
  output[map['Metadata Key']] = serializeSafeString_(key);
  output[map['Metadata Value']] = typeof value === 'number' ? value : serializeSafeString_(String(value));
  output[map['Updated At']] = nowIso_();
  sheet.getRange(rowNumber, 1, 1, width).setValues([output]);
}


// ===== Sheet utilities and rollback ========================================

function getSpreadsheet_() {
  if (STUDIO_SPREADSHEET_CACHE) return STUDIO_SPREADSHEET_CACHE;

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    rememberSpreadsheetId_(active.getId());
    STUDIO_SPREADSHEET_CACHE = active;
    return STUDIO_SPREADSHEET_CACHE;
  }

  var storedId = PropertiesService.getScriptProperties()
    .getProperty(STUDIO_SPREADSHEET_PROPERTY);
  if (!storedId) {
    throw new Error(
      'This web app is not connected to its spreadsheet yet. Open the bound spreadsheet and run setupStudio once.'
    );
  }
  STUDIO_SPREADSHEET_CACHE = SpreadsheetApp.openById(storedId);
  return STUDIO_SPREADSHEET_CACHE;
}

/**
 * Captures the container-bound spreadsheet during an editor/menu execution.
 * Deployed web-app executions do not receive an active spreadsheet, so they
 * reopen this setup-time ID. The ID is never hardcoded or sent to the browser.
 */
function bindActiveSpreadsheet_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'Open the container-bound spreadsheet and run setupStudio from its Apps Script editor or Piano Studio menu.'
    );
  }
  rememberSpreadsheetId_(active.getId());
  STUDIO_SPREADSHEET_CACHE = active;
  return active;
}

function rememberSpreadsheetId_(spreadsheetId) {
  var safeId = String(spreadsheetId || '').trim();
  if (!safeId) throw new Error('The bound spreadsheet does not have a usable ID.');
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(STUDIO_SPREADSHEET_PROPERTY) !== safeId) {
    properties.setProperty(STUDIO_SPREADSHEET_PROPERTY, safeId);
  }
}

function withWriteLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(STUDIO_LOCK_TIMEOUT_MS)) {
    throw new Error('The studio is busy saving another change. Please try again.');
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function findRowById_(sheet, def, id) {
  if (sheet.getLastRow() < 2) return -1;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  var map = headerIndexMap_(headers);
  var idColumn = map[def.idField.header] + 1;
  var values = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues();
  for (var row = 0; row < values.length; row += 1) {
    if (String(values[row][0]) === String(id)) return row + 2;
  }
  return -1;
}

function existingFormulaAwareRowsById_(sheet, def, headerMap) {
  var out = newDictionary_();
  if (sheet.getLastRow() < 2) return out;
  var width = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, width);
  var values = range.getValues();
  var rows = formulaAwareMatrix_(range);
  var idColumn = headerMap[def.idField.header];
  for (var i = 0; i < values.length; i += 1) {
    var id = values[i][idColumn];
    if (id !== '' && id !== null && id !== undefined) out[String(id)] = rows[i];
  }
  return out;
}

function existingRowsByKey_(sheet, keyColumn) {
  var out = newDictionary_();
  if (sheet.getLastRow() < 2) return out;
  var width = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, width);
  var values = range.getValues();
  var rows = formulaAwareMatrix_(range);
  for (var i = 0; i < values.length; i += 1) {
    var key = values[i][keyColumn];
    if (key !== '' && key !== null && key !== undefined) out[String(key)] = rows[i];
  }
  return out;
}

function formulaAwareMatrix_(range) {
  var values = range.getValues();
  var formulas = range.getFormulas();
  return values.map(function(row, rowIndex) {
    return row.map(function(value, columnIndex) {
      return formulas[rowIndex][columnIndex] || value;
    });
  });
}

function snapshotSheet_(sheet) {
  var rows = Math.max(1, sheet.getLastRow());
  var columns = Math.max(1, sheet.getLastColumn());
  return {
    rows: rows,
    columns: columns,
    values: formulaAwareMatrix_(sheet.getRange(1, 1, rows, columns))
  };
}

function restoreSheetSnapshot_(sheet, snapshot) {
  var rowsToClear = Math.max(sheet.getLastRow(), snapshot.rows, 1);
  var columnsToClear = Math.max(sheet.getLastColumn(), snapshot.columns, 1);
  ensureGridSize_(sheet, rowsToClear, columnsToClear);
  sheet.getRange(1, 1, rowsToClear, columnsToClear).clearContent();
  sheet.getRange(1, 1, snapshot.rows, snapshot.columns).setValues(snapshot.values);
  sheet.setFrozenRows(1);
}

function ensureGridSize_(sheet, requiredRows, requiredColumns) {
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
  }
}

function headerIndexMap_(headers) {
  var map = newDictionary_();
  headers.forEach(function(header, index) {
    if (header) map[header] = index;
  });
  return map;
}

function blankRow_(width) {
  var row = [];
  for (var i = 0; i < width; i += 1) row.push('');
  return row;
}

function rowEveryBlank_(row) {
  return row.every(function(value) {
    return value === '' || value === null || value === undefined;
  });
}


// ===== General helpers ======================================================

function field_(key, header, type, options) {
  var opts = options || {};
  return {
    key: key,
    header: header,
    type: type,
    required: !!opts.required,
    defaultValue: opts.defaultValue,
    enum: opts.enum || null,
    min: opts.min,
    max: opts.max,
    integer: !!opts.integer,
    maxLength: opts.maxLength,
    ref: opts.ref || null,
    aliases: [key].concat(opts.aliases || [])
  };
}

function withTimestamps_(fields) {
  return fields.concat([
    field_('createdAt', 'Created At', 'datetime', { required: true }),
    field_('updatedAt', 'Updated At', 'datetime', { required: true })
  ]);
}

function collection_(sheetName, idPrefix, fields, options) {
  var opts = options || {};
  var fieldByKey = {};
  fields.forEach(function(field) { fieldByKey[field.key] = field; });
  return {
    sheetName: sheetName,
    idPrefix: idPrefix,
    fields: fields,
    fieldByKey: fieldByKey,
    idField: fieldByKey.id,
    deletePolicy: opts.deletePolicy || 'allowed',
    deletionReason: opts.deletionReason || '',
    appendOnly: !!opts.appendOnly,
    immutableFields: opts.immutableFields || []
  };
}

function validateCollectionKey_(collection, allowSettings) {
  if (typeof collection !== 'string' || !collection) {
    throw new Error('collection must be a non-empty string.');
  }
  if (allowSettings && collection === 'settings') return collection;
  if (!Object.prototype.hasOwnProperty.call(STUDIO_COLLECTIONS, collection)) {
    throw new Error('Unsupported collection "' + collection + '".');
  }
  return collection;
}

function validateCollectionList_(collections) {
  if (!Array.isArray(collections) || collections.length === 0) {
    throw new Error('collections must be a non-empty array.');
  }
  if (collections.length > STUDIO_COLLECTION_KEYS.length + 1) {
    throw new Error('Too many collections were requested.');
  }
  var seen = {};
  return collections.map(function(collection) {
    var key = validateCollectionKey_(collection, true);
    if (seen[key]) throw new Error('Collection "' + key + '" was selected more than once.');
    seen[key] = true;
    return key;
  });
}

function validateId_(id, label) {
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error(label + ' must be text.');
  }
  var normalized = String(id).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized)) {
    throw new Error(
      label + ' must be 1-128 characters using letters, numbers, period, underscore, colon, or hyphen.'
    );
  }
  return normalized;
}

function validateEmail_(email, label) {
  if (typeof email !== 'string' ||
      email.length > 500 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(label + ' must be a valid email address.');
  }
  return email;
}

function newRecordId_(prefix) {
  var datePart = Utilities.formatDate(new Date(), scriptTimeZone_(), 'yyyyMMdd-HHmmss');
  var randomPart = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  return prefix + '-' + datePart + '-' + randomPart;
}

function validateDate_(value, label) {
  if (value instanceof Date) return Utilities.formatDate(value, scriptTimeZone_(), 'yyyy-MM-dd');
  var text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(label + ' must use YYYY-MM-DD.');
  var parts = text.split('-').map(Number);
  var test = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (test.getUTCFullYear() !== parts[0] || test.getUTCMonth() !== parts[1] - 1 ||
      test.getUTCDate() !== parts[2]) {
    throw new Error(label + ' is not a valid calendar date.');
  }
  return text;
}

function validateTime_(value, label) {
  var text = String(value);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new Error(label + ' must use 24-hour HH:MM.');
  }
  return text;
}

function validateDateTime_(value, label) {
  if (value instanceof Date) return value.toISOString();
  var text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || isNaN(new Date(text).getTime())) {
    throw new Error(label + ' must be a valid ISO date-time.');
  }
  return new Date(text).toISOString();
}

function nowIso_() {
  return new Date().toISOString();
}

function scriptTimeZone_() {
  return Session.getScriptTimeZone() || 'Etc/UTC';
}

function validateTemplateFilename_(filename) {
  if (typeof filename !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(filename)) {
    throw new Error('Invalid template filename.');
  }
}

function recordsById_(records) {
  var out = newDictionary_();
  (records || []).forEach(function(record) {
    out[record.id] = record;
  });
  return out;
}

function recordsEqualForSchema_(def, left, right) {
  return recordsEqualExceptFields_(def, left, right, []);
}

function recordsEqualExceptFields_(def, left, right, ignoredFields) {
  var ignored = newDictionary_();
  (ignoredFields || []).forEach(function(field) {
    ignored[field] = true;
  });
  return def.fields.every(function(field) {
    if (ignored[field.key]) return true;
    return deepEqual_(left[field.key], right[field.key]);
  });
}

function canonicalStateEnvelope_(state) {
  var canonical = cloneJson_(state);
  canonical.schemaVersion = STUDIO_SCHEMA_VERSION;
  canonical.loadedAt = nowIso_();
  return canonical;
}

function deepEqual_(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedLookupText_(value) {
  return String(value || '').trim().toLowerCase();
}

function shallowMerge_(base, patch) {
  var out = newDictionary_();
  Object.keys(base || {}).forEach(function(key) { out[key] = base[key]; });
  Object.keys(patch || {}).forEach(function(key) { out[key] = patch[key]; });
  return out;
}

function newDictionary_() {
  return Object.create(null);
}

function deepMergeObjects_(base, patch) {
  assertPlainObject_(base, 'base settings');
  assertPlainObject_(patch, 'settings patch');
  var out = cloneJson_(base);
  Object.keys(patch).forEach(function(key) {
    validateSettingSegment_(key);
    if (isPlainObject_(patch[key]) && isPlainObject_(out[key])) {
      out[key] = deepMergeObjects_(out[key], patch[key]);
    } else {
      out[key] = cloneValue_(patch[key]);
    }
  });
  return out;
}

function cloneValue_(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  return cloneJson_(value);
}

function cloneJson_(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertPlainObject_(value, label) {
  if (!isPlainObject_(value)) throw new Error(label + ' must be a plain object.');
}

function isPlainObject_(value) {
  return value !== null && typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]';
}

function assertSafeJson_(value, label) {
  var count = 0;
  function visit(node, depth) {
    count += 1;
    if (count > 10000) throw new Error(label + ' is too complex.');
    if (depth > 12) throw new Error(label + ' is nested too deeply.');
    if (node === null) return;
    var type = typeof node;
    if (type === 'string') {
      if (node.length > STUDIO_MAX_TEXT_LENGTH) throw new Error(label + ' contains text that is too long.');
      return;
    }
    if (type === 'number') {
      if (!isFiniteNumber_(node)) throw new Error(label + ' contains a non-finite number.');
      return;
    }
    if (type === 'boolean') return;
    if (type === 'undefined' || type === 'function' || type === 'symbol') {
      throw new Error(label + ' contains an unsupported value.');
    }
    if (Array.isArray(node)) {
      node.forEach(function(item) { visit(item, depth + 1); });
      return;
    }
    if (!isPlainObject_(node)) throw new Error(label + ' contains an unsupported object.');
    Object.keys(node).forEach(function(key) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new Error(label + ' contains a reserved object key.');
      }
      visit(node[key], depth + 1);
    });
  }
  visit(value, 0);
  var serialized = JSON.stringify(value);
  if (serialized && serialized.length > STUDIO_MAX_JSON_LENGTH) {
    throw new Error(label + ' is too large to store safely.');
  }
}

function isFiniteNumber_(value) {
  return typeof value === 'number' && isFinite(value);
}
