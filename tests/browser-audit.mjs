import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const mountPath = "/formsmith-demos/";
const dataContext = { window: {} };
vm.createContext(dataContext);
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/site-data.js"), "utf8"), dataContext, { filename: "site-data.js" });
const projectData = dataContext.window.FORMSMITH_DATA.projects;
const pages = [
  "index.html",
  "demos.html",
  "portfolio.html",
  "industries.html",
  "pricing.html",
  "about.html",
  "faq.html",
  "contact.html",
  "quote.html",
  "privacy.html",
  "404.html",
  ...projectData.map((project) => project.detailPath)
];

const demoPages = projectData.filter((project) => project.demo?.url && !project.demo.placeholder).map((project) => project.demo.url);

const viewports = [
  { name: "phone-320", width: 320, height: 568 },
  { name: "phone-360", width: 360, height: 800 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-412", width: 412, height: 915 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-820", width: 820, height: 1180 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "reported-1339", width: 1339, height: 871 },
  { name: "desktop-1440", width: 1440, height: 900 }
];

const darkViewports = viewports.filter(({ width }) => [320, 768, 1339].includes(width));
const demoViewports = viewports.filter(({ width }) => [360, 1024, 1440].includes(width));
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

const failures = [];

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let requestPath = decodeURIComponent(url.pathname);
    if (requestPath === mountPath.slice(0, -1)) {
      response.writeHead(302, { Location: mountPath });
      response.end();
      return;
    }
    if (requestPath.startsWith(mountPath)) requestPath = requestPath.slice(mountPath.length);
    else requestPath = requestPath.replace(/^\/+/, "");
    if (!requestPath || requestPath.endsWith("/")) requestPath += "index.html";

    const candidate = path.resolve(root, requestPath);
    if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    let file = candidate;
    let status = 200;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(root, "404.html");
      status = 404;
    }
    const type = mimeTypes.get(path.extname(file).toLowerCase()) || "application/octet-stream";
    response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
}

async function settlePage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll("img[loading='lazy']").forEach((image) => { image.loading = "eager"; });
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await new Promise((resolve) => setTimeout(resolve, 35));
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function inspectPage(page, scope, viewport) {
  const result = await page.evaluate(({ width }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && !element.closest("[hidden]") && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const overlaps = (first, second) => first.left < second.right - 1 && first.right > second.left + 1 && first.top < second.bottom - 1 && first.bottom > second.top + 1;
    const issues = [];
    const rootElement = document.documentElement;
    if (rootElement.scrollWidth > rootElement.clientWidth + 1) issues.push(`horizontal overflow ${rootElement.scrollWidth}px > ${rootElement.clientWidth}px`);
    if (!document.querySelector("header.site-header")) issues.push("shared header did not render");
    if (!document.querySelector("footer.site-footer")) issues.push("shared footer did not render");
    if (!document.querySelector("main#main-content")) issues.push("main landmark is missing");

    const headings = [...document.querySelectorAll("h1")].filter(visible);
    if (headings.length !== 1) issues.push(`expected one visible h1, found ${headings.length}`);

    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicateIds.length) issues.push(`duplicate IDs: ${duplicateIds.join(", ")}`);

    const bodyText = document.body.innerText;
    if (/\uFFFD|â(?:€|€¦|€”|€™)|Ã[A-Za-z]/.test(bodyText)) issues.push("visible text contains a likely encoding error");

    const controls = [...document.querySelectorAll("input:not([type='hidden']), select, textarea")].filter(visible);
    for (const control of controls) {
      const name = control.getAttribute("aria-label") || control.getAttribute("aria-labelledby") || control.labels?.length;
      if (!name) issues.push(`form control #${control.id || control.name || control.tagName.toLowerCase()} has no accessible label`);
    }
    for (const control of [...document.querySelectorAll("button, a[href]")].filter(visible)) {
      const name = control.getAttribute("aria-label") || control.getAttribute("aria-labelledby") || control.textContent.trim() || control.querySelector("img[alt]")?.alt;
      if (!name) issues.push(`${control.tagName.toLowerCase()} has no accessible name`);
      const box = rect(control);
      const display = getComputedStyle(control).display;
      if (control.tagName === "BUTTON" && (box.width < 24 || box.height < 24)) issues.push(`button '${String(name).slice(0, 40)}' is smaller than 24px in one dimension`);
      if (display !== "inline" && box.left < -2) issues.push(`${control.tagName.toLowerCase()} '${String(name).slice(0, 40)}' is clipped on the left`);
      if (display !== "inline" && box.right > width + 2) issues.push(`${control.tagName.toLowerCase()} '${String(name).slice(0, 40)}' is clipped on the right`);
    }

    for (const image of [...document.images].filter(visible)) {
      if (image.complete && image.naturalWidth === 0) issues.push(`image failed to load: ${image.getAttribute("src")}`);
    }

    if (width >= 900) {
      for (const heading of [...document.querySelectorAll("main h1, main h2")].filter(visible)) {
        const style = getComputedStyle(heading);
        const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
        const lineCount = Math.round(heading.getBoundingClientRect().height / lineHeight);
        if (lineCount > 5) issues.push(`heading wraps to ${lineCount} lines: '${heading.textContent.trim().slice(0, 70)}'`);
      }
    }

    const contactBottom = document.querySelector(".contact-bottom");
    let contact = null;
    if (contactBottom && visible(contactBottom)) {
      const children = [...contactBottom.children].map(rect);
      contact = {
        grid: getComputedStyle(contactBottom).gridTemplateColumns,
        children,
        headingWidth: contactBottom.querySelector("h2")?.getBoundingClientRect().width || 0,
        overlap: children.some((first, index) => children.slice(index + 1).some((second) => overlaps(first, second)))
      };
      if (contact.overlap) issues.push("contact bottom columns overlap");
      if (width >= 900 && contact.headingWidth < 240) issues.push(`contact bottom heading is crushed to ${Math.round(contact.headingWidth)}px`);
    }

    const externalRelIssues = [...document.querySelectorAll('a[target="_blank"]')]
      .filter((anchor) => !anchor.relList.contains("noopener"))
      .map((anchor) => anchor.href);
    if (externalRelIssues.length) issues.push(`${externalRelIssues.length} new-tab link(s) missing noopener`);

    return { issues, contact };
  }, viewport);

  result.issues.forEach((issue) => fail(scope, issue));
  return result;
}

