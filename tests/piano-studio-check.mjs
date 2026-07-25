import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const appPath = "/piano-studio/index.html";
const appFile = path.join(root, "piano-studio", "index.html");
const storageKey = "harmony_house_studio_v1";
const themeKey = "harmony_house_theme";
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

const views = [
  ["dashboard", null, ".dashboard-grid"],
  ["schedule", "Schedule", '[aria-label="Schedule controls"]'],
  ["students", "Students", ".student-cards"],
  ["lessons", "Lessons", ".agenda-days"],
  ["repertoire", "Repertoire", ".table-wrap"],
  ["billing", "Billing", '[data-action="billing-tab"]'],
  ["inquiries", "Inquiries", ".pipeline"],
  ["recitals", "Recitals", ".recital-layout"],
  ["expenses", "Expenses", ".table-wrap"],
  ["reports", "Reports", ".chart-card"],
  ["settings", "Settings", '[data-action="settings-section"]']
];

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!requestPath || requestPath.endsWith("/")) requestPath += "index.html";

    const candidate = path.resolve(root, requestPath);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes.get(path.extname(candidate).toLowerCase()) || "application/octet-stream"
    });
    fs.createReadStream(candidate).pipe(response);
  });
}

function assertInlineScriptSyntax() {
  const html = fs.readFileSync(appFile, "utf8");
  assert.match(html, /^<!doctype html>/i, "piano studio should remain a complete HTML document");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(scripts.length >= 2, "piano studio should include its theme prepaint and application scripts");
  scripts.forEach((source, index) => {
    assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} should parse`);
  });
}

function isoDaysFromNow(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function watchRuntime(page, origin) {
  const issues = [];
  page.on("console", (message) => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => issues.push(`page error: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (!request.url().startsWith(origin) || request.url().endsWith("/favicon.ico")) return;
    const errorText = request.failure()?.errorText || "unknown";
    if (errorText !== "net::ERR_ABORTED") issues.push(`request failed: ${request.url()} (${errorText})`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && !response.url().endsWith("/favicon.ico") && response.status() >= 400) {
      issues.push(`response ${response.status()}: ${response.url()}`);
    }
  });
  return issues;
}

async function waitForApp(page) {
  await page.waitForFunction(
    () => Boolean(window.HarmonyHouse?.getState && document.querySelector("#pageHost .page-head")),
    { timeout: 10000 }
  );
}

async function waitForSaved(page) {
  await page.waitForFunction(
    () => document.querySelector("#saveState")?.textContent.trim() === "Saved",
    { timeout: 5000 }
  );
}

async function readState(page) {
  return page.evaluate(() => window.HarmonyHouse.getState());
}

async function resetDemo(page, appUrl) {
  await page.goto(`${appUrl}?prepare=${Date.now()}#dashboard`, { waitUntil: "load", timeout: 15000 });
  await waitForApp(page);
  await page.evaluate(({ dataKey, appearanceKey }) => {
    localStorage.removeItem(dataKey);
    localStorage.removeItem(appearanceKey);
  }, { dataKey: storageKey, appearanceKey: themeKey });
  const response = await page.goto(`${appUrl}?seed=${Date.now()}#dashboard`, { waitUntil: "load", timeout: 15000 });
  assert.equal(response?.status(), 200, "piano studio should return HTTP 200");
  await waitForApp(page);
  await waitForSaved(page);
}

async function navigate(page, view, expectedHeading = null, selector = null) {
  await page.evaluate((nextView) => window.HarmonyHouse.navigate(nextView), view);
  await page.waitForFunction(
    (nextView, heading, requiredSelector) => {
      const routeReady = location.hash === `#${nextView}`;
      const title = document.querySelector("#pageHost h1")?.textContent.trim() || "";
      const headingReady = heading ? title === heading : /^Good (morning|afternoon|evening),/.test(title);
      return routeReady && headingReady && (!requiredSelector || Boolean(document.querySelector(requiredSelector)));
    },
    { timeout: 5000 },
    view,
    expectedHeading,
    selector
  );
}

