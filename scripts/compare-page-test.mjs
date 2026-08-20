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
const shellAssetVersion = "alpha7web15";
const compareAssetVersion = "alpha7web14";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(pkg.version === "0.7.0-alpha7-web.15", `Compare release must match the current package version, got ${pkg.version}.`);
assert((index.match(/href="\/compare\.html"/g) || []).length >= 2, "Desktop and mobile dashboard navigation must open the comparison page.");
assert(index.includes(">Compare<"), "Dashboard navigation must use the simplified comparison name.");
assert(index.includes(`styles.css?v=${shellAssetVersion}`) && index.includes(`app.js?v=${shellAssetVersion}`), "Dashboard shell assets must match Web.15 cache version.");
assert(index.includes('href="/products.html"'), "Dashboard navigation must include the four-product overview.");
assert(index.includes('href="/agile.html"'), "Dashboard navigation must include Full KEMS Agile.");
assert(index.includes('href="/remote-access.html"'), "Dashboard navigation must include local Remote Access setup.");

for (const marker of [
  "four-product comparison",
  `compare.css?v=${compareAssetVersion}`,
  `compare-page.js?v=${compareAssetVersion}`,
  "/products.html",
  "/agile.html",
  "History &amp; scenarios",
  "Cost &amp; ROI"
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
  '"/products.html"',
  '"/compare.html"',
  `"/compare.css?v=${compareAssetVersion}"`,
  `"/compare-page.js?v=${compareAssetVersion}"`,
  '"/agile.html"',
  '"/remote-access.html"',
  'cache.put(url.pathname, copy)',
  'caches.match(url.pathname)'
]) assert(worker.includes(marker), `Service worker is missing ${marker}.`);

console.log(`Compare page test passed for ${pkg.version}: five periods, read-only analysis, ROI, four-product navigation and Web.15 PWA routing are present.`);
