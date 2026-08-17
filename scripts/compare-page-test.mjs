import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("public/index.html");
const compareHtml = read("public/compare.html");
const compareJs = read("public/compare-page.js");
const compareCss = read("public/compare.css");
const worker = read("public/service-worker.js");
const pkg = JSON.parse(read("package.json"));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(pkg.version === "0.7.0-alpha6-web.12", "Compare release must be packaged as web.12.");
assert((index.match(/href="\/compare\.html"/g) || []).length >= 2, "Desktop and mobile dashboard navigation must open the full comparison page.");
assert(index.includes("Actual vs KEMS"), "Dashboard navigation must use the new comparison name.");
assert(index.includes("styles.css?v=alpha6web12") && index.includes("app.js?v=alpha6web12"), "Dashboard shell assets must be cache-busted for web.12.");

for (const marker of [
  "Actual vs KEMS",
  "compare.css?v=alpha6web12",
  "compare-page.js?v=alpha6web12",
  "Compare scenarios",
  "Performance &amp; ROI"
]) assert(compareHtml.includes(marker), `Comparison HTML is missing ${marker}.`);

for (const marker of [
  'const RANGES = new Set(["day", "week", "month", "year", "all"])',
  "/api/analytics?range=",
  "KEMS would have saved",
  "Why KEMS performed differently",
  "Actual vs KEMS totals",
  "Actual grid import",
  "KEMS grid import",
  "System cost, actual ROI and KEMS simulator ROI",
  "simulatorEvidenceAnnualRoi",
  "predictedAnnualSaving",
  "nativePeriod",
  "data.coverage"
]) assert(compareJs.includes(marker), `Comparison logic is missing ${marker}.`);

assert(!/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(compareJs), "Comparison page must remain read-only.");
assert(compareJs.includes("history.replaceState") && compareJs.includes("/compare.html?range="), "Comparison range must be shareable in the URL.");
assert(compareJs.includes("setInterval") && compareJs.includes('state.range === "day"'), "Current-day comparison should refresh while visible.");

for (const marker of [
  ".compare-hero",
  ".compare-insights-grid",
  ".compare-breakdown-grid",
  ".compare-cost-grid",
  ".compare-roi-grid"
]) assert(compareCss.includes(marker), `Comparison CSS is missing ${marker}.`);

for (const marker of [
  '"/compare.html"',
  '"/compare.css?v=alpha6web12"',
  '"/compare-page.js?v=alpha6web12"',
  'cache.put(url.pathname, copy)',
  'caches.match(url.pathname)'
]) assert(worker.includes(marker), `Service worker is missing ${marker}.`);

console.log("Compare page test passed: five periods, read-only actual-vs-KEMS analysis, ROI and PWA routing are present.");
