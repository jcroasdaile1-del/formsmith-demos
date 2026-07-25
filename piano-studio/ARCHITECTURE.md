# Harmony House architecture

Harmony House is one responsive, self-contained Formsmith application with two persistence modes:

- `index.html` is the GitHub Pages portfolio demo and saves one namespaced JSON document in browser storage. If browser storage is unavailable, it switches to an honest tab-only memory mode instead of discarding edits.
- `google-apps-script/Index.html` is generated from the same source and automatically uses `google.script.run`.
- `google-apps-script/Code.gs` persists normalized collections in human-readable Google Sheets tabs.

Run `node piano-studio/build-appscript-version.mjs` after changing the canonical UI.

## Data boundary

The frontend calls one `Repository` adapter:

```text
load()
save(state, changedCollections)
reset(seedState)
reactivateRepertoire(repertoireId)
```

In Sheets mode, `loadStudio()` batches the complete bootstrap read and
`saveStudioCollections()` transactionally validates and writes only the named
collections. Successful server responses include a hydrated state so the browser
receives server timestamps and migrations. The UI retains a committed snapshot and
rolls back optimistic changes if persistence fails. Repertoire reactivation uses a
dedicated server action because it creates a new linked study record while keeping
the completed source immutable.

## Normalized collections

The same state shape is used in both modes:

```text
settings
students
guardians
studentGuardians
recurringSchedules
lessons
repertoire
assignments
tuitionCharges
payments
makeupCredits
inquiries
recitals
recitalParticipants
expenses
activity
```

Important relationships:

- A student may link to one or more guardians through `studentGuardians`; one link
  is primary and one is the billing contact. Guardian contacts can be shared across
  siblings while relationship and responsibility flags stay student-specific.
- `recurringSchedules` describe permanent weekly slots.
- `lessons` are dated occurrences. A one-time reschedule preserves the original
  occurrence and creates a linked replacement.
- Lesson completion updates repertoire progress and can create one or more current
  assignments while retaining earlier assignments as permanent snapshots.
- Charges and payments are separate transaction records. Balances are derived;
  void records are retained and excluded from totals.
- Makeup credits link an eligible cancelled lesson to a later makeup occurrence.
- Inquiry conversion creates and links the student, guardian, recurring schedule,
  first tuition charge, and future lesson occurrences without deleting the lead.
  Its Trial occurrence atomically migrates from inquiry ownership to student
  ownership while the inquiry retains the stable trial ID.
- Reactivating completed repertoire creates a new current successor linked through
  `reactivatedFromId`; the completed source and every reference to it stay intact.
- Recital participants join an event, student, and existing repertoire item, with
  saved readiness and program order. Completing a recital freezes participant,
  piece, and composer labels for the historical program.

All records use opaque stable IDs. Calendar dates are `YYYY-MM-DD`, times are
`HH:mm`, and record timestamps are ISO-8601 strings. Browser mode creates timestamps
locally; Sheets mode normalizes them on the server.

## History and destructive actions

- Completed lessons and recitals, completed repertoire, terminal makeup credits,
  archived assignments, payments, charges, and activity rows are protected as
  history by the backend.
- The server validates final-state relationships and lifecycle transitions under
  the write lock, including exclusive lesson ownership, guardian requirements,
  schedule collisions, occurrence uniqueness, inquiry conversion, and makeup
  redemption.
- Future occurrences are cancelled or rescheduled rather than silently removed when
  enrollment or a recurring slot changes.
- Expense deletion is explicit and confirmed.
- Full reset requires the exact phrase `RESET HARMONY HOUSE` and affects only
  app-owned browser data or spreadsheet tabs.

## Google Sheets runtime

The Apps Script project is container-bound. `setupStudio()` must run once from the
bound spreadsheet; it stores that spreadsheet ID in private Script Properties.
Web-app RPC executions reopen that exact file with `openById` because active-file
methods are unavailable in a web-app request.

The deployment is intended to execute as the owner and remain accessible only to
the owner. The backend uses `LockService`, validates cross-record references and
types, applies additive migrations, escapes formula-like user strings, and restores
sheet snapshots if a multi-collection write fails.

## Testing

`npm run test:piano` starts a local server and exercises the app in Chromium. It
checks every major route, realistic mutation workflows, derived balances, family
relationships, immutable history, focus and theme behavior, console errors, and
page overflow at desktop, tablet, and phone widths. A separate executable contract
harness evaluates `Code.gs` with a mocked Apps Script/Spreadsheet runtime and
exercises real backend save, validation, transaction, and lifecycle paths.