async function setValue(page, selector, value) {
  await page.$eval(selector, (element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function setChecked(page, selector, checked) {
  await page.$eval(selector, (element, nextChecked) => {
    element.checked = Boolean(nextChecked);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
}

async function clickByData(page, action, id = null, extra = {}) {
  await page.evaluate(({ nextAction, nextId, attributes }) => {
    const elements = [...document.querySelectorAll(`[data-action="${CSS.escape(nextAction)}"]`)];
    const target = elements.find((element) => {
      if (nextId !== null && element.dataset.id !== nextId) return false;
      return Object.entries(attributes).every(([key, value]) => element.dataset[key] === String(value));
    });
    if (!target) throw new Error(`Could not find action ${nextAction}${nextId ? ` for ${nextId}` : ""}`);
    target.click();
  }, { nextAction: action, nextId: id, attributes: extra });
}

async function submitModal(page, formId) {
  await page.$eval(`#modalRoot button[type="submit"][form="${formId}"]`, (button) => button.click());
}

async function testSeedData(page, appUrl, runtimeIssues) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await resetDemo(page, appUrl);

  const state = await readState(page);
  const activeStudents = state.students.filter((student) => student.status === "Active");
  assert.equal(state.students.length, 27, "seed should include 27 students");
  assert.equal(activeStudents.length, 24, "seed should include 24 active students");
  assert.equal(state.guardians.length, 19, "seed should include the 19 normalized guardian records");
  assert.equal(state.recurringSchedules.filter((schedule) => schedule.active !== false).length, 24, "each active student should have one recurring slot");
  assert.equal(state.repertoire.length, 75, "seed should include current and historical repertoire");
  assert.equal(state.tuitionCharges.length, 150, "seed should include active tuition plus retained inactive-student history");
  assert.equal(state.payments.length, 147, "seed should include paid, partial, unpaid, and inactive-student payment history");
  assert.equal(state.inquiries.length, 7, "seed should include all inquiry stages");
  assert.equal(state.recitals.length, 2, "seed should include a current and completed recital");
  assert.equal(state.recitalParticipants.length, 21, "seed should include current and historical recital programs");
  assert.equal(state.expenses.length, 18, "seed should include six months of studio expenses");
  assert.equal(state.makeupCredits.length, 5, "seed should include the makeup-credit lifecycle");
  assert.ok(state.lessons.length >= 374, "seed should include active and inactive lesson history plus generated future occurrences");
  assert.ok(state.lessons.some((lesson) => lesson.type === "Trial"), "seed should include trial lessons");
  assert.ok(state.lessons.some((lesson) => lesson.type === "Makeup"), "seed should include a scheduled makeup lesson");
  assert.equal(state.students.every((student) => student.billingModel === "Monthly tuition"), true, "every normalized student should use the implemented monthly tuition model");
  const noncompleted = state.lessons.filter((lesson) => ["Student Cancelled", "Teacher Cancelled", "No Show", "Rescheduled"].includes(lesson.status));
  noncompleted.forEach((lesson) => {
    assert.equal(lesson.completedAt || "", "", `${lesson.id} should not retain a completion timestamp`);
    assert.equal(lesson.summary || "", "", `${lesson.id} should not retain a completed summary`);
    assert.deepEqual(lesson.technique || [], [], `${lesson.id} should not retain completed technique work`);
    assert.equal(state.assignments.some((assignment) => assignment.lessonId === lesson.id), false, `${lesson.id} should not own a practice assignment`);
  });
  const completedMakeupCredit = state.makeupCredits.find((credit) => credit.status === "Completed");
  const completedMakeupLesson = state.lessons.find((lesson) => lesson.id === completedMakeupCredit?.scheduledLessonId);
  assert.ok(completedMakeupCredit?.scheduledLessonId, "completed makeup history should retain its lesson link");
  assert.equal(completedMakeupLesson?.type, "Makeup", "completed makeup credit should link to a makeup lesson");
  assert.equal(completedMakeupLesson?.status, "Completed", "completed makeup credit should link to a completed lesson");
  assert.equal(completedMakeupCredit.completedDate, completedMakeupLesson?.date, "completed makeup date should match the linked occurrence");
  state.students.filter((student) => student.status === "Inactive").forEach((student) => {
    assert.ok(state.lessons.some((lesson) => lesson.studentId === student.id), `${student.id} should retain lesson history`);
    assert.ok(state.repertoire.some((piece) => piece.studentId === student.id && piece.status === "Completed"), `${student.id} should retain repertoire history`);
    assert.ok(state.tuitionCharges.some((charge) => charge.studentId === student.id), `${student.id} should retain charge history`);
    assert.ok(state.payments.some((payment) => payment.studentId === student.id), `${student.id} should retain payment history`);
  });
  assert.equal(
    await page.evaluate((key) => Boolean(localStorage.getItem(key)), storageKey),
    true,
    "normalized seed should persist under the app-specific storage key"
  );
  assert.deepEqual(runtimeIssues, [], `seed boot emitted runtime errors:\n${runtimeIssues.join("\n")}`);
}

async function testCompletedHistoryIsReadOnly(page) {
  let state = await readState(page);
  const completedLesson = state.assignments
    .map((assignment) => state.lessons.find((lesson) => lesson.id === assignment.lessonId))
    .find((lesson) => lesson?.status === "Completed");
  assert.ok(completedLesson, "seed should include a completed lesson with an assignment");
  const lessonBefore = structuredClone(completedLesson);
  const assignmentBefore = structuredClone(state.assignments.find((assignment) => assignment.lessonId === completedLesson.id));

  await navigate(page, "lessons", "Lessons", ".agenda-days");
  await setValue(page, "#lessonRangeFilter", "All");
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`[data-action="open-lesson"][data-id="${CSS.escape(id)}"]`)),
    { timeout: 5000 },
    completedLesson.id
  );
  await clickByData(page, "open-lesson", completedLesson.id);
  await page.waitForSelector("#modalRoot.open");
  assert.match(await page.$eval("#modalTitle", (element) => element.textContent), /Completed lesson/, "completed lesson should open as a historical review");
  assert.equal(await page.$("#lessonWorkspaceForm"), null, "completed lesson review should not expose the editable workspace");
  assert.equal(await page.$('[data-action="edit-lesson"]'), null, "completed lesson review should not expose schedule editing");
  assert.match(await page.$eval("#modalRoot .form-alert", (element) => element.textContent), /read-only/i, "completed lesson should explain its immutable status");
  await clickByData(page, "close-modal");

  state = await readState(page);
  assert.deepEqual(state.lessons.find((lesson) => lesson.id === completedLesson.id), lessonBefore, "reviewing a completed lesson must not mutate its history");
  assert.deepEqual(state.assignments.find((assignment) => assignment.lessonId === completedLesson.id), assignmentBefore, "reviewing a completed lesson must not replace its assignment");

  const completedPiece = state.repertoire.find((piece) => piece.status === "Completed" && piece.dateCompleted);
  assert.ok(completedPiece, "seed should include completed repertoire with a completion date");
  const pieceBefore = structuredClone(completedPiece);
  await navigate(page, "repertoire", "Repertoire", ".table-wrap");
  await clickByData(page, "repertoire-status", null, { status: "Completed" });
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`[data-action="edit-repertoire"][data-id="${CSS.escape(id)}"]`)),
    { timeout: 5000 },
    completedPiece.id
  );
  await clickByData(page, "edit-repertoire", completedPiece.id);
  await page.waitForSelector("#modalRoot.open");
  assert.equal(await page.$eval("#modalTitle", (element) => element.textContent.trim()), "Completed repertoire record", "completed repertoire should open as a historical record");
  assert.equal(await page.$("#repertoireForm"), null, "completed repertoire should not expose editable status or dates");
  assert.match(await page.$eval("#modalRoot .form-alert", (element) => element.textContent), /read-only/i, "completed repertoire should explain its immutable status");
  await clickByData(page, "close-modal");
  assert.deepEqual((await readState(page)).repertoire.find((piece) => piece.id === completedPiece.id), pieceBefore, "reviewing completed repertoire must preserve its completion record");

  state = await readState(page);
  const completedRecital = state.recitals.find((recital) => recital.status === "Completed");
  const participantsBefore = state.recitalParticipants
    .filter((participant) => participant.recitalId === completedRecital.id)
    .sort((a, b) => a.order - b.order)
    .map((participant) => structuredClone(participant));
  assert.ok(completedRecital && participantsBefore.length, "seed should include a completed recital program");
  await navigate(page, "recitals", "Recitals", ".recital-layout");
  await clickByData(page, "select-recital", completedRecital.id);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-action="select-recital"][data-id="${CSS.escape(id)}"]`)?.classList.contains("active"),
    { timeout: 5000 },
    completedRecital.id
  );
  assert.equal(await page.$(`[data-action="edit-recital"][data-id="${completedRecital.id}"]`), null, "completed recital should not expose event editing");
  assert.equal(await page.$('[data-action="add-participant"]'), null, "completed recital should not allow performers to be added");
  assert.equal(await page.$$eval('[data-action="move-participant"]', (elements) => elements.length), 0, "completed recital should not expose reorder controls");
  assert.equal(
    await page.$$eval("[data-recital-readiness]", (elements) => elements.length > 0 && elements.every((element) => element.disabled)),
    true,
    "completed recital readiness should be disabled"
  );
  assert.match(await page.$eval(".recital-layout", (element) => element.textContent), /read-only/i, "completed recital should be visibly labeled read-only");

  const firstReadiness = participantsBefore[0];
  const alternateReadiness = firstReadiness.readiness === "Performance Ready" ? "Polishing" : "Performance Ready";
  await setValue(page, `[data-recital-readiness="${firstReadiness.id}"]`, alternateReadiness);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const participantsAfter = (await readState(page)).recitalParticipants
    .filter((participant) => participant.recitalId === completedRecital.id)
    .sort((a, b) => a.order - b.order);
  assert.deepEqual(participantsAfter, participantsBefore, "even a synthetic readiness change must not alter completed recital history");
}

async function testLessonDraftAndFutureGuards(page) {
  let state = await readState(page);
  const today = isoDaysFromNow(0);
  const currentPiecesFor = (studentId) => state.repertoire.filter((piece) => piece.studentId === studentId && piece.status !== "Completed");
  const cancellationLesson = state.lessons
    .filter((lesson) => lesson.type === "Regular" && lesson.status === "Scheduled" && lesson.date >= today && currentPiecesFor(lesson.studentId).length)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  assert.ok(cancellationLesson, "seed should include a scheduled lesson with current repertoire");
  const cancellationPiecesBefore = currentPiecesFor(cancellationLesson.studentId).map((piece) => structuredClone(piece));
  const changedPiece = cancellationPiecesBefore[0];
  const alternateStage = changedPiece.status === "Performance Ready" ? "Polishing" : "Performance Ready";

  await navigate(page, "lessons", "Lessons", ".agenda-days");
  await setValue(page, "#lessonRangeFilter", "Upcoming");
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`[data-action="open-lesson"][data-id="${CSS.escape(id)}"]`)),
    { timeout: 5000 },
    cancellationLesson.id
  );
  await clickByData(page, "open-lesson", cancellationLesson.id);
  await page.waitForSelector("#lessonWorkspaceForm");
  await setValue(page, '#lessonWorkspaceForm [name="status"]', "Student Cancelled");
  await setValue(page, '#lessonWorkspaceForm [name="cancellationReason"]', "Regression cancellation should not count as repertoire work.");
  await setValue(page, `#lessonWorkspaceForm [name="pieceStatus__${changedPiece.id}"]`, alternateStage);
  await setValue(page, `#lessonWorkspaceForm [name="pieceSection__${changedPiece.id}"]`, "Synthetic draft section");
  await setValue(page, `#lessonWorkspaceForm [name="pieceNote__${changedPiece.id}"]`, "Retain in lesson draft only.");
  await page.$eval('#modalRoot button[type="submit"][form="lessonWorkspaceForm"][value="draft"]', (button) => button.click());
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().lessons.find((lesson) => lesson.id === id)?.status === "Student Cancelled",
    { timeout: 5000 },
    cancellationLesson.id
  );
  await waitForSaved(page);

  state = await readState(page);
  const cancellationPiecesAfter = cancellationPiecesBefore.map((piece) => state.repertoire.find((candidate) => candidate.id === piece.id));
  assert.deepEqual(cancellationPiecesAfter, cancellationPiecesBefore, "cancelling or drafting a lesson must not advance repertoire or change last-worked dates");
  const cancelled = state.lessons.find((lesson) => lesson.id === cancellationLesson.id);
  const draftedProgress = cancelled.repertoireProgress.find((progress) => progress.repertoireId === changedPiece.id);
  assert.equal(draftedProgress.status, alternateStage, "draft progress may remain attached to the lesson for later review");
  assert.equal(draftedProgress.note, "Retain in lesson draft only.", "draft progress note should stay on the lesson record");
  assert.equal(state.assignments.some((assignment) => assignment.lessonId === cancellationLesson.id), false, "cancelled draft should not create a practice assignment");

  const futureLesson = state.lessons
    .filter((lesson) => lesson.type === "Regular" && lesson.status === "Scheduled" && lesson.date > today && currentPiecesFor(lesson.studentId).length)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  assert.ok(futureLesson, "seed should include a future lesson for completion guard coverage");
  const futureBefore = structuredClone(futureLesson);
  const futurePiecesBefore = currentPiecesFor(futureLesson.studentId).map((piece) => structuredClone(piece));
  await navigate(page, "lessons", "Lessons", ".agenda-days");
  await setValue(page, "#lessonRangeFilter", "Upcoming");
  await page.waitForFunction(
    (id) => Boolean(document.querySelector(`[data-action="open-lesson"][data-id="${CSS.escape(id)}"]`)),
    { timeout: 5000 },
    futureLesson.id
  );
  await clickByData(page, "open-lesson", futureLesson.id);
  await page.waitForSelector("#lessonWorkspaceForm");
  assert.equal(
    await page.$$eval('#lessonWorkspaceForm [name="status"] option', (options) => options.some((option) => option.value === "Completed")),
    false,
    "lesson drafts should not expose Completed as an ordinary status"
  );
  await page.$eval('#lessonWorkspaceForm [name="status"]', (select) => {
    select.insertAdjacentHTML("beforeend", '<option value="Completed">Completed</option>');
    select.value = "Completed";
  });
  await page.$eval('#modalRoot button[type="submit"][form="lessonWorkspaceForm"][value="draft"]', (button) => button.click());
  await page.waitForFunction(
    () => [...document.querySelectorAll(".toast")].some((toast) => /A draft cannot bypass/i.test(toast.textContent)),
    { timeout: 5000 }
  );
  assert.deepEqual((await readState(page)).lessons.find((item) => item.id === futureLesson.id), futureBefore, "synthetic Completed draft should be rejected without mutation");
  await setValue(page, '#lessonWorkspaceForm [name="status"]', "Scheduled");
  await setValue(page, '#lessonWorkspaceForm [name="summary"]', "This future lesson must remain scheduled.");
  await setValue(page, '#lessonWorkspaceForm [data-assignment-field="instructions"]', "This assignment must not be created early.");
  await page.$eval('#modalRoot button[type="submit"][form="lessonWorkspaceForm"][value="complete"]', (button) => button.click());
  await page.waitForFunction(
    () => [...document.querySelectorAll(".toast")].some((toast) => /Future lessons cannot be completed yet/i.test(toast.textContent)),
    { timeout: 5000 }
  );
  state = await readState(page);
  assert.deepEqual(state.lessons.find((lesson) => lesson.id === futureLesson.id), futureBefore, "future completion attempt must leave the lesson unchanged");
  assert.deepEqual(
    futurePiecesBefore.map((piece) => state.repertoire.find((candidate) => candidate.id === piece.id)),
    futurePiecesBefore,
    "future completion attempt must leave repertoire unchanged"
  );
  assert.equal(state.assignments.some((assignment) => assignment.lessonId === futureLesson.id), false, "future completion attempt must not create an assignment");
  assert.equal(await page.$eval("#modalRoot", (rootElement) => rootElement.classList.contains("open")), true, "blocked future completion should keep the workspace open");
  await clickByData(page, "close-modal");
}