async function scanLayouts(browser, origin) {
  const contactSnapshots = [];
  for (const colorScheme of ["light", "dark"]) {
    const sizes = colorScheme === "dark" ? darkViewports : viewports;
    for (const viewport of sizes) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: colorScheme },
        { name: "prefers-reduced-motion", value: "reduce" }
      ]);
      const runtimeIssues = [];
      page.on("console", (message) => { if (message.type() === "error") runtimeIssues.push(`console: ${message.text()}`); });
      page.on("pageerror", (error) => runtimeIssues.push(`page error: ${error.message}`));
      page.on("requestfailed", (request) => {
        if (request.url().startsWith(origin)) runtimeIssues.push(`request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
      });

      for (const pagePath of pages) {
        const scope = `${colorScheme}/${viewport.name}/${pagePath}`;
        const response = await page.goto(`${origin}${mountPath}${pagePath}`, { waitUntil: "load", timeout: 15000 });
        if (!response || (response.status() >= 400 && pagePath !== "404.html")) fail(scope, `HTTP status ${response?.status() || "missing"}`);
        await settlePage(page);
        const result = await inspectPage(page, scope, viewport);
        if (pagePath === "contact.html") contactSnapshots.push({ colorScheme, viewport: viewport.name, ...result.contact });
        runtimeIssues.splice(0).forEach((issue) => fail(scope, issue));
      }
      await page.close();
    }
  }
  return contactSnapshots;
}

async function scanDemos(browser, origin) {
  for (const viewport of demoViewports) {
    for (const demoPath of demoPages) {
      const scope = `demo/${viewport.name}/${demoPath}`;
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      const runtimeIssues = [];
      page.on("console", (message) => {
        const source = message.location().url || "";
        if (message.type() === "error" && !/ERR_NETWORK_ACCESS_DENIED/.test(message.text()) && (!source || source.startsWith(origin))) {
          runtimeIssues.push(`console${source ? ` (${source})` : ""}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => runtimeIssues.push(`page error: ${error.message}`));
      page.on("requestfailed", (request) => {
        if (request.url().startsWith(origin)) runtimeIssues.push(`request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`);
      });
      page.on("response", (response) => {
        if (response.url().startsWith(origin) && response.status() >= 400) runtimeIssues.push(`response ${response.status()}: ${response.url()}`);
      });

      try {
        const response = await page.goto(`${origin}${mountPath}${demoPath}`, { waitUntil: "load", timeout: 20000 });
        if (!response || response.status() >= 400) fail(scope, `HTTP status ${response?.status() || "missing"}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const issues = await page.evaluate(() => {
          const issues = [];
          const rootElement = document.documentElement;
          if (!document.title.trim()) issues.push("document title is empty");
          if (document.body.innerText.trim().length < 100) issues.push("initial interface did not render meaningful content");
          if (rootElement.scrollWidth > rootElement.clientWidth + 2) {
            const overflowers = [...document.body.querySelectorAll("*")]
              .map((element) => ({ element, box: element.getBoundingClientRect() }))
              .filter(({ box }) => box.right > rootElement.clientWidth + 2 || box.left < -2)
              .slice(0, 4)
              .map(({ element, box }) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].join(".")}` : ""}[${Math.round(box.left)},${Math.round(box.right)}]`);
            issues.push(`horizontal overflow ${rootElement.scrollWidth}px > ${rootElement.clientWidth}px${overflowers.length ? ` (${overflowers.join(", ")})` : ""}`);
          }
          if (!document.querySelector('meta[name="robots"][content*="noindex"]')) issues.push("demo is missing its noindex directive");
          const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
          if (!canonical.includes("/projects/")) issues.push("demo canonical does not point to its project detail page");
          const brokenImages = [...document.images].filter((image) => image.complete && image.naturalWidth === 0);
          if (brokenImages.length) issues.push(`${brokenImages.length} image(s) failed to load`);
          if (/\uFFFD|â(?:€|€¦|€”|€™)|Ã[A-Za-z]/.test(document.body.innerText)) issues.push("visible text contains a likely encoding error");
          return issues;
        });
        issues.forEach((issue) => fail(scope, issue));
        runtimeIssues.forEach((issue) => fail(scope, issue));
      } catch (error) {
        fail(scope, `navigation failed: ${error.message}`);
      } finally {
        await page.close();
      }
    }
  }
}

async function testMobileNavigation(browser, origin) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 800 });
  await page.goto(`${origin}${mountPath}index.html`, { waitUntil: "load" });
  const toggle = ".menu-toggle";
  await page.click(toggle);
  if (await page.$eval(toggle, (element) => element.getAttribute("aria-expanded")) !== "true") fail("mobile navigation", "menu did not open");
  if (!(await page.$eval(".primary-nav", (element) => getComputedStyle(element).visibility !== "hidden" && element.getBoundingClientRect().height > 0))) fail("mobile navigation", "open menu is not visible");
  await page.waitForFunction(() => document.activeElement?.closest(".primary-nav") !== null, { timeout: 1000 }).catch(() => {});
  if (!(await page.evaluate(() => document.activeElement?.closest(".primary-nav") !== null))) fail("mobile navigation", "opening the menu did not move focus into navigation");
  await page.keyboard.press("Escape");
  const navState = await page.evaluate((selector) => ({
    expanded: document.querySelector(selector).getAttribute("aria-expanded"),
    focused: document.activeElement === document.querySelector(selector),
    bodyLocked: document.body.classList.contains("menu-is-open")
  }), toggle);
  if (navState.expanded !== "false" || !navState.focused || navState.bodyLocked) fail("mobile navigation", `Escape did not fully close and restore focus (${JSON.stringify(navState)})`);
  await page.click(toggle);
  await page.setViewport({ width: 1024, height: 768 });
  const resized = await page.evaluate((selector) => ({
    expanded: document.querySelector(selector).getAttribute("aria-expanded"),
    mainInert: document.querySelector("main").inert,
    footerInert: document.querySelector("[data-site-footer]").inert
  }), toggle);
  if (resized.expanded !== "false" || resized.mainInert || resized.footerInert) fail("mobile navigation", `desktop resize left the page locked (${JSON.stringify(resized)})`);
  await page.close();
}

async function testBreakpointAndThemeRegressions(browser, origin) {
  const page = await browser.newPage();
  await page.setViewport({ width: 820, height: 1180 });
  await page.goto(`${origin}${mountPath}faq.html`, { waitUntil: "load" });
  const tabletPosition = await page.$eval(".faq-intro-card", (element) => getComputedStyle(element).position);
  if (tabletPosition === "sticky") fail("FAQ breakpoint", "single-column FAQ intro remains sticky at 820px");
  await page.setViewport({ width: 1024, height: 768 });
  const desktopPosition = await page.$eval(".faq-intro-card", (element) => getComputedStyle(element).position);
  if (desktopPosition !== "sticky") fail("FAQ breakpoint", "two-column FAQ intro is not sticky at desktop width");

  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.goto(`${origin}${mountPath}pricing.html`, { waitUntil: "load" });
  const primary = ".page-hero .button:not(.button--ghost)";
  const ghost = ".page-hero .button--ghost";
  await page.hover(primary);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const primaryHover = await page.$eval(primary, (element) => getComputedStyle(element).backgroundColor);
  await page.hover(ghost);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const ghostHover = await page.$eval(ghost, (element) => getComputedStyle(element).backgroundColor);
  if (primaryHover !== "rgb(240, 188, 85)" || ghostHover === primaryHover) {
    fail("dark button variants", `hover styles collapsed across variants (${JSON.stringify({ primaryHover, ghostHover })})`);
  }

  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.goto(`${origin}${mountPath}index.html`, { waitUntil: "load" });
  const darkSectionFocus = await page.$eval(".cta-panel", (element) => getComputedStyle(element).getPropertyValue("--focus").trim());
  if (darkSectionFocus.toLowerCase() !== "#f0bc55") fail("dark section focus", `CTA focus color is ${darkSectionFocus || "unset"}`);
  await page.close();
}

async function testNested404(browser, origin) {
  const page = await browser.newPage();
  const response = await page.goto(`${origin}${mountPath}missing/deep/path`, { waitUntil: "load" });
  const state = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent.trim(),
    header: Boolean(document.querySelector("header.site-header")),
    styled: getComputedStyle(document.body).fontFamily.includes("Segoe UI"),
    home: document.querySelector(".not-found a")?.getAttribute("href"),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  if (response?.status() !== 404 || state.h1 !== "We could not find that page." || !state.header || !state.styled || state.home !== `${mountPath}index.html` || state.overflow) {
    fail("nested 404", `project-root assets or links failed (${JSON.stringify({ status: response?.status(), ...state })})`);
  }
  await page.close();
}

async function testPortfolioFilters(browser, origin) {
  const page = await browser.newPage();
  await page.goto(`${origin}${mountPath}portfolio.html`, { waitUntil: "load" });
  const expected = await page.$$eval(".project-card", (cards) => ({
    all: cards.length,
    "live-demo": cards.filter((card) => card.dataset.projectStatus === "live-demo").length,
    "in-development": cards.filter((card) => card.dataset.projectStatus === "in-development").length
  }));
  for (const [filter, count] of Object.entries(expected)) {
    await page.click(`[data-filter="${filter}"]`);
    const state = await page.evaluate((name) => ({
      visible: [...document.querySelectorAll(".project-card")].filter((card) => !card.hidden).length,
      pressed: document.querySelector(`[data-filter="${name}"]`).getAttribute("aria-pressed")
    }), filter);
    if (state.visible !== count || state.pressed !== "true") fail("portfolio filters", `${filter} returned ${state.visible}/${count} cards with aria-pressed=${state.pressed}`);
  }
  await page.close();
}

async function testDemoOrdering(browser, origin) {
  const page = await browser.newPage();
  await page.goto(`${origin}${mountPath}index.html`, { waitUntil: "load" });
  await page.$$eval('[data-project-grid="home"] img', (images) => Promise.all(images.map(async (image) => {
    image.loading = "eager";
    await image.decode().catch(() => {});
  })));
  const home = await page.$$eval('[data-project-grid="home"] .project-card', (cards) => cards.map((card) => ({
    title: card.querySelector("h3")?.textContent.trim(),
    image: card.querySelector("img")?.getAttribute("src"),
    imageLoaded: Boolean(card.querySelector("img")?.naturalWidth)
  })));
  if (home[0]?.title !== "Photography Studio Manager" || !/portfolio-assets\/daylight-dashboard\.png$/.test(home[0]?.image || "") || !home[0]?.imageLoaded) {
    fail("homepage demo order", `photography app is not the first real-screenshot card (${JSON.stringify(home.slice(0, 2))})`);
  }

  await page.goto(`${origin}${mountPath}demos.html`, { waitUntil: "load" });
  const demos = await page.$$eval('[data-project-grid="demos"] .project-card h3', (headings) => headings.map((heading) => heading.textContent.trim()));
  if (demos[1] !== "Photography Studio Manager") {
    fail("demos page order", `photography app should be second, found ${JSON.stringify(demos.slice(0, 3))}`);
  }
  await page.close();
}

async function testFaqOwnership(browser, origin) {
  const page = await browser.newPage();
  await page.goto(`${origin}${mountPath}faq.html`, { waitUntil: "load" });
  const result = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".faq-item")];
    const ownership = items.find((item) => item.querySelector("summary")?.textContent.includes("own my business data"));
    if (ownership) ownership.open = true;
    return { count: items.length, answer: ownership?.querySelector(".faq-answer")?.textContent.trim() || "" };
  });
  if (result.count < 14) fail("FAQ", `expected at least 14 FAQ items, found ${result.count}`);
  if (!/^Yes\. You will own your business data\./.test(result.answer)) fail("FAQ", `data ownership is not explicit: '${result.answer}'`);
  await page.close();
}

async function testContactForm(browser, origin) {
  const page = await browser.newPage();
  await page.goto(`${origin}${mountPath}contact.html`, { waitUntil: "load" });
  await page.click('[data-contact-form] button[type="submit"]');
  const invalidBefore = await page.$eval("[data-contact-form]", (form) => !form.checkValidity());
  if (!invalidBefore) fail("contact form", "empty required form unexpectedly passed validation");
  await page.type("#contact-name", "Test Person");
  await page.type("#contact-email", "test@example.com");
  await page.select("#contact-subject", "General question");
  await page.type("#contact-message", "This is a complete browser-audit test message.");
  await page.$eval("#contact-privacy-agreement", (input) => input.click());
  await page.click('[data-contact-form] button[type="submit"]');
  const state = await page.evaluate(() => ({
    valid: document.querySelector("[data-contact-form]").checkValidity(),
    status: document.querySelector("[data-form-status]").textContent.trim(),
    development: document.querySelector("[data-form-status]").classList.contains("form-status--development")
  }));
  if (!state.valid || !state.development || !/not sent/i.test(state.status)) fail("contact form", `preview submission did not clearly remain unsent (${JSON.stringify(state)})`);

  let capturedPayload = null;
  let capturedMethod = null;
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.url() === `${origin}/contact-capture`) {
      capturedMethod = request.method();
      capturedPayload = JSON.parse(request.postData() || "{}");
      await request.respond({ status: 200, contentType: "application/json", body: "{}" });
    } else {
      await request.continue();
    }
  });
  await page.evaluate((endpoint) => {
    const config = window.FORMSMITH_DATA.site.forms.contact;
    config.mode = "endpoint";
    config.endpoint = endpoint;
  }, `${origin}/contact-capture`);
  await page.click('[data-contact-form] button[type="submit"]');
  await page.waitForFunction(() => document.querySelector("[data-form-status]").classList.contains("form-status--success"), { timeout: 5000 });
  if (capturedMethod !== "POST" || capturedPayload?.privacyAgreement !== "agreed" || !capturedPayload?.privacyPolicyPath || !capturedPayload?.privacyPolicyVersion || !capturedPayload?.privacyConsentRecordedAt) {
    fail("contact form", `endpoint payload omitted method or consent evidence (${JSON.stringify({ capturedMethod, capturedPayload })})`);
  }
  await page.close();
}

async function testQuoteWizard(browser, origin) {
  const page = await browser.newPage();
  await page.goto(`${origin}${mountPath}quote.html`, { waitUntil: "load" });
  const initialStorage = await page.evaluate(() => localStorage.length);

  const budgetOptions = await page.$$eval("#budget-range option", (items) => items.map((item) => ({ value: item.value, label: item.textContent.trim() })));
  const expectedBudgets = ["Choose a range or leave blank", "I am not sure yet", "Under $1,000", "$1,000-$2,499", "$2,500-$5,000"];
  if (JSON.stringify(budgetOptions.map((item) => item.label)) !== JSON.stringify(expectedBudgets)) fail("quote wizard", `unexpected budget options: ${budgetOptions.map((item) => item.label).join(" | ")}`);
  if (budgetOptions.some((item) => /(?:[6-9]|\d{2,}),?\d{3}/.test(item.label.replace("5,000", "")))) fail("quote wizard", "budget options include a value above $5,000");

  await page.click("[data-next-step]");
  if (await page.$$eval("[data-form-step]", (steps) => steps.findIndex((step) => !step.hidden)) !== 0) fail("quote wizard", "empty first step advanced");

  await page.type("#business-name", "Audit Company");
  await page.type("#contact-name", "Test Person");
  await page.type("#quote-email", "test@example.com");
  await page.type("#business-type", "Equipment rental");
  await page.select("#employee-count", "just-me");
  await page.click('[data-form-step]:not([hidden]) [data-next-step]');

  await page.type("#process-improve", "We currently manage the same workflow across several disconnected tools.");
  await page.$eval('input[name="currentTools"]', (input) => input.click());
  await page.type("#biggest-frustration", "Information is duplicated and updates are easy to miss.");
  await page.select("#process-frequency", "daily");
  await page.click('[data-form-step]:not([hidden]) [data-next-step]');

  await page.$eval('input[name="capabilities"]', (input) => input.click());
  await page.$eval('input[name="mobileNeeded"]', (input) => input.click());
  await page.$eval('input[name="dataImportNeeded"]', (input) => input.click());
  await page.type("#ideal-outcome", "One clear system should keep the workflow current and make the next action obvious.");
  await page.click('[data-form-step]:not([hidden]) [data-next-step]');

  await page.select("#ideal-start", "within-1-month");
  await page.select("#budget-range", "2500-5000");
  const minDate = await page.$eval("#target-date", (input) => input.min);
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  if (minDate !== today) fail("quote wizard", `target-date min ${minDate} does not match ${today}`);
  await page.click('[data-form-step]:not([hidden]) [data-next-step]');

  const review = await page.evaluate(() => ({
    step: [...document.querySelectorAll("[data-form-step]")].findIndex((step) => !step.hidden),
    sections: document.querySelectorAll(".review-section").length,
    text: document.querySelector("[data-review-list]").textContent,
    progress: document.querySelectorAll("[data-progress-step].is-active").length
  }));
  if (review.step !== 4 || review.sections !== 4 || !review.text.includes("$2,500-$5,000") || review.progress !== 1) fail("quote wizard", `review state is incomplete (${JSON.stringify(review)})`);

  await page.click('[data-edit-step="3"]');
  if (await page.$$eval("[data-form-step]", (steps) => steps.findIndex((step) => !step.hidden)) !== 3) fail("quote wizard", "review Edit button did not return to expectations");
  await page.click('[data-form-step]:not([hidden]) [data-next-step]');
  await page.click("[data-submit-quote]");
  const invalidPrivacy = await page.$eval("#privacy-agreement", (input) => !input.checked && !input.validity.valid);
  if (!invalidPrivacy) fail("quote wizard", "privacy agreement is not enforced");
  await page.$eval("#privacy-agreement", (input) => input.click());
  await page.click("[data-submit-quote]");
  const finalState = await page.evaluate(() => ({
    status: document.querySelector("[data-quote-status]").textContent.trim(),
    development: document.querySelector("[data-quote-status]").classList.contains("form-status--development"),
    successHidden: document.querySelector("[data-quote-success]").hidden,
    storage: localStorage.length
  }));
  if (!finalState.development || !/not sent/i.test(finalState.status) || !finalState.successHidden || finalState.storage !== initialStorage) fail("quote wizard", `preview submission state is unsafe (${JSON.stringify({ ...finalState, initialStorage })})`);

  let capturedPayload = null;
  let capturedMethod = null;
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.url() === `${origin}/quote-capture`) {
      capturedMethod = request.method();
      capturedPayload = JSON.parse(request.postData() || "{}");
      await request.respond({ status: 200, contentType: "application/json", body: "{}" });
    } else {
      await request.continue();
    }
  });
  await page.evaluate((endpoint) => {
    const config = window.FORMSMITH_DATA.site.forms.quote;
    config.mode = "endpoint";
    config.endpoint = endpoint;
  }, `${origin}/quote-capture`);
  await page.click("[data-submit-quote]");
  await page.waitForFunction(() => !document.querySelector("[data-quote-success]").hidden, { timeout: 5000 });
  if (capturedMethod !== "POST" || capturedPayload?.privacyAgreement !== "agreed" || !capturedPayload?.privacyPolicyPath || !capturedPayload?.privacyPolicyVersion || !capturedPayload?.privacyConsentRecordedAt) {
    fail("quote wizard", `endpoint payload omitted method or consent evidence (${JSON.stringify({ capturedMethod, capturedPayload })})`);
  }
  await page.close();
}

async function testNoScriptAndPrefix(browser, origin) {
  const page = await browser.newPage();
  await page.setJavaScriptEnabled(false);
  for (const pagePath of ["index.html", "contact.html", "quote.html", "projects/equipment-rental-manager.html"]) {
    const response = await page.goto(`${origin}${mountPath}${pagePath}`, { waitUntil: "load" });
    if (!response || response.status() !== 200) fail("GitHub Pages prefix", `${pagePath} returned ${response?.status() || "no response"}`);
  }
  await page.goto(`${origin}${mountPath}projects/equipment-rental-manager.html`, { waitUntil: "load" });
  const projectFallback = await page.$eval("main", (element) => /Equipment Rental Manager/.test(element.textContent) && Boolean(element.querySelector("h1")));
  if (!projectFallback) fail("no-JavaScript", "project detail fallback is missing its static title and summary");
  await page.goto(`${origin}${mountPath}quote.html`, { waitUntil: "load" });
  const quoteNoScript = await page.$eval(".noscript", (element) => getComputedStyle(element).display !== "none" && /requires JavaScript/i.test(element.textContent));
  const formHidden = await page.$eval("[data-quote-wizard]", (element) => getComputedStyle(element).display === "none");
  if (!quoteNoScript || !formHidden) fail("no-JavaScript", "quote fallback is not visible or the unusable form remains shown");
  await page.close();
}

const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--remote-debugging-port=0", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  console.log("Running responsive light/dark layout sweep…");
  const contactSnapshots = await scanLayouts(browser, origin);
  console.log("Running linked demo application sweep…");
  await scanDemos(browser, origin);
  console.log("Running mobile navigation interaction…");
  await testMobileNavigation(browser, origin);
  console.log("Running breakpoint and theme regression checks…");
  await testBreakpointAndThemeRegressions(browser, origin);
  console.log("Running nested GitHub Pages 404 check…");
  await testNested404(browser, origin);
  console.log("Running homepage and demos ordering checks…");
  await testDemoOrdering(browser, origin);
  console.log("Running portfolio filter interaction…");
  await testPortfolioFilters(browser, origin);
  console.log("Running FAQ ownership check…");
  await testFaqOwnership(browser, origin);
  console.log("Running contact form validation…");
  await testContactForm(browser, origin);
  console.log("Running quote wizard end-to-end…");
  await testQuoteWizard(browser, origin);
  console.log("Running no-JavaScript and GitHub Pages prefix checks…");
  await testNoScriptAndPrefix(browser, origin);

  const screenshotPage = await browser.newPage();
  await screenshotPage.setViewport({ width: 1339, height: 871, deviceScaleFactor: 1 });
  await screenshotPage.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await screenshotPage.goto(`${origin}${mountPath}contact.html`, { waitUntil: "load" });
  const screenshot = path.join(os.tmpdir(), "formsmith-contact-dark-1339.png");
  await screenshotPage.screenshot({ path: screenshot, fullPage: true });
  await screenshotPage.close();

  if (failures.length) {
    console.error(`Browser audit failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
    failures.forEach((issue) => console.error(`- ${issue}`));
    console.error(`Contact screenshot: ${screenshot}`);
    process.exitCode = 1;
  } else {
    console.log(`Browser audit passed ${pages.length} pages across ${viewports.length} light and ${darkViewports.length} dark responsive viewports.`);
    console.log(`Demo smoke tests passed ${demoPages.length} applications across ${demoViewports.length} responsive viewports.`);
    console.log("Interactions passed: navigation, breakpoint/theme regressions, portfolio filters, FAQ ownership, contact form, quote wizard, no-JavaScript fallback, and GitHub Pages subpath.");
    console.log(`Contact layout samples: ${contactSnapshots.map((item) => `${item.colorScheme}/${item.viewport}=${Math.round(item.headingWidth)}px`).join(", ")}`);
    console.log(`Contact screenshot: ${screenshot}`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
