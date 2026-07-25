import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(studioDir, "index.html");
const destination = path.join(studioDir, "google-apps-script", "Index.html");

const html = fs.readFileSync(source, "utf8");
if (!html.includes("google.script?.run") || !html.includes("Repository")) {
  throw new Error("The studio UI no longer contains the Apps Script repository adapter.");
}

fs.writeFileSync(destination, html, "utf8");
console.log(`Generated ${path.relative(studioDir, destination)} from index.html (${html.length} characters).`);