async function createStudent(page, marker) {
  await navigate(page, "students", "Students", ".student-cards");
  const before = await readState(page);
  const startDate = isoDaysFromNow(-7);
  await clickByData(page, "new-student");
  await page.waitForSelector("#studentForm");
  assert.deepEqual(
    await page.$$eval('#studentForm [name="billingModel"] option', (options) => options.map((option) => option.value)),
    ["Monthly tuition"],
    "student enrollment should expose only the implemented monthly tuition billing model"
  );

  await setValue(page, '#studentForm [name="firstName"]', "Cadence");
  await setValue(page, '#studentForm [name="lastName"]', `Test ${marker}`);
  await setValue(page, '#studentForm [name="studentType"]', "Minor");
  await setValue(page, '#studentForm [name="birthDate"]', "2015-04-12");
  await setValue(page, '#studentForm [name="startDate"]', startDate);
  await setValue(page, '#studentForm [name="level"]', "Elementary");
  await setValue(page, '#studentForm [name="yearsStudying"]', "2");
  await setValue(page, '#studentForm [name="scheduleTime"]', "09:00");
  await setValue(page, '#studentForm [name="duration"]', "45");
  await setValue(page, '#studentForm [name="tuitionAmount"]', "210");
  await setValue(page, '#studentForm [name="guardianFirstName"]', "Morgan");
  await setValue(page, '#studentForm [name="guardianLastName"]', `Test ${marker}`);
  await setValue(page, '#studentForm [name="guardianEmail"]', `guardian.${marker}@example.com`);
  await setValue(page, '#studentForm [name="guardianPhone"]', "(414) 555-0199");
  await setValue(page, '#studentForm [name="guardianRelationshipNotes"]', "Primary household contact.");
  await setValue(page, '#studentForm [name="guardianNotes"]', "Prefers concise scheduling messages.");
  await submitModal(page, "studentForm");

  await page.waitForFunction(
    (lastName) => window.HarmonyHouse.getState().students.some((student) => student.lastName === lastName),
    { timeout: 5000 },
    `Test ${marker}`
  );
  await waitForSaved(page);
  const after = await readState(page);
  const student = after.students.find((item) => item.lastName === `Test ${marker}`);
  const guardian = after.guardians.find((item) => item.email === `guardian.${marker}@example.com`);
  assert.ok(student, "student creation should append a normalized student");
  assert.ok(guardian, "minor creation should create a guardian");
  assert.equal(after.students.length, before.students.length + 1, "student count should increment once");
  assert.equal(after.guardians.length, before.guardians.length + 1, "guardian count should increment once");
  assert.ok(after.studentGuardians.some((link) => link.studentId === student.id && link.guardianId === guardian.id), "student should be linked to the guardian");
  const schedule = after.recurringSchedules.find((item) => item.studentId === student.id && item.active !== false);
  assert.ok(schedule, "student should receive a recurring schedule");
  assert.equal(schedule.effectiveFrom, startDate, "new recurring schedule should begin on the entered start date");
  assert.ok(after.lessons.filter((lesson) => lesson.studentId === student.id && lesson.status === "Scheduled").length >= 8, "recurring schedule should generate future lesson occurrences");
  const firstCharge = after.tuitionCharges.find((charge) => charge.studentId === student.id && charge.amount === 210);
  assert.ok(firstCharge, "monthly student should receive a first tuition charge");
  assert.equal(firstCharge.period, startDate.slice(0, 7), "first charge period should align with the entered start date");
  assert.equal(firstCharge.dueDate, startDate, "first charge due date should align with the entered start date");
  assert.equal(await page.$eval("#drawerRoot", (rootElement) => rootElement.classList.contains("open")), true, "created student should open in a profile drawer");
  return student.id;
}

async function testGuardianRelationships(page, studentId, marker) {
  await page.evaluate((id) => window.HarmonyHouse.navigate("students", id), studentId);
  await page.waitForSelector("#drawerRoot.open");
  await clickByData(page, "student-tab", null, { tab: "guardians" });
  await page.waitForSelector('#drawerRoot [data-action="new-guardian"]');

  let state = await readState(page);
  const originalLinks = state.studentGuardians.filter((link) => link.studentId === studentId);
  assert.equal(originalLinks.length, 1, "new minor should begin with one guardian relationship");
  const primaryLink = originalLinks[0];
  const sharedEmail = `shared.guardian.${marker}@example.com`;
  const sharedPhone = "(414) 555-0177";

  await clickByData(page, "new-guardian", null, { studentId });
  await page.waitForSelector("#guardianForm");
  assert.equal(await page.$eval('#guardianForm [name="primaryContact"]', (field) => field.checked), false, "an added family contact should default to a secondary relationship");
  assert.equal(await page.$eval('#guardianForm [name="billingContact"]', (field) => field.checked), false, "an added family contact should not silently replace billing responsibility");
  await setValue(page, '#guardianForm [name="firstName"]', "Jordan");
  await setValue(page, '#guardianForm [name="lastName"]', `Shared ${marker}`);
  await setValue(page, '#guardianForm [name="email"]', sharedEmail);
  await setValue(page, '#guardianForm [name="phone"]', sharedPhone);
  await setValue(page, '#guardianForm [name="relationship"]', "Grandparent");
  await setValue(page, '#guardianForm [name="guardianNotes"]', "Shared pickup contact for siblings.");
  await setValue(page, '#guardianForm [name="relationshipNotes"]', "Available for Wednesday transportation.");
  await submitModal(page, "guardianForm");
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().studentGuardians.filter((link) => link.studentId === id).length === 2,
    { timeout: 5000 },
    studentId
  );

  state = await readState(page);
  const secondaryGuardian = state.guardians.find((guardian) => guardian.email === sharedEmail);
  let secondaryLink = state.studentGuardians.find((link) => link.studentId === studentId && link.guardianId === secondaryGuardian?.id);
  assert.ok(secondaryGuardian && secondaryLink, "secondary guardian should be stored as a normalized contact plus relationship link");
  assert.equal(secondaryLink.primaryContact, false, "secondary guardian should not replace the primary contact");

  await clickByData(page, "edit-guardian", secondaryLink.id);
  await page.waitForSelector("#guardianForm");
  await setChecked(page, '#guardianForm [name="billingContact"]', true);
  await setValue(page, '#guardianForm [name="relationshipNotes"]', "Billing contact and Wednesday transportation.");
  await setValue(page, '#guardianForm [name="guardianNotes"]', "Shared pickup contact; prefers text.");
  await submitModal(page, "guardianForm");
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().studentGuardians.find((link) => link.id === id)?.billingContact === true,
    { timeout: 5000 },
    secondaryLink.id
  );
  state = await readState(page);
  secondaryLink = state.studentGuardians.find((link) => link.id === secondaryLink.id);
  assert.equal(state.studentGuardians.filter((link) => link.studentId === studentId && link.primaryContact).length, 1, "minor should retain exactly one primary guardian");
  assert.equal(state.studentGuardians.filter((link) => link.studentId === studentId && link.billingContact).length, 1, "billing responsibility should move deliberately to one guardian");
  assert.match(secondaryLink.notes, /Billing contact/, "relationship-specific notes should persist on the link");

  const secondaryBeforeStudentEdit = structuredClone(secondaryLink);
  await clickByData(page, "edit-student", studentId);
  await page.waitForSelector("#studentForm");
  await setValue(page, '#studentForm [name="teacherNotes"]', "General edit must preserve every secondary guardian.");
  await submitModal(page, "studentForm");
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().students.find((student) => student.id === id)?.teacherNotes.includes("preserve every secondary"),
    { timeout: 5000 },
    studentId
  );
  state = await readState(page);
  assert.deepEqual(
    state.studentGuardians.find((link) => link.id === secondaryBeforeStudentEdit.id),
    secondaryBeforeStudentEdit,
    "editing the student should not rewrite or remove a secondary guardian link"
  );

  const guardianCountBeforeSibling = state.guardians.length;
  await navigate(page, "students", "Students", ".student-cards");
  await clickByData(page, "new-student");
  await page.waitForSelector("#studentForm");
  const siblingLastName = `Sibling ${marker}`;
  await setValue(page, '#studentForm [name="firstName"]', "Tempo");
  await setValue(page, '#studentForm [name="lastName"]', siblingLastName);
  await setValue(page, '#studentForm [name="birthDate"]', "2016-08-20");
  await setValue(page, '#studentForm [name="startDate"]', isoDaysFromNow(0));
  await setValue(page, '#studentForm [name="scheduleTime"]', "08:00");
  await setValue(page, '#studentForm [name="duration"]', "30");
  await setValue(page, '#studentForm [name="tuitionAmount"]', "175");
  await setValue(page, '#studentForm [name="guardianFirstName"]', "Jordan");
  await setValue(page, '#studentForm [name="guardianLastName"]', `Shared ${marker}`);
  await setValue(page, '#studentForm [name="guardianEmail"]', "");
  await setValue(page, '#studentForm [name="guardianPhone"]', "4145550177");
  await submitModal(page, "studentForm");
  await page.waitForFunction((lastName) => window.HarmonyHouse.getState().students.some((student) => student.lastName === lastName), { timeout: 5000 }, siblingLastName);
  state = await readState(page);
  const sibling = state.students.find((student) => student.lastName === siblingLastName);
  assert.equal(state.guardians.length, guardianCountBeforeSibling, "normalized phone matching should reuse the existing guardian instead of duplicating it");
  assert.ok(state.studentGuardians.some((link) => link.studentId === sibling.id && link.guardianId === secondaryGuardian.id), "sibling should link to the shared guardian by normalized phone");
  assert.equal(state.guardians.find((guardian) => guardian.id === secondaryGuardian.id).email, sharedEmail, "phone-only sibling matching should preserve the shared guardian’s existing email");

  await navigate(page, "students", "Students", ".student-cards");
  await setValue(page, "#studentSearch", sharedEmail);
  await page.waitForFunction((firstId, secondId) => {
    const ids = [...document.querySelectorAll('[data-action="open-student"][data-id]')].map((element) => element.dataset.id);
    return ids.includes(firstId) && ids.includes(secondId);
  }, {}, studentId, sibling.id);
  await setValue(page, "#studentSearch", "4145550177");
  await page.waitForFunction((firstId, secondId) => {
    const ids = [...document.querySelectorAll('[data-action="open-student"][data-id]')].map((element) => element.dataset.id);
    return ids.includes(firstId) && ids.includes(secondId);
  }, {}, studentId, sibling.id);
  await setValue(page, "#studentSearch", "");
  await setValue(page, "#studentSort", "name-desc");
  const visibleNames = await page.$$eval(".desktop-student-table tbody tr .avatar-name strong", (elements) => elements.map((element) => element.textContent.trim()));
  assert.deepEqual(visibleNames, [...visibleNames].sort((a, b) => b.localeCompare(a)), "student sort control should apply descending name order");

  await setValue(page, "#globalSearch", sharedEmail);
  await page.waitForSelector("#searchResults.open .search-result");
  assert.match(await page.$eval("#searchResults", (element) => element.textContent), /Jordan Shared/i, "global search should match guardian email and expose the linked students");
  await setValue(page, "#globalSearch", "");

  await page.evaluate((id) => window.HarmonyHouse.navigate("students", id), studentId);
  await page.waitForSelector("#drawerRoot.open");
  await clickByData(page, "student-tab", null, { tab: "guardians" });
  await clickByData(page, "unlink-guardian", secondaryLink.id);
  await page.waitForSelector('#modalRoot.open [role="alertdialog"]');
  await page.click('[data-action="confirm-yes"]');
  await page.waitForFunction((id) => !window.HarmonyHouse.getState().studentGuardians.some((link) => link.id === id), { timeout: 5000 }, secondaryLink.id);
  state = await readState(page);
  assert.ok(state.studentGuardians.some((link) => link.studentId === sibling.id && link.guardianId === secondaryGuardian.id), "unlinking one student should preserve the guardian’s sibling relationship");

  await clickByData(page, "unlink-guardian", primaryLink.id);
  await page.waitForFunction(
    () => [...document.querySelectorAll(".toast")].some((toast) => /minor must keep a guardian/i.test(toast.textContent)),
    { timeout: 5000 }
  );
  assert.ok((await readState(page)).studentGuardians.some((link) => link.id === primaryLink.id), "minor’s last guardian relationship must not be removed");
}

