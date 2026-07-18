import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataSource = fs.readFileSync(path.join(root, "assets/js/site-data.js"), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(dataSource, context, { filename: "site-data.js" });
const data = context.window.FORMSMITH_DATA;
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
  ...(data?.projects || []).map((project) => project.detailPath)
];

const errors = [];
const titles = new Map();
const productionMode = process.argv.includes("--production");

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

function localTargetExists(page, target) {
  let clean = target.split("#")[0].split("?")[0];
  if (!clean || /^(?:[a-z]+:|\/\/)/i.test(clean)) return true;
  if (clean.startsWith("/formsmith-demos/")) clean = clean.slice("/formsmith-demos/".length);
  let candidate = path.resolve(root, path.dirname(page), clean);
  if (clean.endsWith("/")) candidate = path.join(candidate, "index.html");
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) candidate = path.join(candidate, "index.html");
  return fs.existsSync(candidate);
}

for (const page of pages) {
  const fullPath = path.join(root, page);
  if (!fs.existsSync(fullPath)) {
    fail(page, "missing page");
    continue;
  }
  const html = fs.readFileSync(fullPath, "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (!title) fail(page, "missing title");
  else if (titles.has(title)) fail(page, `duplicates title used by ${titles.get(title)}`);
  else titles.set(title, page);

  if (page !== "404.html") {
    if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) fail(page, "missing meta description");
    const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
    if (!canonical) fail(page, "missing canonical URL");
    else {
      try {
        const canonicalUrl = new URL(canonical);
        if (canonicalUrl.protocol !== "https:") fail(page, "canonical URL must use HTTPS");
      } catch {
        fail(page, `invalid canonical URL: ${canonical}`);
      }
      if (/YOUR-DOMAIN|REPLACE[_-]?ME/i.test(canonical)) fail(page, "canonical URL still contains a placeholder");
    }
    if (!/<meta\s+property="og:title"\s+content="[^"]+"/i.test(html)) fail(page, "missing Open Graph title");
    if (!/<meta\s+property="og:description"\s+content="[^"]+"/i.test(html)) fail(page, "missing Open Graph description");
    const openGraphUrl = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)?.[1];
    if (!openGraphUrl || /YOUR-DOMAIN|REPLACE[_-]?ME/i.test(openGraphUrl)) fail(page, "missing or placeholder Open Graph URL");
  }
  if (!/<main\b[^>]*id="main-content"/i.test(html)) fail(page, "missing main-content landmark");
  if (!/class="skip-link"[^>]*href="#main-content"/i.test(html)) fail(page, "missing skip link");
  if (!/data-site-header/.test(html)) fail(page, "missing shared header mount");
  if (!/data-site-footer/.test(html)) fail(page, "missing shared footer mount");
  if (/href=["']#["']/i.test(html)) fail(page, "contains an empty placeholder link");

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) fail(page, `duplicate IDs: ${[...new Set(duplicateIds)].join(", ")}`);

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const target = match[1];
    if (!localTargetExists(page, target)) fail(page, `broken local reference: ${target}`);
  }

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt="[^"]*"/i.test(image[0])) fail(page, `image missing alt: ${image[0].slice(0, 80)}`);
    if (!/\bwidth="\d+"/i.test(image[0]) || !/\bheight="\d+"/i.test(image[0])) fail(page, "image missing explicit width or height");
  }

  for (const schema of html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(schema[1]);
    } catch (error) {
      fail(page, `invalid JSON-LD: ${error.message}`);
    }
  }
}

for (const demoFile of fs.readdirSync(root).filter((file) => /-demo\.html$/i.test(file))) {
  const demoHtml = fs.readFileSync(path.join(root, demoFile), "utf8");
  if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(demoHtml)) fail(demoFile, "standalone demo must use noindex");
  if (!/<link\s+rel="canonical"\s+href="https:\/\/[^"]+"/i.test(demoHtml)) fail(demoFile, "standalone demo is missing an HTTPS canonical");
  if (/FormsmithCustomForms|formsmithcustomforms@gmail\.com/i.test(demoHtml)) fail(demoFile, "standalone demo still exposes a legacy sales channel");
}

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
for (const page of pages.filter((item) => item !== "404.html")) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (canonical && !sitemapUrls.has(canonical)) fail("sitemap.xml", `missing canonical URL for ${page}: ${canonical}`);
}
if (/YOUR-DOMAIN|REPLACE[_-]?ME/i.test(sitemap)) fail("sitemap.xml", "contains a placeholder URL");

