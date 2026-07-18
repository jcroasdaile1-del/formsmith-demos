import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const appPath = "/photography-studio/index.html";
const storageKey = "daylight-studio-demo-v1";
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

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

function isoDaysFromNow(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addIsoDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
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
    if (request.url().startsWith(origin)) {
      const errorText = request.failure()?.errorText || "unknown";
      if (errorText !== "net::ERR_ABORTED") issues.push(`request failed: ${request.url()} (${errorText})`);
    }
  });
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      issues.push(`response ${response.status()}: ${response.url()}`);
    }
  });
  return issues;
}

async function setValue(page, selector, value) {
  await page.$eval(selector, (element, nextValue) => {
    element.value = nextValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function selectFirstRealOption(page, selector) {
  await page.$eval(selector, (element) => {
    const option = [...element.options].find((item) => item.value);
    if (!option) throw new Error(`No selectable option found for ${element.name || element.id}`);
    element.value = option.value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function chooseFirst(page, selector) {
  await page.$eval(selector, (element) => {
    element.checked = true;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function readDemoData(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), storageKey);
}

async function waitForView(page, headingText, selector) {
  await page.waitForFunction(
    (text, requiredSelector) => {
      const heading = document.querySelector("#pageHost h1");
      return Boolean(heading?.textContent.includes(text) && document.querySelector(requiredSelector));
    },
    { timeout: 5000 },
    headingText,
    selector
  );
}

async function resetDemo(page, appUrl, hash = "dashboard") {
  await page.goto(`${appUrl}#dashboard`, { waitUntil: "load", timeout: 15000 });
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await page.goto(`${appUrl}?reset=${Date.now()}#${hash}`, { waitUntil: "load", timeout: 15000 });
}

async function openRecordFromSearch(page, query, type) {
  await setValue(page, "#globalSearch", query);
  await page.waitForSelector(`#searchResults.open [data-search-type="${type}"]`);
  await page.click(`#searchResults.open [data-search-type="${type}"]`);
  if (type === "client") await page.waitForSelector(`.client-row[aria-current="true"]`);
  else await page.waitForSelector("#drawer.open");
}

async function fillSessionForm(page, values) {
  await selectFirstRealOption(page, '#sessionForm [name="clientId"]');
  await setValue(page, '#sessionForm [name="title"]', values.title);
  await setValue(page, '#sessionForm [name="sessionType"]', values.sessionType || "Portrait");
  await setValue(page, '#sessionForm [name="status"]', values.status || "Tentative");
  await setValue(page, '#sessionForm [name="date"]', values.date);
  await setValue(page, '#sessionForm [name="startTime"]', values.startTime);
  await setValue(page, '#sessionForm [name="duration"]', String(values.duration));
  await setValue(page, '#sessionForm [name="location"]', values.location || "Regression Studio");
  await setValue(page, '#sessionForm [name="packageName"]', values.packageName || "Regression Collection");
  if (values.deliveryDue !== null) await setValue(page, '#sessionForm [name="deliveryDue"]', values.deliveryDue || addIsoDays(values.date, 14));
}

async function testDashboard(page, appUrl, runtimeIssues) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const response = await page.goto(`${appUrl}#dashboard`, { waitUntil: "load", timeout: 15000 });
  assert.equal(response?.status(), 200, "dashboard should return HTTP 200");
  await waitForView(page, "Good ", ".dashboard-layout");

  const dashboard = await page.evaluate((key) => ({
    title: document.querySelector("#pageHost h1")?.textContent.trim(),
    hasNextShoot: Boolean(document.querySelector(".next-shoot")),
    hasSeededStorage: Boolean(localStorage.getItem(key)),
    desktopMenuHidden: getComputedStyle(document.querySelector('[data-action="toggle-nav"]')).display === "none"
  }), storageKey);
  assert.match(dashboard.title || "", /^Good (morning|afternoon|evening),/, "dashboard greeting should render");
  assert.equal(dashboard.hasNextShoot, true, "dashboard should render the next-shoot card");
  assert.equal(dashboard.hasSeededStorage, true, "dashboard should seed isolated demo storage");
  assert.equal(dashboard.desktopMenuHidden, true, "desktop should not show the mobile sidebar control");
  assert.deepEqual(runtimeIssues, [], `dashboard emitted runtime errors:\n${runtimeIssues.join("\n")}`);
}

async function testPublicInquiryAndBooking(page, appUrl) {
  const testId = Date.now();
  const leadName = `Regression Inquiry ${testId}`;
  const leadEmail = `regression.${testId}@example.com`;
  const preferredDate = isoDaysFromNow(333);
  const shootGoal = "A relaxed regression story with natural movement and warm evening light.";
  const mustHave = "Parents, grandparents, the handwritten vows, and the first dance.";
  const planningNotes = "One grandparent needs seated portraits and step-free access.";

  await page.goto(`${appUrl}?public=inquiry`, { waitUntil: "load", timeout: 15000 });
  await page.waitForSelector("body.public-mode #publicInquiryForm");

  await setValue(page, '[name="sessionType"]', "Wedding");
  await setValue(page, '[name="preferredDate"]', preferredDate);
  await setValue(page, '[name="location"]', "Regression Meadow");
  await selectFirstRealOption(page, '[name="flexibility"]');
  await chooseFirst(page, '[name="participants"]');
  await page.click('[data-action="public-next"]');
  await page.waitForSelector('#publicInquiryForm [name="coveragePriority"]');

  await page.click('[data-action="public-next"]');
  assert.equal(await page.$eval('[data-priority-group]', (element) => element.classList.contains('invalid')), true, "step two should require at least one coverage priority");
  assert.ok(await page.$('#publicInquiryForm [name="coveragePriority"]'), "invalid priority selection should keep the visitor on step two");

  const priorityValues = await page.$$eval('[name="coveragePriority"]', (inputs) => inputs.slice(0, 5).map((input) => input.value));
  for (let index = 0; index < 5; index += 1) {
    await page.$$eval('[name="coveragePriority"]', (inputs, selectedIndex) => {
      const element = inputs[selectedIndex];
      element.checked = true;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, index);
  }
  const priorityState = await page.evaluate(() => ({
    selected: [...document.querySelectorAll('[name="coveragePriority"]:checked')].map((input) => input.value),
    hint: document.querySelector('.selection-hint')?.textContent.trim()
  }));
  assert.equal(priorityState.selected.length, 4, "shoot planning should cap coverage priorities at four");
  assert.equal(priorityState.hint, "4/4 selected", "coverage priority count should update as choices change");
  assert.equal(priorityState.selected.includes(priorityValues[4]), false, "the fifth coverage priority should be rejected");

  await setValue(page, '[name="shootGoal"]', shootGoal);
  await setValue(page, '[name="mustHave"]', mustHave);
  await setValue(page, '[name="planningNotes"]', planningNotes);
  await page.click('[data-action="public-back"]');
  await page.waitForSelector('#publicInquiryForm [name="sessionType"]');
  const restoredStepOne = await page.$eval('#publicInquiryForm', (form) => ({
    sessionType: form.elements.sessionType.value,
    date: form.elements.preferredDate.value,
    location: form.elements.location.value
  }));
  assert.deepEqual(restoredStepOne, { sessionType: "Wedding", date: preferredDate, location: "Regression Meadow" }, "going back should preserve the session details");
  await page.click('[data-action="public-next"]');
  await page.waitForSelector('#publicInquiryForm [name="coveragePriority"]');
  const restoredStepTwo = await page.$eval('#publicInquiryForm', (form) => ({
    selected: [...form.querySelectorAll('[name="coveragePriority"]:checked')].map((input) => input.value),
    shootGoal: form.elements.shootGoal.value,
    mustHave: form.elements.mustHave.value,
    planningNotes: form.elements.planningNotes.value
  }));
  assert.deepEqual(restoredStepTwo.selected, priorityState.selected, "going back should preserve coverage priorities");
  assert.equal(restoredStepTwo.shootGoal, shootGoal, "going back should preserve the shoot goal");
  assert.equal(restoredStepTwo.mustHave, mustHave, "going back should preserve must-have details");
  assert.equal(restoredStepTwo.planningNotes, planningNotes, "going back should preserve planning considerations");
  await page.click('[data-action="public-next"]');
  await page.waitForSelector('#publicInquiryForm [name="email"]');

  await setValue(page, '[name="name"]', "   ");
  await setValue(page, '[name="email"]', leadEmail);
  await setValue(page, '[name="preferredContact"]', "Email");
  await selectFirstRealOption(page, '[name="budget"]');
  await selectFirstRealOption(page, '[name="source"]');
  await chooseFirst(page, '[name="consent"]');
  await page.click('#publicInquiryForm button[type="submit"]');
  assert.ok(await page.$('#publicInquiryForm [name="name"]'), "whitespace-only required text should not submit the inquiry");
  assert.ok(await page.$eval('[name="name"]', (element) => element.validationMessage.length > 0), "whitespace-only name should expose a validation message");

  await setValue(page, '[name="name"]', leadName);
  await setValue(page, '[name="preferredContact"]', "Text");
  await setValue(page, '[name="phone"]', "");
  await page.click('#publicInquiryForm button[type="submit"]');
  assert.ok(await page.$('#publicInquiryForm [name="phone"]'), "text preference without a phone number should not submit");
  assert.match(await page.$eval('[name="phone"]', (element) => element.validationMessage), /phone number/i, "phone validation should explain why the field is required");

  await setValue(page, '[name="phone"]', "(608) 555-0199");
  await page.click('#publicInquiryForm button[type="submit"]');
  await page.waitForSelector(".success-state");

  let data = await readDemoData(page);
  const submittedLead = data?.leads?.find((lead) => lead.email === leadEmail);
  assert.ok(submittedLead, "public inquiry should create a persisted lead");
  assert.equal(submittedLead.status, "New", "public inquiry should enter the New pipeline stage");
  assert.equal(submittedLead.name, leadName, "persisted lead should keep the submitted name");
  assert.equal(submittedLead.preferredDate, preferredDate, "persisted lead should keep the requested date");
  assert.deepEqual(submittedLead.coveragePriorities, priorityState.selected, "persisted lead should keep coverage priorities");
  assert.equal(submittedLead.shootGoal, shootGoal, "persisted lead should keep the shoot goal");
  assert.equal(submittedLead.mustHave, mustHave, "persisted lead should keep must-have details");
  assert.equal(submittedLead.planningNotes, planningNotes, "persisted lead should keep planning considerations");

  await page.goto(`${appUrl}#leads`, { waitUntil: "load", timeout: 15000 });
  await waitForView(page, "Turn interest into stories.", ".pipeline");
  await page.waitForFunction(
    (leadId) => Boolean([...document.querySelectorAll("[data-lead]")].find((element) => element.dataset.lead === leadId)),
    { timeout: 5000 },
    submittedLead.id
  );
  await page.evaluate((leadId) => {
    [...document.querySelectorAll("[data-lead]")].find((element) => element.dataset.lead === leadId)?.click();
  }, submittedLead.id);
  await page.waitForFunction(
    (name) => document.querySelector("#drawer.open")?.textContent.includes(name),
    { timeout: 5000 },
    leadName
  );

  const bookButton = await page.$(`#drawer.open .drawer-footer [data-action="book-lead"][data-id="${submittedLead.id}"]`);
  assert.ok(bookButton, "lead drawer should expose the booking action");
  assert.equal(await bookButton.evaluate((element) => element.disabled), false, "new lead booking action should be enabled");
  await page.waitForFunction((leadId) => {
    const button = document.querySelector(`#drawer.open .drawer-footer [data-action="book-lead"][data-id="${CSS.escape(leadId)}"]`);
    const rect = button?.getBoundingClientRect();
    return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0);
  }, { timeout: 3000 }, submittedLead.id);
  await page.$eval(`#drawer.open .drawer-footer [data-action="book-lead"][data-id="${submittedLead.id}"]`, (button) => button.click());
  await page.waitForSelector("#modalRoot.open #sessionForm");

  const bookingDefaults = await page.$eval("#sessionForm", (form) => ({
    leadId: form.elements.leadId.value,
    clientId: form.elements.clientId.value,
    title: form.elements.title.value,
    date: form.elements.date.value,
    creativeBrief: form.elements.creativeBrief.value,
    shotNotes: form.elements.shotNotes.value
  }));
  assert.equal(bookingDefaults.leadId, submittedLead.id, "booking flow should remain linked to the lead");
  assert.equal(bookingDefaults.clientId, "__from_lead__", "booking flow should offer to create a linked client");
  assert.match(bookingDefaults.title, new RegExp(leadName), "booking title should be prefilled from the lead");
  assert.equal(bookingDefaults.date, preferredDate, "booking date should be prefilled from the inquiry");
  assert.match(bookingDefaults.creativeBrief, new RegExp(shootGoal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "booking brief should include the client's shoot goal");
  for (const priority of priorityState.selected) assert.match(bookingDefaults.creativeBrief, new RegExp(priority.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "booking brief should include each coverage priority");
  assert.match(bookingDefaults.shotNotes, /Must photograph:/, "booking notes should label must-have details");
  assert.match(bookingDefaults.shotNotes, /Plan around:/, "booking notes should label planning considerations");
  assert.match(bookingDefaults.shotNotes, new RegExp(planningNotes.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "booking notes should carry planning considerations forward");

  await setValue(page, '#sessionForm [name="packageName"]', "Regression Story Collection");
  await setValue(page, '#sessionForm [name="totalFee"]', "1800");
  await page.click('button[type="submit"][form="sessionForm"]');
  await waitForView(page, "Plan around the light.", ".calendar-shell");

  await page.waitForFunction(
    (key, leadId) => {
      const stored = JSON.parse(localStorage.getItem(key) || "null");
      return stored?.leads?.find((lead) => lead.id === leadId)?.status === "Booked";
    },
    { timeout: 5000 },
    storageKey,
    submittedLead.id
  );
  data = await readDemoData(page);
  const bookedLead = data.leads.find((lead) => lead.id === submittedLead.id);
  const linkedClient = data.clients.find((client) => client.id === bookedLead.clientId);
  const linkedSession = data.sessions.find((session) => session.leadId === bookedLead.id);
  assert.equal(bookedLead.status, "Booked", "booking should move the inquiry to Booked");
  assert.equal(linkedClient?.email, leadEmail, "booking should create and link the client record");
  assert.equal(linkedSession?.clientId, linkedClient?.id, "booking should create a session linked to that client");
  assert.equal(linkedSession?.packageName, "Regression Story Collection", "booking should persist session details");
  assert.match(linkedClient?.notes || "", new RegExp(planningNotes.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "new client notes should retain planning considerations");
  assert.equal(linkedSession?.readiness?.questionnaire, true, "converted booking should mark the questionnaire complete");
  assert.equal(linkedSession?.readiness?.shotList, true, "converted booking should recognize the prefilled shoot notes");
}

async function testReleaseInvariants(page, appUrl) {
  await resetDemo(page, appUrl, "leads");
  await waitForView(page, "Turn interest into stories.", ".pipeline");

  await page.evaluate(() => document.querySelector('[data-lead="l-thompson"]')?.click());
  await page.waitForSelector('#drawer.open .drawer-body [data-action="edit-lead"]');
  await page.$eval('#drawer.open .drawer-body [data-action="edit-lead"]', (button) => button.click());
  await page.waitForSelector("#modalRoot.open #leadForm");
  const seedLeadForm = await page.$eval("#leadForm", (form) => {
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    return {
      valid: form.checkValidity(),
      budget: form.elements.budget.value,
      hasBookedOption: [...form.elements.status.options].some((option) => option.value === "Booked"),
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index)
    };
  });
  assert.equal(seedLeadForm.valid, true, "every seeded inquiry should open in a valid editor state");
  assert.equal(seedLeadForm.budget, "$4,000–$6,000", "legacy/custom investment ranges should remain editable");
  assert.equal(seedLeadForm.hasBookedOption, false, "an unconverted inquiry cannot be marked Booked from the editor");
  assert.deepEqual(seedLeadForm.duplicateIds, [], "opening a modal must not create duplicate control IDs");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#modalRoot")?.classList.contains("open"));

  await page.evaluate(() => document.querySelector('[data-lead="l-ellis"]')?.click());
  await page.waitForSelector("#drawer.open");
  const linkedLead = await page.$eval("#drawer", (drawer) => ({
    statuses: [...drawer.querySelector('[data-change="lead-status"]').options].map((option) => option.value),
    opensBooking: Boolean(drawer.querySelector('[data-action="open-linked-session"]')),
    createsBooking: Boolean(drawer.querySelector('[data-action="book-lead"]'))
  }));
  assert.deepEqual(linkedLead.statuses, ["Booked", "Closed"], "a linked inquiry should keep its booking lifecycle intact");
  assert.equal(linkedLead.opensBooking, true, "a linked inquiry should open its existing booking");
  assert.equal(linkedLead.createsBooking, false, "a linked inquiry should not offer a duplicate booking");
  await page.$eval('#drawer.open .drawer-body [data-action="edit-lead"]', (button) => button.click());
  await page.waitForSelector("#leadForm");
  assert.deepEqual(await page.$eval('#leadForm [name="status"]', (select) => [...select.options].filter((option) => option.value).map((option) => option.value)), ["Booked", "Closed"], "linked inquiry editor should only offer Booked or Closed");
  await page.keyboard.press("Escape");

  await page.click('.sidebar [data-view="settings"]');
  await waitForView(page, "Make Daylight yours.", 'form[data-form="settings"]');
  const originalSettings = (await readDemoData(page)).settings;
  await setValue(page, '[name="studioName"]', "Northlight House Photography");
  await setValue(page, '[name="ownerName"]', "Riley Hart");
  await setValue(page, '[name="sessionTypes"]', "   ");
  await page.click('form[data-form="settings"] button[type="submit"]');
  assert.ok(await page.$('form[data-form="settings"]'), "blank session types should keep the settings form open");
  assert.deepEqual((await readDemoData(page)).settings.sessionTypes, originalSettings.sessionTypes, "blank session types must not brick scheduling");
  await setValue(page, '[name="sessionTypes"]', "Portrait, Portrait, Elopement");
  await page.click('form[data-form="settings"] button[type="submit"]');
  await page.waitForFunction(() => document.querySelector("#studioBrandName")?.textContent === "Northlight House Photography");
  let data = await readDemoData(page);
  assert.deepEqual(data.settings.sessionTypes, ["Portrait", "Elopement"], "settings should persist a unique non-empty session-type list");
  assert.equal(await page.$eval("#studioOwnerName", (element) => element.textContent), "Riley Hart", "owner identity should update in the workspace");
  await page.goto(`${appUrl}?public=inquiry`, { waitUntil: "load", timeout: 15000 });
  assert.equal(await page.$eval(".public-brand strong", (element) => element.textContent), "Northlight House Photography", "studio identity should carry into the public form");

  await resetDemo(page, appUrl, "dashboard");
  await waitForView(page, "Good ", ".dashboard-layout");
  await openRecordFromSearch(page, "Autumn launch", "session");
  await page.$eval('#drawer.open .drawer-footer [data-action="edit-session"]', (button) => button.click());
  await page.waitForSelector("#sessionForm");
  await setValue(page, '#sessionForm [name="status"]', "Confirmed");
  await setValue(page, '#sessionForm [name="depositStatus"]', "Paid");
  await page.click('button[type="submit"][form="sessionForm"]');
  await page.waitForFunction(() => !document.querySelector("#modalRoot")?.classList.contains("open"));
  data = await readDemoData(page);
  const reconciled = data.sessions.find((session) => session.id === "s-bennett-q3");
  assert.equal(reconciled.readiness.confirmation, true, "Confirmed status should reconcile confirmation readiness");
  assert.equal(reconciled.readiness.retainer, true, "Paid retainer should reconcile retainer readiness");

  await openRecordFromSearch(page, "Timeline call", "session");
  await page.$eval('#drawer.open .drawer-footer [data-action="edit-session"]', (button) => button.click());
  await page.waitForSelector("#sessionForm");
  assert.equal(await page.$eval('#sessionForm [name="deliveryDue"]', (input) => input.value), "", "editing a session without a gallery due date must preserve the blank value");
  await page.click('button[type="submit"][form="sessionForm"]');
  await page.waitForFunction(() => !document.querySelector("#modalRoot")?.classList.contains("open"));
  assert.equal((await readDemoData(page)).sessions.find((session) => session.id === "s-rivera-consult").deliveryDue, null, "saving an unrelated edit must not invent a gallery due date");

  const lateDate = isoDaysFromNow(200);
  const afterMidnight = isoDaysFromNow(201);
  await page.click('#pageHost [data-action="new-session"]');
  await page.waitForSelector("#sessionForm");
  await fillSessionForm(page, { title: "Regression late event", date: lateDate, startTime: "23:30", duration: 120 });
  await page.click('button[type="submit"][form="sessionForm"]');
  await page.waitForFunction(() => !document.querySelector("#modalRoot")?.classList.contains("open"));

  await page.click('#pageHost [data-action="new-session"]');
  await page.waitForSelector("#sessionForm");
  await fillSessionForm(page, { title: "Regression midnight overlap", date: afterMidnight, startTime: "00:15", duration: 60 });
  assert.equal(await page.$eval("#conflictAlert", (element) => element.classList.contains("show")), true, "cross-midnight overlaps should be detected");
  assert.match(await page.$eval("#conflictText", (element) => element.textContent), /Regression late event/, "conflict feedback should name the overlapping session");
  const beforeBlockedSave = (await readDemoData(page)).sessions.length;
  await page.click('button[type="submit"][form="sessionForm"]');
  assert.equal((await readDemoData(page)).sessions.length, beforeBlockedSave, "conflicting session should not save without explicit approval");
  await chooseFirst(page, '#sessionForm [name="allowConflict"]');
  await page.click('button[type="submit"][form="sessionForm"]');
  await page.waitForFunction(() => !document.querySelector("#modalRoot")?.classList.contains("open"));
  assert.equal((await readDemoData(page)).sessions.length, beforeBlockedSave + 1, "explicit conflict approval should allow the session to save");

  await page.click('#pageHost [data-action="new-session"]');
  await page.waitForSelector("#sessionForm");
  const futureDate = isoDaysFromNow(250);
  await fillSessionForm(page, { title: "Regression future rules", date: futureDate, startTime: "17:00", duration: 60, status: "Completed" });
  assert.match(await page.$eval('#sessionForm [name="status"]', (element) => element.validationMessage), /scheduled end time/i, "future sessions cannot be completed");
  await setValue(page, '#sessionForm [name="status"]', "Tentative");
  await setValue(page, '#sessionForm [name="deliveryDue"]', isoDaysFromNow(249));
  assert.ok(await page.$eval('#sessionForm [name="deliveryDue"]', (element) => element.validationMessage.length > 0), "gallery due date cannot precede the shoot");
  await setValue(page, '#sessionForm [name="deliveryDue"]', isoDaysFromNow(264));
  await setValue(page, '#sessionForm [name="deliveryStatus"]', "Editing");
  assert.match(await page.$eval('#sessionForm [name="deliveryStatus"]', (element) => element.validationMessage), /before the shoot has ended/i, "editing cannot begin before a future shoot");
  await setValue(page, '#sessionForm [name="deliveryStatus"]', "Not started");
  await page.keyboard.press("Escape");

  await openRecordFromSearch(page, "Maya & Jordan · Engagement", "session");
  await page.$eval('#drawer.open .drawer-footer [data-action="edit-session"]', (button) => button.click());
  await setValue(page, '#sessionForm [name="status"]', "Cancelled");
  await page.click('button[type="submit"][form="sessionForm"]');
  await page.waitForFunction(() => !document.querySelector("#modalRoot")?.classList.contains("open"));
  data = await readDemoData(page);
  const cancelledLead = data.leads.find((lead) => lead.id === "l-ellis");
  assert.equal(cancelledLead.status, "Proposal", "cancelling the only linked session should reopen the inquiry for rebooking");
  assert.equal(cancelledLead.clientId, "c-ellis", "cancellation should retain the client relationship");

  await page.click('#pageHost [data-action="new-session"]');
  await page.waitForSelector("#sessionForm");
  await page.waitForFunction(() => document.querySelector("#modalRoot")?.contains(document.activeElement));
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  assert.equal(await page.evaluate(() => document.querySelector("#modalRoot").contains(document.activeElement)), true, "Shift+Tab should remain trapped in the dialog");
  await page.keyboard.press("Escape");
  assert.notEqual(await page.evaluate(() => document.activeElement === document.body), true, "closing a dialog should restore deterministic focus");

  await page.click('.sidebar [data-view="settings"]');
  await page.click('.demo-ribbon [data-action="reset"]');
  await page.waitForSelector('#modalRoot.open [role="alertdialog"]');
  const alertDialog = await page.$eval('[role="alertdialog"]', (dialog) => ({
    name: document.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent,
    description: document.getElementById(dialog.getAttribute("aria-describedby"))?.textContent
  }));
  assert.equal(alertDialog.name, "Reset the Daylight demo?", "reset confirmation should have an accessible name");
  assert.match(alertDialog.description || "", /replaces all changes/i, "reset confirmation should have an accessible description");
  await page.click('[data-action="confirm-no"]');

  await setValue(page, "#globalSearch", "Maya");
  assert.equal(await page.$eval("#globalSearch", (input) => input.getAttribute("aria-expanded")), "true", "global search should expose its expanded state");
  await page.focus("#globalSearch");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("search-result")), true, "ArrowDown should enter global search results");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "globalSearch", "Escape should return focus to global search");
  assert.equal(await page.$eval("#globalSearch", (input) => input.getAttribute("aria-expanded")), "false", "Escape should collapse global search semantics");
}

async function testMobile(page, appUrl) {
  await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${appUrl}?check=mobile#dashboard`, { waitUntil: "load", timeout: 15000 });
  await waitForView(page, "Good ", ".dashboard-layout");

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const mobileNav = document.querySelector(".mobile-nav");
    const menuButton = document.querySelector('[data-action="toggle-nav"]');
    const sidebar = document.querySelector("#studioSidebar");
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const overflowers = [...document.body.querySelectorAll("*")]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -1 || rect.right > root.clientWidth + 1)
      .slice(0, 5)
      .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}[${Math.round(rect.left)},${Math.round(rect.right)}]`);
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowers,
      mobileNavVisible: isVisible(mobileNav),
      mobileNavItems: mobileNav?.querySelectorAll("button").length || 0,
      mobileNavRect: mobileNav ? {
        top: mobileNav.getBoundingClientRect().top,
        bottom: mobileNav.getBoundingClientRect().bottom
      } : null,
      mobileNavButtonsVisible: mobileNav ? [...mobileNav.querySelectorAll("button")].every(isVisible) : false,
      mobileNavButtonsReachable: mobileNav ? [...mobileNav.querySelectorAll("button")].every((button) => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit === button || button.contains(hit);
      }) : false,
      menuVisible: isVisible(menuButton),
      menuExpanded: menuButton?.getAttribute("aria-expanded"),
      sidebarInert: sidebar?.inert,
      sidebarHidden: sidebar?.getAttribute("aria-hidden")
    };
  });
  assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `360px layout has document-level horizontal overflow (${layout.scrollWidth}px > ${layout.clientWidth}px): ${layout.overflowers.join(", ")}`);
  assert.equal(layout.mobileNavVisible, true, "360px layout should show the mobile navigation");
  assert.ok(layout.mobileNavItems >= 5, "mobile navigation should expose the primary studio views");
  assert.ok(layout.mobileNavRect?.top >= 0 && layout.mobileNavRect?.bottom <= 801, "mobile navigation should remain inside the 360x800 viewport");
  assert.equal(layout.mobileNavButtonsVisible, true, "every mobile navigation action should be visibly rendered");
  assert.equal(layout.mobileNavButtonsReachable, true, "closed drawers must not cover the mobile navigation actions");
  assert.equal(layout.menuVisible, true, "360px layout should show the sidebar menu control");
  assert.equal(layout.menuExpanded, "false", "closed mobile navigation should expose aria-expanded=false");
  assert.equal(layout.sidebarInert, true, "off-screen mobile sidebar controls should be removed from the tab order");
  assert.equal(layout.sidebarHidden, "true", "closed mobile sidebar should be hidden from assistive technology");

  await page.click('[data-action="toggle-nav"]');
  await page.waitForFunction(() => document.body.classList.contains("nav-open"), { timeout: 3000 });
  await page.waitForFunction(() => {
    const element = document.querySelector(".sidebar");
    const rect = element?.getBoundingClientRect();
    return Boolean(element && getComputedStyle(element).visibility !== "hidden" && rect.right > 0 && rect.width > 0);
  }, { timeout: 3000 });
  assert.equal(await page.$eval('[data-action="toggle-nav"]', (button) => button.getAttribute("aria-expanded")), "true", "open mobile navigation should expose aria-expanded=true");
  assert.equal(await page.$eval("#studioSidebar", (sidebar) => sidebar.inert), false, "open mobile sidebar should restore keyboard access");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.body.classList.contains("nav-open"));

  const viewNames = ["dashboard", "leads", "calendar", "clients", "deliveries", "inquiry", "settings"];
  const heights = { 320: 568, 360: 800, 390: 844, 430: 932 };
  for (const width of [320, 360, 390, 430]) {
    await page.setViewport({ width, height: heights[width], deviceScaleFactor: 1 });
    for (const view of viewNames) {
      await page.evaluate((nextView) => { location.hash = nextView; }, view);
      await page.waitForFunction((nextView) => location.hash === `#${nextView}` && [...document.querySelectorAll('.sidebar [data-view][aria-current="page"]')].some((button) => button.dataset.view === nextView) && Boolean(document.querySelector("#pageHost .page")), {}, view);
      const metrics = await page.evaluate((activeView) => {
        const root = document.documentElement;
        const visible = (element) => element && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden" && element.getBoundingClientRect().width > 0;
        const undersized = [...document.querySelectorAll("#pageHost .btn, #pageHost .icon-btn, #pageHost .filter-btn")]
          .filter(visible)
          .map((element) => ({ text: element.getAttribute("aria-label") || element.textContent.trim(), height: element.getBoundingClientRect().height }))
          .filter((item) => item.height < 43.5);
        const avatar = document.querySelector(".client-row .client-avatar");
        const input = document.querySelector("#pageHost .field input, #pageHost .field select, #pageHost .field textarea, #leadSearch, #clientSearch");
        const calendarGuide = document.querySelector(".calendar-nav > .light-chip");
        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          undersized,
          inputFontSize: input ? parseFloat(getComputedStyle(input).fontSize) : null,
          avatar: avatar ? { display: getComputedStyle(avatar).display, color: getComputedStyle(avatar).color, placeItems: getComputedStyle(avatar).placeItems } : null,
          calendarGuideVisible: visible(calendarGuide),
          activeView
        };
      }, view);
      assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${width}px ${view} view should not create document-level horizontal overflow`);
      assert.deepEqual(metrics.undersized, [], `${width}px ${view} view has undersized primary tap targets: ${JSON.stringify(metrics.undersized)}`);
      if (metrics.inputFontSize !== null) assert.ok(metrics.inputFontSize >= 16, `${width}px ${view} inputs should avoid iOS focus zoom`);
      if (view === "calendar") assert.equal(metrics.calendarGuideVisible, false, `${width}px calendar should hide the clipped light-guidance chip`);
      if (view === "clients" && metrics.avatar) {
        assert.equal(metrics.avatar.display, "grid", `${width}px client avatars should remain centered grids`);
        assert.match(metrics.avatar.color, /rgb\(255, 255, 255\)/, `${width}px client avatar initials should remain white`);
      }
    }
  }

  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
  await page.goto(`${appUrl}?public=inquiry&check=mobile-public`, { waitUntil: "load", timeout: 15000 });
  await page.waitForSelector("#publicInquiryForm");
  const assertPublicMobile = async (step) => {
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const visible = (element) => element && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden" && element.getBoundingClientRect().width > 0;
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        inputSizes: [...document.querySelectorAll(".field input, .field select, .field textarea")].filter(visible).map((element) => parseFloat(getComputedStyle(element).fontSize)),
        shortTargets: [...document.querySelectorAll(".public-form-side .btn, .public-form-side .back-studio, .public-form-side .choice label")].filter(visible).map((element) => element.getBoundingClientRect().height).filter((height) => height < 43.5),
        heroHeight: document.querySelector(".public-image")?.getBoundingClientRect().height
      };
    });
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `320px public inquiry step ${step} should not overflow horizontally`);
    assert.ok(metrics.inputSizes.every((size) => size >= 16), `320px public inquiry step ${step} should use iOS-safe input sizing`);
    assert.deepEqual(metrics.shortTargets, [], `320px public inquiry step ${step} should use 44px tap targets`);
    if (step === 1) assert.ok(metrics.heroHeight <= 260, "short phone view should keep the editorial hero compact enough to reveal the form");
  };
  await assertPublicMobile(1);
  await setValue(page, '[name="sessionType"]', "Wedding");
  await setValue(page, '[name="preferredDate"]', isoDaysFromNow(300));
  await setValue(page, '[name="location"]', "Mobile Meadow");
  await selectFirstRealOption(page, '[name="flexibility"]');
  await chooseFirst(page, '[name="participants"]');
  await page.click('[data-action="public-next"]');
  await page.waitForSelector('[name="coveragePriority"]');
  await assertPublicMobile(2);
  await chooseFirst(page, '[name="coveragePriority"]');
  await setValue(page, '[name="shootGoal"]', "A complete mobile shoot brief.");
  await setValue(page, '[name="mustHave"]', "The people and moments that matter most.");
  await page.click('[data-action="public-next"]');
  await page.waitForSelector('[name="email"]');
  await assertPublicMobile(3);

  const assertPublicStepStartVisible = async (width) => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const position = await page.evaluate(() => {
      const progress = document.querySelector('.form-progress')?.getBoundingClientRect();
      const heading = document.querySelector('.inquiry-form .form-title');
      const name = document.querySelector('[name="name"]')?.getBoundingClientRect();
      return {
        progressTop: progress?.top,
        progressBottom: progress?.bottom,
        headingTop: heading?.getBoundingClientRect().top,
        nameTop: name?.top,
        viewportHeight: window.innerHeight,
        headingFocused: document.activeElement === heading
      };
    });
    assert.ok(position.progressTop >= 0 && position.progressBottom <= position.viewportHeight, `${width}px step transition should reveal the progress indicator: ${JSON.stringify(position)}`);
    assert.ok(position.headingTop >= 0 && position.headingTop < position.viewportHeight, `${width}px step transition should reveal the new heading: ${JSON.stringify(position)}`);
    assert.ok(position.nameTop >= 0 && position.nameTop < position.viewportHeight, `${width}px step transition should reveal the first required field: ${JSON.stringify(position)}`);
    assert.equal(position.headingFocused, true, `${width}px step transition should move programmatic focus to the new heading`);
  };
  await assertPublicStepStartVisible(320);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.click('[data-action="public-back"]');
  await page.waitForSelector('[name="coveragePriority"]');
  await page.click('[data-action="public-next"]');
  await page.waitForSelector('[name="email"]');
  await assertPublicStepStartVisible(390);
}

async function testDesktopViews(page, appUrl) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${appUrl}?check=desktop#dashboard`, { waitUntil: "load", timeout: 15000 });
  await waitForView(page, "Good ", ".dashboard-layout");

  await page.click('.sidebar [data-view="calendar"]');
  await waitForView(page, "Plan around the light.", ".calendar-shell");
  assert.equal(await page.$$eval(".calendar-grid .calendar-day", (items) => items.length), 42, "desktop calendar should render a six-week grid");

  await page.click('.sidebar [data-view="clients"]');
  await waitForView(page, "People, not records.", ".client-layout");
  const clientView = await page.evaluate(() => ({
    rows: document.querySelectorAll(".client-row").length,
    hasProfile: Boolean(document.querySelector(".client-profile"))
  }));
  assert.ok(clientView.rows > 0, "desktop client view should render client rows");
  assert.equal(clientView.hasProfile, true, "desktop client view should render a selected profile");

  await page.click('.sidebar [data-view="deliveries"]');
  await waitForView(page, "The work after the shutter.", ".delivery-board");
  assert.equal(await page.$$eval(".delivery-column", (items) => items.length), 4, "desktop delivery view should render all four stages");
}

const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const appUrl = `${origin}${appPath}`;
let browser;
let context;

try {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--remote-debugging-port=0", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  context = await browser.createBrowserContext();
  const page = await context.newPage();
  const runtimeIssues = watchRuntime(page, origin);

  await page.goto(appUrl, { waitUntil: "load", timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.goto("about:blank");

  console.log("Checking the photography studio dashboard...");
  await testDashboard(page, appUrl, runtimeIssues);
  console.log("Checking the public inquiry and lead-to-booking workflow...");
  await testPublicInquiryAndBooking(page, appUrl);
  console.log("Checking release-grade data, scheduling, settings, and accessibility invariants...");
  await testReleaseInvariants(page, appUrl);
  console.log("Checking all owner views at 320/360/390/430px plus the full mobile inquiry...");
  await testMobile(page, appUrl);
  console.log("Checking desktop calendar, client, and delivery views...");
  await testDesktopViews(page, appUrl);
  assert.deepEqual(runtimeIssues, [], `photography studio emitted runtime errors:\n${runtimeIssues.join("\n")}`);

  console.log("Photography studio check passed: release invariants, inquiry-to-booking workflow, responsive layout, accessibility, and desktop core views.");
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