async function testSharedPrimaryIsolation(page, marker) {
  let state = await readState(page);
  const linksByGuardian = new Map();
  state.studentGuardians.forEach((link) => {
    const student = state.students.find((item) => item.id === link.studentId);
    if (!student || student.status !== "Active" || student.studentType !== "Minor") return;
    const links = linksByGuardian.get(link.guardianId) || [];
    links.push(link);
    linksByGuardian.set(link.guardianId, links);
  });
  const sharedLinks = [...linksByGuardian.values()].find((links) => links.length > 1);
  assert.ok(sharedLinks, "seed should include an active sibling family sharing one guardian");
  const targetLink = sharedLinks[0];
  const siblingLink = sharedLinks[1];
  const targetStudent = state.students.find((student) => student.id === targetLink.studentId);
  const sharedGuardianBefore = structuredClone(state.guardians.find((guardian) => guardian.id === targetLink.guardianId));
  const guardianCountBefore = state.guardians.length;
  const replacementEmail = `separate.guardian.${marker}@example.com`;

  await page.evaluate((id) => window.HarmonyHouse.navigate("students", id), targetStudent.id);
  await page.waitForSelector("#drawerRoot.open");
  await clickByData(page, "edit-student", targetStudent.id);
  await page.waitForSelector("#studentForm");
  await setValue(page, '#studentForm [name="guardianFirstName"]', "Casey");
  await setValue(page, '#studentForm [name="guardianLastName"]', `Separate ${marker}`);
  await setValue(page, '#studentForm [name="guardianEmail"]', replacementEmail);
  await setValue(page, '#studentForm [name="guardianPhone"]', "(414) 555-0188");
  await submitModal(page, "studentForm");
  await page.waitForFunction(
    ({ studentId, oldGuardianId }) => {
      const studio = window.HarmonyHouse.getState();
      return studio.studentGuardians.find((link) => link.studentId === studentId && link.primaryContact)?.guardianId !== oldGuardianId;
    },
    { timeout: 5000 },
    { studentId: targetStudent.id, oldGuardianId: sharedGuardianBefore.id }
  );
  await waitForSaved(page);

  state = await readState(page);
  const replacement = state.guardians.find((guardian) => guardian.email === replacementEmail);
  const targetPrimary = state.studentGuardians.find((link) => link.studentId === targetStudent.id && link.primaryContact);
  assert.ok(replacement, "editing one sibling to a different contact should create a separate guardian");
  assert.equal(state.guardians.length, guardianCountBefore + 1, "a distinct guardian should be added exactly once");
  assert.equal(targetPrimary.id, targetLink.id, "the student’s existing primary relationship should be repointed, not duplicated");
  assert.equal(targetPrimary.guardianId, replacement.id, "only the edited student should move to the replacement guardian");
  assert.deepEqual(
    state.guardians.find((guardian) => guardian.id === sharedGuardianBefore.id),
    sharedGuardianBefore,
    "separating one sibling must not mutate the shared guardian record"
  );
  assert.ok(
    state.studentGuardians.some((link) => link.id === siblingLink.id && link.guardianId === sharedGuardianBefore.id),
    "the other sibling must retain the original shared guardian"
  );
}

