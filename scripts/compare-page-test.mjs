import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const index = read("public/index.html");
const compareHtml = read("public/compare.html");
const compareJs = read("public/compare-page.js");
const css = read("public/web21.css") + read("public/web26.css");
const worker = read("public/service-worker.js");
const pkg = JSON.parse(read("package.json"));
const assetVersion = "build1";
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert((index.match(/href="\/compare\.html"/g) || []).length >= 2, "Desktop and mobile Live Data navigation must open Compare");
assert(index.includes(`live-page.js?v=${assetVersion}`), "Live page must use the clean renderer");
assert(!index.includes(`app.js?v=${assetVersion}`) && !index.includes(`web21-live.js?v=${assetVersion}`), "Live page must not load legacy renderers");

for (const marker of [
  `compare.css?v=${assetVersion}`,
  `compare-page.js?v=${assetVersion}`,
  `web21.css?v=${assetVersion}`,
  `web26.css?v=${assetVersion}`,
  "/kems.html",
  "/performance.html",
  "/settings.html",
]) assert(compareHtml.includes(marker), `Comparison HTML missing ${marker}`);
assert(!compareHtml.includes('href="/agile.html"'), "Compare must not navigate to the retired Agile route");
assert(!compareHtml.includes("strategy-comparison.js"), "Compare must have one renderer, not the legacy overlay");

for (const marker of [
  "Live Data",
  "KEMS",
  "Today",
  "Yesterday",
  "Last 7 days",
  "Last 30 days",
  "Year",
  "Rolling 365",
  "All time",
  "Estimated KEMS ROI",
  "Total energy cost",
  "sensor.kems_energy_cost_comparison",
  "electricity_import_cost_pence",
  "electricity_standing_charge_pence",
  "electricity_export_income_pence",
  "supplier_energy_credit_pence",
  "gas_usage_cost_pence",
  "gas_standing_charge_pence",
  "total_energy_cost_pence",
  "Battery wear is excluded",
  "/api/analytics?range=",
]) assert(compareJs.includes(marker), `Unified comparison missing ${marker}`);

for (const retired of ["Battery & Solar", "Full KEMS Agile", "one four-way canonical KEMS renderer"]) {
  assert(!compareJs.includes(retired), `Retired user-facing product remains on Compare: ${retired}`);
}
assert(compareJs.includes('analytics: "year"') && compareJs.includes('analytics: "all"'), "Compare must expose real analytics-backed Year and All time periods");
assert(!/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(compareJs), "Comparison page must remain read-only");

for (const marker of [".web25-strategy-grid", ".web25-cost-chart", ".compare-periods"]) {
  assert(css.includes(marker), `Extended comparison CSS missing ${marker}`);
}
assert(worker.includes('"/compare.html"') && worker.includes(`/compare-page.js?v=${assetVersion}`), "PWA shell must cache Compare");

console.log(`Compare page test passed for ${pkg.version}: Live Data vs KEMS uses one canonical total-energy-cost contract and the canonical /kems.html route without local financial reconstruction.`);
