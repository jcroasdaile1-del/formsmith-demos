import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const output = path.join(root, "portfolio-assets");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  let requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!requestPath || requestPath.endsWith("/")) requestPath += "index.html";
  const file = path.resolve(root, requestPath);
  if ((file !== root && !file.startsWith(`${root}${path.sep}`)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes.get(path.extname(file).toLowerCase()) || "application/octet-stream"
  });
  fs.createReadStream(file).pipe(response);
});

function isoDaysFromNow(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function setValue(page, selector, value) {
  await page.$eval(selector, (element, nextValue) => {
    element.value = nextValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await puppeteer.launch({
    headless: true,
    args: ["--remote-debugging-port=0", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  await page.goto(`${origin}/photography-studio/index.html#dashboard`, { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-view="dashboard"][aria-current="page"]');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, "daylight-dashboard.png"), fullPage: false });

  await page.goto(`${origin}/photography-studio/index.html?public=inquiry&capture=portfolio`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#publicInquiryForm");
  await setValue(page, '[name="sessionType"]', "Wedding");
  await setValue(page, '[name="preferredDate"]', isoDaysFromNow(120));
  await setValue(page, '[name="location"]', "The Conservatory at Olbrich");
  await setValue(page, '[name="flexibility"]', "Date is firm");
  await page.click('[name="participants"]');
  await page.click('[data-action="public-next"]');
  await page.waitForSelector('[name="coveragePriority"]');
  await page.$$eval('[name="coveragePriority"]', (inputs) => inputs.slice(0, 2).forEach((input) => input.click()));
  await setValue(page, '[name="shootGoal"]', "Preserve the unhurried, joyful moments and the people who made the day feel like ours.");
  await setValue(page, '[name="mustHave"]', "Grandparents together, the handwritten vows, and a quiet portrait outside the venue.");
  await setValue(page, '[name="planningNotes"]', "One participant uses a mobility aid; please keep transitions simple and accessible.");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, "daylight-inquiry.png"), fullPage: false });
  await page.close();

  console.log("Captured daylight-dashboard.png and daylight-inquiry.png at 1440x900.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