async function completeStudentLesson(page, studentId) {
  const before = await readState(page);
  const lesson = before.lessons
    .filter((item) => item.studentId === studentId && item.status === "Scheduled")
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  assert.ok(lesson, "new student should have a scheduled lesson to complete");

  await navigate(page, "lessons", "Lessons", ".agenda-days");
  await setValue(page, "#lessonRangeFilter", "Upcoming");
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-action="open-lesson"][data-id="${CSS.escape(id)}"]`)), {}, lesson.id);
  await clickByData(page, "open-lesson", lesson.id);
  await page.waitForSelector("#lessonWorkspaceForm");

  await setValue(page, '#lessonWorkspaceForm [name="whatWentWell"]', "Kept a steady pulse and listened carefully.");
  await setValue(page, '#lessonWorkspaceForm [name="focusNext"]', "Shape two-measure phrases without tension.");
  await setValue(page, '#lessonWorkspaceForm [name="summary"]', "Strong first documented lesson with a clear practice plan.");
  await setValue(page, '#lessonWorkspaceForm [data-assignment-row]:nth-child(1) [data-assignment-field="section"]', "Measures 1–16");
  await setValue(page, '#lessonWorkspaceForm [data-assignment-row]:nth-child(1) [data-assignment-field="goal"]', "15 minutes on five days");
  await setValue(page, '#lessonWorkspaceForm [data-assignment-row]:nth-child(1) [data-assignment-field="instructions"]', "Practice each phrase slowly three times, then connect the full section.");
  await clickByData(page, "add-assignment-row");
  await page.waitForFunction(() => document.querySelectorAll("#lessonWorkspaceForm [data-assignment-row]").length === 2);
  await setValue(page, '#lessonWorkspaceForm [data-assignment-row]:nth-child(2) [data-assignment-field="section"]', "Five-finger pattern");
  await setValue(page, '#lessonWorkspaceForm [data-assignment-row]:nth-child(2) [data-assignment-field="tempo"]', "72");
  await setValue(page, '#lessonWorkspaceForm [data-assignment-row]:nth-child(2) [data-assignment-field="goal"]', "Three careful repetitions");
  await setValue(page, '#lessonWorkspaceForm [data-assignment-row]:nth-child(2) [data-assignment-field="instructions"]', "Play the pattern in two keys with an even pulse.");
  await page.$eval('#modalRoot button[type="submit"][form="lessonWorkspaceForm"][value="complete"]', (button) => button.click());

  try {
    await page.waitForFunction(
      (id) => window.HarmonyHouse.getState().lessons.find((item) => item.id === id)?.status === "Completed",
      { timeout: 5000 },
      lesson.id
    );
  } catch (error) {
    const diagnostic = await page.evaluate((id) => ({
      status: window.HarmonyHouse.getState().lessons.find((item) => item.id === id)?.status,
      modalOpen: document.querySelector("#modalRoot")?.classList.contains("open"),
      invalid: [...document.querySelectorAll("#lessonWorkspaceForm :invalid")].map((field) => ({
        name: field.name,
        message: field.validationMessage,
        value: field.value
      })),
      submit: (() => {
        const button = document.querySelector('#modalRoot button[type="submit"][form="lessonWorkspaceForm"][value="complete"]');
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          disabled: button.disabled,
          associated: button.form === document.querySelector("#lessonWorkspaceForm"),
          connected: button.isConnected,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          hit: hit ? `${hit.tagName}.${hit.className}` : null,
          hitInside: hit === button || button.contains(hit)
        };
      })(),
      toasts: [...document.querySelectorAll(".toast")].map((toast) => toast.textContent.trim())
    }), lesson.id);
    throw new Error(`lesson completion did not persist: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await waitForSaved(page);
  const after = await readState(page);
  const completed = after.lessons.find((item) => item.id === lesson.id);
  const assignments = after.assignments.filter((item) => item.lessonId === lesson.id && item.studentId === studentId);
  assert.equal(completed.summary, "Strong first documented lesson with a clear practice plan.", "completion should persist lesson notes");
  assert.ok(completed.completedAt, "completion should store a completion timestamp");
  assert.equal(assignments.length, 2, "completion should create every assignment row as a connected record");
  assert.equal(assignments.every((assignment) => assignment.status === "Current"), true, "multiple next assignments should remain simultaneously current");
  assert.equal(new Set(assignments.map((assignment) => assignment.id)).size, 2, "each assignment row should receive a stable record identity");
  assert.match(assignments[0].instructions, /Practice each phrase/, "first assignment should preserve its next practice action");
  assert.match(assignments[1].instructions, /two keys/, "second assignment should persist independently");

  await navigate(page, "lessons", "Lessons", ".agenda-days");
  await setValue(page, "#lessonRangeFilter", "All");
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-action="open-lesson"][data-id="${CSS.escape(id)}"]`)), {}, lesson.id);
  await clickByData(page, "open-lesson", lesson.id);
  await page.waitForSelector("#modalRoot.open");
  assert.match(await page.$eval("#modalRoot", (element) => element.textContent), /2 assignments created from this lesson/i, "completed lesson review should show every historical assignment");
  await clickByData(page, "close-modal");
}

async function recordPayments(page, studentId) {
  const initial = await readState(page);
  const charge = initial.tuitionCharges.find((item) => item.studentId === studentId);
  assert.ok(charge, "created student should have an open tuition charge");
  const initialPayments = initial.payments.length;

  await navigate(page, "billing", "Billing", '[data-action="billing-tab"]');
  await clickByData(page, "new-payment", null, { chargeId: charge.id });
  await page.waitForSelector("#paymentForm");
  assert.deepEqual(
    await page.$$eval('#paymentForm [name="chargeId"] option:not([value=""])', (options) => options.map((option) => option.value)),
    [charge.id],
    "an exact-charge payment should not expose another family or charge"
  );
  await setValue(page, '#paymentForm [name="amount"]', "60");
  await setValue(page, '#paymentForm [name="method"]', "Zelle");
  await setValue(page, '#paymentForm [name="notes"]', "Regression partial payment");
  await submitModal(page, "paymentForm");
  await page.waitForFunction(
    ({ id, count }) => window.HarmonyHouse.getState().payments.filter((payment) => payment.chargeId === id).length === count,
    { timeout: 5000 },
    { id: charge.id, count: 1 }
  );

  let state = await readState(page);
  const paidAfterPartial = state.payments.filter((payment) => payment.chargeId === charge.id && payment.status !== "Void").reduce((total, payment) => total + Number(payment.amount), 0);
  assert.equal(paidAfterPartial, 60, "partial payment should be appended to the ledger");
  assert.equal(Number(charge.amount) - paidAfterPartial, 150, "partial payment should leave the correct balance");

  await clickByData(page, "new-payment", null, { chargeId: charge.id });
  await page.waitForSelector("#paymentForm");
  assert.equal(await page.$eval('#paymentForm [name="amount"]', (field) => Number(field.value)), 150, "second payment should prefill the remaining balance");
  await setValue(page, '#paymentForm [name="method"]', "Check");
  await submitModal(page, "paymentForm");
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().payments.filter((payment) => payment.chargeId === id).length === 2,
    { timeout: 5000 },
    charge.id
  );
  await waitForSaved(page);
  state = await readState(page);
  const totalPaid = state.payments.filter((payment) => payment.chargeId === charge.id && payment.status !== "Void").reduce((total, payment) => total + Number(payment.amount), 0);
  assert.equal(state.payments.length, initialPayments + 2, "partial and final payments should remain separate transactions");
  assert.equal(totalPaid, Number(charge.amount), "two payments should settle the exact charge without overwriting it");

  await page.evaluate((id) => window.HarmonyHouse.navigate("students", id), studentId);
  await page.waitForSelector("#drawerRoot.open");
  await clickByData(page, "new-payment", null, { studentId });
  await page.waitForFunction(
    () => [...document.querySelectorAll(".toast")].some((toast) => /No open charges/i.test(toast.textContent)),
    { timeout: 5000 }
  );
  assert.equal(await page.$("#paymentForm"), null, "a settled student should stop gracefully instead of falling back to another family");
  assert.equal((await readState(page)).payments.length, initialPayments + 2, "blocked student payment should not append a transaction");
}

async function testBillingSearchAndLifecycleOptions(page) {
  const state = await readState(page);
  const emma = state.students.find((student) => student.firstName === "Emma" && student.lastName === "Thompson");
  const currentCharge = state.tuitionCharges
    .filter((charge) => charge.studentId === emma.id)
    .sort((a, b) => b.period.localeCompare(a.period))[0];
  assert.ok(currentCharge, "seed billing search coverage needs Emma’s current charge");

  await navigate(page, "billing", "Billing", '[data-action="billing-tab"]');
  await setValue(page, "#billingPeriod", currentCharge.period);
  await setValue(page, "#billingSearch", "rachel.thompson@example.com");
  await page.waitForFunction(() => /Emma Thompson/.test(document.querySelector("#pageHost .table-wrap")?.textContent || ""));
  await clickByData(page, "billing-tab", null, { tab: "payments" });
  await page.waitForFunction(() => /Emma Thompson/.test(document.querySelector("#pageHost .table-wrap")?.textContent || ""));
  await setValue(page, "#billingSearch", "4145550101");
  await page.waitForFunction(() => /Emma Thompson/.test(document.querySelector("#pageHost .table-wrap")?.textContent || ""));
  await clickByData(page, "billing-tab", null, { tab: "makeups" });
  await page.waitForFunction(() => /Emma Thompson/.test(document.querySelector("#pageHost .table-wrap")?.textContent || ""));

  await navigate(page, "lessons", "Lessons", ".agenda-days");
  await clickByData(page, "new-lesson");
  await page.waitForSelector("#lessonForm");
  const lessonTypes = await page.$$eval('#lessonForm [name="type"] option', (options) => options.map((option) => option.value));
  const lessonStatuses = await page.$$eval('#lessonForm [name="status"] option', (options) => options.map((option) => option.value));
  assert.equal(lessonTypes.includes("Makeup"), false, "generic lesson creation should route makeups through an owed credit");
  assert.equal(lessonStatuses.includes("Completed"), false, "ordinary lesson editing should not bypass the completion workspace");
  await clickByData(page, "close-modal");

  await navigate(page, "inquiries", "Inquiries", ".pipeline");
  await clickByData(page, "new-inquiry");
  await page.waitForSelector("#inquiryForm");
  const inquiryOptions = await page.$$eval('#inquiryForm [name="status"] option', (options) => options.map((option) => option.value));
  assert.equal(inquiryOptions.includes("Converted"), false, "ordinary inquiry editing should not expose terminal conversion");
  assert.equal(inquiryOptions.includes("Trial Scheduled"), false, "ordinary inquiry editing should not forge a scheduled trial stage");
  assert.equal(inquiryOptions.includes("Trial Completed"), false, "ordinary inquiry editing should not forge a completed trial stage");
  const inquiryCount = (await readState(page)).inquiries.length;
  const forgedMarker = String(Date.now());
  await setValue(page, '#inquiryForm [name="prospectName"]', `Forged Trial ${forgedMarker}`);
  await setValue(page, '#inquiryForm [name="email"]', `forged.trial.${forgedMarker}@example.com`);
  await setValue(page, '#inquiryForm [name="availability"]', "Tuesday afternoon");
  await page.$eval('#inquiryForm [name="status"]', (select) => {
    const option = new Option("Trial Scheduled", "Trial Scheduled", true, true);
    select.add(option);
    select.value = "Trial Scheduled";
  });
  await submitModal(page, "inquiryForm");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".toast")].some((toast) => /trial lesson workflow/i.test(toast.textContent)),
    { timeout: 5000 }
  );
  assert.equal((await readState(page)).inquiries.length, inquiryCount, "synthetic form mutation must not create a trial stage without a trial");
  await clickByData(page, "close-modal");

  const contactedInquiry = (await readState(page)).inquiries.find((inquiry) => inquiry.status === "Contacted");
  await page.evaluate((id) => window.HarmonyHouse.navigate("inquiries", id), contactedInquiry.id);
  await page.waitForSelector("#drawerRoot.open");
  await clickByData(page, "follow-up-inquiry", contactedInquiry.id);
  await page.waitForSelector("#followUpForm");
  const followUpOptions = await page.$$eval('#followUpForm [name="status"] option', (options) => options.map((option) => option.value));
  assert.equal(followUpOptions.includes("Trial Scheduled"), false, "follow-up editing should not forge a scheduled trial stage");
  assert.equal(followUpOptions.includes("Trial Completed"), false, "follow-up editing should not forge a completed trial stage");
  assert.equal(followUpOptions.includes("Converted"), false, "follow-up editing should not forge conversion");
  await clickByData(page, "close-modal");

  await navigate(page, "recitals", "Recitals", ".recital-layout");
  const openRecital = (await readState(page)).recitals.find((recital) => recital.status !== "Completed");
  await clickByData(page, "select-recital", openRecital.id);
  await clickByData(page, "edit-recital", openRecital.id);
  await page.waitForSelector("#recitalForm");
  assert.equal(
    await page.$$eval('#recitalForm [name="status"] option', (options) => options.some((option) => option.value === "Completed")),
    false,
    "ordinary recital editing should not bypass final-program snapshotting"
  );
  await clickByData(page, "close-modal");
}

async function testRepertoireReactivation(page) {
  let state = await readState(page);
  const source = state.repertoire.find((piece) => piece.status === "Completed" && !state.repertoire.some((candidate) => (
    candidate.studentId === piece.studentId
    && candidate.status !== "Completed"
    && candidate.title.toLowerCase() === piece.title.toLowerCase()
    && candidate.composer.toLowerCase() === piece.composer.toLowerCase()
  )));
  assert.ok(source, "seed should include a completed piece without an equivalent active copy");
  const sourceBefore = structuredClone(source);
  const activityBefore = state.activity.length;

  await navigate(page, "repertoire", "Repertoire", ".table-wrap");
  await clickByData(page, "repertoire-status", null, { status: "Completed" });
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-action="edit-repertoire"][data-id="${CSS.escape(id)}"]`)), {}, source.id);
  await clickByData(page, "edit-repertoire", source.id);
  await page.waitForSelector('#modalRoot.open [data-action="reactivate-repertoire"]');
  await clickByData(page, "reactivate-repertoire", source.id);
  await page.waitForSelector('#modalRoot.open [role="alertdialog"]');
  await page.click('[data-action="confirm-yes"]');
  await page.waitForFunction(
    (sourceId) => window.HarmonyHouse.getState().repertoire.some((piece) => piece.reactivatedFromId === sourceId && piece.status !== "Completed"),
    { timeout: 5000 },
    source.id
  );
  await waitForSaved(page);

  state = await readState(page);
  const successor = state.repertoire.find((piece) => piece.reactivatedFromId === source.id && piece.status !== "Completed");
  assert.deepEqual(state.repertoire.find((piece) => piece.id === source.id), sourceBefore, "reactivation must leave the original completion record byte-stable");
  assert.ok(successor && successor.id !== source.id, "reactivation should create a distinct linked record");
  assert.equal(successor.studentId, source.studentId, "reactivated repertoire should stay with the original student");
  assert.equal(successor.dateCompleted, "", "reactivated repertoire should begin without a completion date");
  assert.ok(state.activity.length > activityBefore && state.activity.some((entry) => /Reactivated/.test(entry.text || "")), "reactivation should append an audit entry");

  await clickByData(page, "repertoire-status", null, { status: "Current" });
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-action="edit-repertoire"][data-id="${CSS.escape(id)}"]`)), {}, successor.id);
  await clickByData(page, "edit-repertoire", successor.id);
  await page.waitForSelector("#repertoireForm");
  assert.equal(await page.$('#repertoireForm select[name="studentId"]'), null, "an existing piece should not expose a reassignable student select");
  assert.equal(await page.$eval('#repertoireForm input[name="studentId"]', (field) => field.value), source.studentId, "existing piece should retain its student in a hidden immutable field");
  const anotherStudent = state.students.find((student) => student.id !== source.studentId);
  await setValue(page, '#repertoireForm input[name="studentId"]', anotherStudent.id);
  await submitModal(page, "repertoireForm");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".toast")].some((toast) => /cannot be reassigned/i.test(toast.textContent)),
    { timeout: 5000 }
  );
  assert.equal((await readState(page)).repertoire.find((piece) => piece.id === successor.id).studentId, source.studentId, "synthetic field mutation must not reassign existing repertoire");
  await clickByData(page, "close-modal");
}

async function runInquiryToStudent(page, marker) {
  await navigate(page, "inquiries", "Inquiries", ".pipeline");
  const before = await readState(page);
  const prospectName = `Aria Lead ${marker}`;
  const email = `aria.lead.${marker}@example.com`;
  await clickByData(page, "new-inquiry");
  await page.waitForSelector("#inquiryForm");
  await setValue(page, '#inquiryForm [name="prospectName"]', prospectName);
  await setValue(page, '#inquiryForm [name="age"]', "29");
  await setValue(page, '#inquiryForm [name="email"]', email);
  await setValue(page, '#inquiryForm [name="phone"]', "(414) 555-0188");
  await setValue(page, '#inquiryForm [name="experience"]', "Returning adult pianist");
  await setValue(page, '#inquiryForm [name="availability"]', "Weekday mornings");
  await setValue(page, '#inquiryForm [name="notes"]', "Wants a structured return to classical repertoire.");
  await submitModal(page, "inquiryForm");

  await page.waitForFunction((name) => window.HarmonyHouse.getState().inquiries.some((item) => item.prospectName === name), { timeout: 5000 }, prospectName);
  let state = await readState(page);
  const inquiry = state.inquiries.find((item) => item.prospectName === prospectName);
  assert.equal(state.inquiries.length, before.inquiries.length + 1, "new inquiry should enter the pipeline once");
  assert.equal(inquiry.status, "New Inquiry", "new inquiry should begin in the New Inquiry stage");
  await page.waitForSelector('#drawerRoot.open [data-action="advance-inquiry"]');
  await clickByData(page, "advance-inquiry", inquiry.id, { status: "Contacted" });
  await page.waitForFunction((id) => window.HarmonyHouse.getState().inquiries.find((item) => item.id === id)?.status === "Contacted", {}, inquiry.id);

  await page.waitForSelector('#drawerRoot.open [data-action="schedule-trial"]');
  await clickByData(page, "schedule-trial", inquiry.id);
  await page.waitForSelector("#lessonForm");
  await setValue(page, '#lessonForm [name="date"]', isoDaysFromNow(0));
  await setValue(page, '#lessonForm [name="startTime"]', "11:30");
  await submitModal(page, "lessonForm");
  await page.waitForFunction(
    (id) => {
      const item = window.HarmonyHouse.getState().inquiries.find((candidate) => candidate.id === id);
      return item?.status === "Trial Scheduled" && Boolean(item.trialLessonId);
    },
    { timeout: 5000 },
    inquiry.id
  );

  state = await readState(page);
  const trialId = state.inquiries.find((item) => item.id === inquiry.id).trialLessonId;
  assert.ok(state.lessons.some((lesson) => lesson.id === trialId && lesson.type === "Trial" && lesson.inquiryId === inquiry.id), "trial should be linked in both directions");
  await page.evaluate((id) => window.HarmonyHouse.navigate("inquiries", id), inquiry.id);
  await page.waitForSelector('#drawerRoot.open [data-action="open-lesson"]');
  await clickByData(page, "open-lesson", trialId);
  await page.waitForSelector("#lessonWorkspaceForm");
  await setValue(page, '#lessonWorkspaceForm [name="whatWentWell"]', "Strong listening and quick pattern recognition.");
  await setValue(page, '#lessonWorkspaceForm [name="summary"]', "Trial confirmed a good studio fit.");
  await page.$eval('#modalRoot button[type="submit"][form="lessonWorkspaceForm"][value="complete"]', (button) => button.click());
  await page.waitForFunction(
    ({ inquiryId, lessonId }) => {
      const snapshot = window.HarmonyHouse.getState();
      return snapshot.inquiries.find((item) => item.id === inquiryId)?.status === "Trial Completed"
        && snapshot.lessons.find((item) => item.id === lessonId)?.status === "Completed";
    },
    { timeout: 5000 },
    { inquiryId: inquiry.id, lessonId: trialId }
  );

  await page.waitForSelector('#drawerRoot.open [data-action="convert-inquiry"]');
  await clickByData(page, "convert-inquiry", inquiry.id);
  await page.waitForSelector("#convertInquiryForm");
  await setValue(page, '#convertInquiryForm [name="scheduleTime"]', "10:00");
  await submitModal(page, "convertInquiryForm");
  try {
    await page.waitForFunction(
      (id) => {
        const item = window.HarmonyHouse.getState().inquiries.find((candidate) => candidate.id === id);
        return item?.status === "Converted" && Boolean(item.convertedStudentId);
      },
      { timeout: 5000 },
      inquiry.id
    );
  } catch (error) {
    const diagnostic = await page.evaluate((id) => ({
      inquiry: window.HarmonyHouse.getState().inquiries.find((item) => item.id === id),
      invalid: [...document.querySelectorAll("#convertInquiryForm :invalid")].map((field) => ({
        name: field.name,
        message: field.validationMessage,
        value: field.value,
        hidden: field.closest(".hidden") !== null
      })),
      modalOpen: document.querySelector("#modalRoot")?.classList.contains("open"),
      toasts: [...document.querySelectorAll(".toast")].map((toast) => toast.textContent.trim())
    }), inquiry.id);
    throw new Error(`inquiry conversion did not persist: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await waitForSaved(page);

  state = await readState(page);
  const converted = state.inquiries.find((item) => item.id === inquiry.id);
  const student = state.students.find((item) => item.id === converted.convertedStudentId);
  assert.ok(student, "conversion should create the linked student without re-entering contact data");
  assert.equal(student.email, email, "adult conversion should reuse the inquiry email");
  assert.equal(converted.trialLessonId, trialId, "conversion should preserve the inquiry-to-trial audit link");
  const convertedTrial = state.lessons.find((lesson) => lesson.id === trialId);
  assert.equal(convertedTrial.studentId, student.id, "converted trial should move to the new student history");
  assert.equal(convertedTrial.inquiryId, "", "converted trial should have exactly one owner after enrollment");
  assert.equal(convertedTrial.summary, "Trial confirmed a good studio fit.", "conversion should preserve the completed trial teaching record");
  assert.ok(state.recurringSchedules.some((schedule) => schedule.studentId === student.id && schedule.active !== false), "conversion should create a recurring schedule");
  assert.ok(state.tuitionCharges.some((charge) => charge.studentId === student.id), "conversion should create the initial tuition charge");

  await page.waitForSelector("#drawerRoot.open");
  await clickByData(page, "student-tab", null, { tab: "lessons" });
  await page.waitForFunction(() => /Trial confirmed a good studio fit/i.test(document.querySelector("#drawerRoot")?.textContent || ""));
  assert.match(await page.$eval("#drawerRoot", (element) => element.textContent), /Trial confirmed a good studio fit/i, "student lesson history should carry forward the converted trial");
  await page.evaluate((id) => window.HarmonyHouse.navigate("inquiries", id), inquiry.id);
  await page.waitForSelector("#drawerRoot.open");
  assert.equal(await page.$('#drawerRoot [data-action="edit-inquiry"]'), null, "converted inquiry should not expose ordinary editing");
}