if (!data) fail("assets/js/site-data.js", "does not define window.FORMSMITH_DATA");
else {
  if (!Array.isArray(data.projects) || data.projects.length < 1) fail("assets/js/site-data.js", "must define at least one project");
  if (data.industries.length !== 11) fail("assets/js/site-data.js", `expected 11 industries, found ${data.industries.length}`);
  if (data.faqs.length < 14) fail("assets/js/site-data.js", `expected at least 14 FAQs, found ${data.faqs.length}`);
  if (!data.faqs.some((faq) => faq.question === "Will I own my business data?" && /^Yes\. You will own your business data\./.test(faq.answer))) {
    fail("assets/js/site-data.js", "business-data ownership FAQ must provide an explicit yes");
  }
  const budgetLabels = data.quoteOptions.budgetRanges.map((option) => option.label);
  if (budgetLabels.some((label) => /\$(?:[6-9],\d{3}|\d{2,},\d{3})/.test(label))) fail("assets/js/site-data.js", "budget range exceeds $5,000");
  for (const project of data.projects) {
    for (const [label, target] of [["detail", project.detailPath], ["demo", project.demo?.url]]) {
      if (target && !localTargetExists("index.html", target)) fail("assets/js/site-data.js", `${project.slug} has broken ${label} path: ${target}`);
    }
    if (project.demo?.url && !/^(?:[a-z]+:|\/\/)/i.test(project.demo.url)) {
      const demoPath = project.demo.url.endsWith("/") ? `${project.demo.url}index.html` : project.demo.url;
      const demoHtml = fs.readFileSync(path.join(root, demoPath), "utf8");
      const detailHtml = fs.readFileSync(path.join(root, project.detailPath), "utf8");
      const detailCanonical = detailHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
      const demoCanonical = demoHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
      if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(demoHtml)) fail(demoPath, "configured demo must use noindex");
      if (!detailCanonical || demoCanonical !== detailCanonical) fail(demoPath, "configured demo canonical must match its project detail page");
      if (/FormsmithCustomForms|formsmithcustomforms@gmail\.com/i.test(demoHtml)) fail(demoPath, "configured demo still exposes a legacy sales channel");
    }
    for (const screenshot of project.screenshots || []) {
      if (!localTargetExists("index.html", screenshot.src)) fail("assets/js/site-data.js", `${project.slug} has broken screenshot path: ${screenshot.src}`);
      if (!screenshot.alt) fail("assets/js/site-data.js", `${project.slug} screenshot is missing alt text`);
      if (!screenshot.width || !screenshot.height) fail("assets/js/site-data.js", `${project.slug} screenshot is missing dimensions`);
    }
  }
}

if (productionMode && data) {
  const contact = data.site.contact;
  if (contact.isPlaceholder || !contact.email || !contact.phoneHref || !contact.facebookMessengerUrl) {
    fail("assets/js/site-data.js", "production mode requires active email, phone, Messenger, and isPlaceholder=false");
  }
  for (const [name, form] of Object.entries(data.site.forms).filter(([name]) => name !== "privacy")) {
    if (form.mode !== "endpoint" || !form.endpoint) fail("assets/js/site-data.js", `production mode requires a configured ${name} endpoint`);
    if (!form.provider || form.provider === "none") fail("assets/js/site-data.js", `production mode requires a named ${name} form provider`);
  }
  if (/REPLACE[_-]?ME|hello@REPLACE-ME|\(000\) 000-0000/i.test(dataSource)) {
    fail("assets/js/site-data.js", "production mode still contains contact placeholders");
  }
  const contactPage = fs.readFileSync(path.join(root, "contact.html"), "utf8");
  if (/once the final contact details .* configured|awaiting configuration/i.test(contactPage)) {
    fail("contact.html", "production mode still contains preview-only contact wording");
  }
  const privacyPage = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
  if (/forms are not connected|may later connect|will be documented when|will be added before|awaiting configuration/i.test(privacyPage)) {
    fail("privacy.html", "production mode requires the final provider, retention, and privacy-contact wording");
  }
}

const quote = fs.readFileSync(path.join(root, "quote.html"), "utf8");
if ((quote.match(/\bdata-form-step\b/g) || []).length !== 5) fail("quote.html", "quote wizard must have exactly 5 form steps");
if ((quote.match(/\bdata-progress-step\b/g) || []).length !== 5) fail("quote.html", "quote wizard must have exactly 5 progress steps");
if (!/name="privacyAgreement"[^>]*required/.test(quote)) fail("quote.html", "privacy agreement is not required");

if (errors.length) {
  console.error(`Site check failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Site check passed${productionMode ? " in production mode" : ""}: ${pages.length} pages, ${data.projects.length} projects, ${data.industries.length} industries, and ${data.faqs.length} FAQs.`);