async function testRecitalWorkflow(page, marker) {
  await navigate(page, "recitals", "Recitals", ".recital-layout");
  let state = await readState(page);
  const recital = state.recitals.find((item) => item.status !== "Completed");
  const ordered = state.recitalParticipants.filter((item) => item.recitalId === recital.id).sort((a, b) => a.order - b.order);
  assert.ok(ordered.length >= 2, "current recital should have at least two performers");
  await clickByData(page, "select-recital", recital.id);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-action="select-recital"][data-id="${CSS.escape(id)}"]`)?.classList.contains("active"),
    { timeout: 5000 },
    recital.id
  );
  const first = ordered[0];
  const second = ordered[1];
  const guarded = ordered[2];
  const guardedPiece = state.repertoire.find((item) => item.id === guarded.repertoireId);
  assert.ok(guardedPiece && guardedPiece.status !== "Completed", "recital regression coverage needs a current linked piece");

  await navigate(page, "repertoire", "Repertoire", ".table-wrap");
  await clickByData(page, "repertoire-status", null, { status: "Current" });
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-action="edit-repertoire"][data-id="${CSS.escape(id)}"]`)), {}, guardedPiece.id);
  await clickByData(page, "edit-repertoire", guardedPiece.id);
  await page.waitForSelector("#repertoireForm");
  await setValue(page, '#repertoireForm [name="status"]', "Completed");
  await submitModal(page, "repertoireForm");
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().repertoire.find((piece) => piece.id === id)?.status === "Completed",
    { timeout: 5000 },
    guardedPiece.id
  );
  await waitForSaved(page);

  await navigate(page, "recitals", "Recitals", ".recital-layout");
  await clickByData(page, "select-recital", recital.id);
  const guardedReadiness = guarded.readiness === "Learning" ? "Developing" : "Learning";
  await setValue(page, `[data-recital-readiness="${guarded.id}"]`, guardedReadiness);
  await page.waitForFunction(
    ({ participantId, readiness }) => window.HarmonyHouse.getState().recitalParticipants.find((item) => item.id === participantId)?.readiness === readiness,
    { timeout: 5000 },
    { participantId: guarded.id, readiness: guardedReadiness }
  );
  await waitForSaved(page);
  state = await readState(page);
  assert.equal(state.repertoire.find((piece) => piece.id === guardedPiece.id).status, "Completed", "recital readiness must never regress completed repertoire");

  await clickByData(page, "move-participant", second.id, { direction: "-1" });
  await page.waitForFunction(
    ({ firstId, secondId }) => {
      const participants = window.HarmonyHouse.getState().recitalParticipants;
      return participants.find((item) => item.id === firstId)?.order === 2
        && participants.find((item) => item.id === secondId)?.order === 1;
    },
    { timeout: 5000 },
    { firstId: first.id, secondId: second.id }
  );

  state = await readState(page);
  const moved = state.recitalParticipants.find((item) => item.id === second.id);
  const nextReadiness = moved.readiness === "Performance Ready" ? "Polishing" : "Performance Ready";
  await setValue(page, `[data-recital-readiness="${second.id}"]`, nextReadiness);
  await page.waitForFunction(
    ({ participantId, value }) => window.HarmonyHouse.getState().recitalParticipants.find((item) => item.id === participantId)?.readiness === value,
    { timeout: 5000 },
    { participantId: second.id, value: nextReadiness }
  );
  await waitForSaved(page);
  state = await readState(page);
  const updatedParticipant = state.recitalParticipants.find((item) => item.id === second.id);
  const piece = state.repertoire.find((item) => item.id === updatedParticipant.repertoireId);
  assert.equal(piece.status, nextReadiness, "readiness changes should synchronize to the connected repertoire record");

  const snapshotStudent = state.students.find((student) => student.id === updatedParticipant.studentId);
  const expectedStudentName = [snapshotStudent.preferredName || snapshotStudent.firstName, snapshotStudent.lastName].filter(Boolean).join(" ");
  const expectedTitle = piece.title;
  const expectedComposer = piece.composer;
  await clickByData(page, "complete-recital", recital.id);
  await page.waitForSelector('#modalRoot.open [role="alertdialog"]');
  await page.click('[data-action="confirm-yes"]');
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().recitals.find((item) => item.id === id)?.status === "Completed",
    { timeout: 5000 },
    recital.id
  );
  await waitForSaved(page);
  state = await readState(page);
  const frozenParticipant = state.recitalParticipants.find((item) => item.id === second.id);
  assert.equal(frozenParticipant.studentNameSnapshot, expectedStudentName, "recital completion should snapshot the performer label");
  assert.equal(frozenParticipant.pieceTitleSnapshot, expectedTitle, "recital completion should snapshot the piece title");
  assert.equal(frozenParticipant.composerSnapshot, expectedComposer, "recital completion should snapshot the composer");

  await page.evaluate((id) => window.HarmonyHouse.navigate("students", id), snapshotStudent.id);
  await page.waitForSelector("#drawerRoot.open");
  await clickByData(page, "edit-student", snapshotStudent.id);
  await page.waitForSelector("#studentForm");
  const renamedStudent = `Snapshot ${marker}`;
  await setValue(page, '#studentForm [name="preferredName"]', renamedStudent);
  await submitModal(page, "studentForm");
  await page.waitForFunction(
    ({ id, name }) => window.HarmonyHouse.getState().students.find((student) => student.id === id)?.preferredName === name,
    { timeout: 5000 },
    { id: snapshotStudent.id, name: renamedStudent }
  );

  await navigate(page, "repertoire", "Repertoire", ".table-wrap");
  await clickByData(page, "repertoire-status", null, { status: "Current" });
  await page.waitForFunction((id) => Boolean(document.querySelector(`[data-action="edit-repertoire"][data-id="${CSS.escape(id)}"]`)), {}, piece.id);
  await clickByData(page, "edit-repertoire", piece.id);
  await page.waitForSelector("#repertoireForm");
  const renamedTitle = `Changed after recital ${marker}`;
  await setValue(page, '#repertoireForm [name="title"]', renamedTitle);
  await submitModal(page, "repertoireForm");
  await page.waitForFunction(
    ({ id, title }) => window.HarmonyHouse.getState().repertoire.find((item) => item.id === id)?.title === title,
    { timeout: 5000 },
    { id: piece.id, title: renamedTitle }
  );

  await navigate(page, "recitals", "Recitals", ".recital-layout");
  await clickByData(page, "select-recital", recital.id);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-action="select-recital"][data-id="${CSS.escape(id)}"]`)?.classList.contains("active"),
    { timeout: 5000 },
    recital.id
  );
  const finalRosterText = await page.$eval(".recital-layout tbody", (element) => element.textContent);
  assert.match(finalRosterText, new RegExp(expectedStudentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "completed roster should retain the snapshotted student label");
  assert.match(finalRosterText, new RegExp(expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "completed roster should retain the snapshotted piece title");
  assert.doesNotMatch(finalRosterText, new RegExp(renamedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "later repertoire edits must not rewrite the final roster");
  await clickByData(page, "preview-program", recital.id);
  await page.waitForSelector("#modalRoot.open .program-preview");
  const previewText = await page.$eval(".program-preview", (element) => element.textContent);
  assert.match(previewText, new RegExp(expectedStudentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "program preview should use the frozen performer label");
  assert.match(previewText, new RegExp(expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "program preview should use the frozen piece label");
  assert.doesNotMatch(previewText, new RegExp(renamedStudent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "later student edits must not rewrite the final program");
  await clickByData(page, "close-modal");
}

async function testExpenseCrud(page, marker) {
  await navigate(page, "expenses", "Expenses", ".table-wrap");
  const before = await readState(page);
  const vendor = `Cadence QA ${marker}`;
  await clickByData(page, "new-expense");
  await page.waitForSelector("#expenseForm");
  await setValue(page, '#expenseForm [name="vendor"]', vendor);
  await setValue(page, '#expenseForm [name="category"]', "Software");
  await setValue(page, '#expenseForm [name="amount"]', "42.75");
  await setValue(page, '#expenseForm [name="description"]', "Browser regression subscription");
  await setValue(page, '#expenseForm [name="notes"]', "Created by piano-studio-check");
  await submitModal(page, "expenseForm");
  await page.waitForFunction((name) => window.HarmonyHouse.getState().expenses.some((item) => item.vendor === name), {}, vendor);

  let state = await readState(page);
  const expense = state.expenses.find((item) => item.vendor === vendor);
  assert.equal(state.expenses.length, before.expenses.length + 1, "expense creation should append one record");
  await clickByData(page, "edit-expense", expense.id);
  await page.waitForSelector("#expenseForm");
  await setValue(page, '#expenseForm [name="amount"]', "55.25");
  await setValue(page, '#expenseForm [name="description"]', "Updated browser regression subscription");
  await submitModal(page, "expenseForm");
  await page.waitForFunction(
    (id) => window.HarmonyHouse.getState().expenses.find((item) => item.id === id)?.amount === 55.25,
    { timeout: 5000 },
    expense.id
  );
  state = await readState(page);
  assert.equal(state.expenses.length, before.expenses.length + 1, "expense edit should preserve the record identity");
  assert.equal(state.expenses.find((item) => item.id === expense.id).description, "Updated browser regression subscription", "expense edit should persist changed fields");

  await clickByData(page, "delete-expense", expense.id);
  await page.waitForSelector('#modalRoot.open [role="alertdialog"]');
  const dialog = await page.$eval('[role="alertdialog"]', (element) => ({
    name: document.getElementById(element.getAttribute("aria-labelledby"))?.textContent,
    description: document.getElementById(element.getAttribute("aria-describedby"))?.textContent
  }));
  assert.equal(dialog.name, "Delete this expense?", "destructive confirmation should have an accessible name");
  assert.match(dialog.description || "", /Cadence QA/, "destructive confirmation should describe the exact record");
  await page.click('[data-action="confirm-yes"]');
  await page.waitForFunction((id) => !window.HarmonyHouse.getState().expenses.some((item) => item.id === id), { timeout: 5000 }, expense.id);
  await waitForSaved(page);
  state = await readState(page);
  assert.equal(state.expenses.length, before.expenses.length, "expense delete should return the collection to its original size");
}

async function testThemeAndFocus(page) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await navigate(page, "expenses", "Expenses", ".table-wrap");
  const themeButton = '.topbar [data-action="cycle-theme"]';
  await page.focus(themeButton);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.dataset.themePreference === "light");
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), themeKey), "light", "theme preference should persist separately from studio data");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.dataset.themePreference === "dark" && document.documentElement.dataset.theme === "dark");
  await waitForSaved(page);
  assert.equal((await readState(page)).settings.appearance.theme, "dark", "theme preference should synchronize into settings");

  const trigger = '.page-head [data-action="new-expense"]';
  await page.focus(trigger);
  await page.keyboard.press("Enter");
  await page.waitForSelector("#expenseForm");
  await page.waitForFunction(() => document.activeElement?.dataset.action === "close-modal");
  assert.equal(await page.$eval(".app-shell", (element) => element.inert), true, "open modal should make the application shell inert");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  const wrappedFocus = await page.evaluate(() => ({
    inModal: Boolean(document.activeElement?.closest("#modalRoot")),
    action: document.activeElement?.dataset.action || "",
    label: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || ""
  }));
  assert.equal(wrappedFocus.inModal, true, `Shift+Tab should remain trapped in the modal: ${JSON.stringify(wrappedFocus)}`);
  assert.equal(
    await page.evaluate(() => document.activeElement?.matches('[type="submit"][form="expenseForm"]')),
    true,
    `Shift+Tab from the first modal control should wrap to the final submit action: ${JSON.stringify(wrappedFocus)}`
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#modalRoot")?.classList.contains("open"));
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), "new-expense", "closing a modal should restore focus to its trigger");
  assert.equal(await page.$eval(".app-shell", (element) => element.inert), false, "closed modal should restore application access");

  await page.keyboard.down("Control");
  await page.keyboard.press("k");
  await page.keyboard.up("Control");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "globalSearch", "Ctrl+K should focus global search");
  assert.equal(await page.$eval("#globalSearch", (element) => element.getAttribute("aria-expanded")), "false", "closed search should expose aria-expanded=false");
  await setValue(page, "#globalSearch", "Emma");
  await page.waitForSelector("#searchResults.open .search-result");
  assert.equal(await page.$eval("#globalSearch", (element) => element.getAttribute("aria-expanded")), "true", "open search results should expose aria-expanded=true");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("search-result")), true, "ArrowDown should move focus into results");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "globalSearch", "Escape should return focus to global search");
  assert.equal(await page.$eval("#globalSearch", (element) => element.getAttribute("aria-expanded")), "false", "Escape should collapse global search semantics");
}

async function testMemoryFallback(context, appUrl, origin) {
  const page = await context.newPage();
  const runtimeIssues = watchRuntime(page, origin);
  await page.evaluateOnNewDocument(() => {
    window.__storageStats = { getItem: 0, setItem: 0, removeItem: 0 };
    for (const method of ["getItem", "setItem", "removeItem"]) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value() {
          window.__storageStats[method] += 1;
          throw new DOMException("Storage disabled for regression coverage", "SecurityError");
        }
      });
    }
  });
  await page.goto(`${appUrl}?memory=${Date.now()}#dashboard`, { waitUntil: "load", timeout: 15000 });
  await waitForApp(page);
  await waitForSaved(page);
  assert.equal(await page.$eval("#modeTitle", (element) => element.textContent.trim()), "Tab-only memory mode", "storage failure should switch to explicit in-memory mode");
  assert.match(await page.$eval("#modeCopy", (element) => element.textContent), /Browser storage is unavailable/i, "browser-only fallback should not incorrectly blame Google Sheets");
  assert.match(await page.$eval("#modeCopy", (element) => element.textContent), /Export before closing/i, "memory-mode banner should warn that tab data is temporary");

  const before = await readState(page);
  const writesBefore = await page.evaluate(() => window.__storageStats.setItem);
  await navigate(page, "expenses", "Expenses", ".table-wrap");
  await clickByData(page, "new-expense");
  await page.waitForSelector("#expenseForm");
  await setValue(page, '#expenseForm [name="vendor"]', "Memory Mode QA");
  await setValue(page, '#expenseForm [name="amount"]', "19.25");
  await setValue(page, '#expenseForm [name="description"]', "Tab-only persistence check");
  await submitModal(page, "expenseForm");
  await page.waitForFunction(() => window.HarmonyHouse.getState().expenses.some((expense) => expense.vendor === "Memory Mode QA"), { timeout: 5000 });
  await waitForSaved(page);
  await clickByData(page, "cycle-theme");
  await waitForSaved(page);
  const after = await readState(page);
  const writesAfter = await page.evaluate(() => window.__storageStats.setItem);
  assert.equal(after.expenses.length, before.expenses.length + 1, "memory fallback should remain fully mutable within the active tab");
  assert.equal(writesAfter, writesBefore, "once memory mode is active, later saves and theme changes should not retry localStorage writes");
  assert.deepEqual(runtimeIssues, [], `memory fallback emitted runtime errors:\n${runtimeIssues.join("\n")}`);
  await page.close();
}

async function testResponsiveViews(page) {
  const heights = { 1440: 900, 768: 900, 390: 844 };
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: heights[width], deviceScaleFactor: 1 });
    for (const [view, heading, selector] of views) {
      console.log(`  ${width}px · ${view}`);
      await navigate(page, view, heading, selector);
      const layout = await page.evaluate((activeView) => {
        const rootElement = document.documentElement;
        const isVisible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const overflowers = [...document.body.querySelectorAll("*")]
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.left < -1 || rect.right > rootElement.clientWidth + 1)
          .slice(0, 8)
          .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}[${Math.round(rect.left)},${Math.round(rect.right)}]`);
        const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
        return {
          activeView,
          clientWidth: rootElement.clientWidth,
          scrollWidth: rootElement.scrollWidth,
          overflowers,
          duplicateIds: [...new Set(duplicateIds)],
          mainHeadingCount: document.querySelectorAll("#pageHost h1").length,
          mainHasFocusTarget: document.querySelector("#pageHost")?.getAttribute("tabindex") === "-1",
          mobileNavVisible: isVisible(document.querySelector("#mobileNav")),
          mobileNavItems: document.querySelectorAll("#mobileNav button").length,
          sidebarVisible: isVisible(document.querySelector("#studioSidebar")),
          inputFontSizes: [...document.querySelectorAll("#pageHost input, #pageHost select, #pageHost textarea")]
            .filter(isVisible)
            .map((element) => ({ name: element.name || element.id || element.tagName, size: parseFloat(getComputedStyle(element).fontSize) })),
          shortTargets: [...document.querySelectorAll("#pageHost .btn, #pageHost .icon-btn, #pageHost .segmented button, #mobileNav button")]
            .filter(isVisible)
            .map((element) => ({
              label: element.getAttribute("aria-label") || element.textContent.trim(),
              height: element.getBoundingClientRect().height
            }))
            .filter((item) => item.height < 43.5)
        };
      }, view);
      assert.ok(
        layout.scrollWidth <= layout.clientWidth + 1,
        `${width}px ${view} view should not create page-level horizontal overflow (${layout.scrollWidth}px > ${layout.clientWidth}px): ${layout.overflowers.join(", ")}`
      );
      assert.deepEqual(layout.duplicateIds, [], `${width}px ${view} view should not render duplicate IDs`);
      assert.equal(layout.mainHeadingCount, 1, `${width}px ${view} view should expose one main page heading`);
      assert.equal(layout.mainHasFocusTarget, true, `${width}px ${view} main content should remain programmatically focusable`);
      if (width === 390) {
        assert.equal(layout.mobileNavVisible, true, `${view} should keep mobile navigation visible at 390px`);
        assert.equal(layout.mobileNavItems, 5, `${view} should expose five mobile navigation destinations`);
        assert.equal(layout.inputFontSizes.every((item) => item.size >= 16), true, `390px ${view} inputs should avoid iOS focus zoom: ${JSON.stringify(layout.inputFontSizes)}`);
        assert.deepEqual(layout.shortTargets, [], `390px ${view} should keep primary controls at least 44px tall: ${JSON.stringify(layout.shortTargets)}`);
      }
      if (width === 1440) {
        assert.equal(layout.sidebarVisible, true, `${view} should keep desktop navigation visible at 1440px`);
        assert.equal(layout.mobileNavVisible, false, `${view} should hide mobile navigation at 1440px`);
      }
    }
  }
}

const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const appUrl = `${origin}${appPath}`;
let browser;
let context;

try {
  console.log("Checking piano studio inline JavaScript syntax...");
  assertInlineScriptSyntax();

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--remote-debugging-port=0", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  context = await browser.createBrowserContext();
  const page = await context.newPage();
  const runtimeIssues = watchRuntime(page, origin);

  console.log("Checking normalized Harmony House seed data...");
  await testSeedData(page, appUrl, runtimeIssues);

  console.log("Checking completed lesson, repertoire, and recital immutability...");
  await testCompletedHistoryIsReadOnly(page);

  console.log("Checking cancellation drafts and future-completion history guards...");
  await testLessonDraftAndFutureGuards(page);

  const marker = String(Date.now());
  console.log("Checking student creation and connected lesson completion...");
  const studentId = await createStudent(page, marker);
  await completeStudentLesson(page, studentId);

  console.log("Checking partial and full payment reconciliation...");
  await recordPayments(page, studentId);

  console.log("Checking multi-guardian relationships, sibling reuse, search, and unlink safeguards...");
  await testGuardianRelationships(page, studentId, marker);

  console.log("Checking billing searches and guarded lifecycle selectors...");
  await testBillingSearchAndLifecycleOptions(page);

  console.log("Checking shared guardian isolation across sibling edits...");
  await testSharedPrimaryIsolation(page, marker);

  console.log("Checking deliberate repertoire reactivation and immutable student ownership...");
  await testRepertoireReactivation(page);

  console.log("Checking inquiry, trial, and conversion workflow...");
  await runInquiryToStudent(page, marker);

  console.log("Checking recital order, readiness, and frozen final-program labels...");
  await testRecitalWorkflow(page, marker);

  console.log("Checking expense create, update, and confirmed delete...");
  await testExpenseCrud(page, marker);

  console.log("Checking theme persistence, modal focus trap, and global search focus...");
  await testThemeAndFocus(page);

  console.log("Checking real in-memory fallback when browser storage throws...");
  await testMemoryFallback(context, appUrl, origin);

  console.log("Checking all 11 views at 1440px, 768px, and 390px...");
  await testResponsiveViews(page);

  assert.deepEqual(runtimeIssues, [], `piano studio emitted runtime errors:\n${runtimeIssues.join("\n")}`);
  console.log("Piano studio check passed: seed integrity, lifecycle history, family links, 11-view responsive layout, storage fallback, persistence, and focus behavior.");
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
