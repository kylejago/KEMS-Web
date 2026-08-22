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

assert(
  (index.match(/href="\/compare\.html"/g) || []).length >= 2,
  "Desktop and mobile Live Data navigation must open Compare",
);
assert(
  index.includes(`live-page.js?v=${assetVersion}`),
  "Live page must use the clean renderer",
);
assert(
  !index.includes(`app.js?v=${assetVersion}`) &&
    !index.includes(`web21-live.js?v=${assetVersion}`),
  "Live page must not load legacy renderers",
);

for (const marker of [
  `compare.css?v=${assetVersion}`,
  `compare-page.js?v=${assetVersion}`,
  `web21.css?v=${assetVersion}`,
  `web26.css?v=${assetVersion}`,
  "/agile.html",
  "/performance.html",
  "/settings.html",
]) {
  assert(compareHtml.includes(marker), `Comparison HTML missing ${marker}`);
}
assert(
  !compareHtml.includes("strategy-comparison.js"),
  "Compare must have one renderer, not the legacy overlay",
);

for (const marker of [
  "Live Data",
  "Battery & Solar",
  "Full KEMS",
  "Full KEMS Agile",
  "Today",
  "Yesterday",
  "Last 7 days",
  "Last 30 days",
  "Year",
  "All time",
  "Estimated ROI",
  "Net electricity cost",
  "Current leader",
  "sensor.kems_scenario_comparison_today",
  "sensor.kems_agile_smart_export_plan",
  "/api/analytics?range=",
  "KEMS retained period simulation ledger",
  "does not scale",
]) {
  assert(compareJs.includes(marker), `Extended comparison missing ${marker}`);
}
assert(
  compareJs.includes('analytics: "year"') && compareJs.includes('analytics: "all"'),
  "Compare must expose real analytics-backed Year and All time periods",
);
assert(
  !/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(compareJs),
  "Comparison page must remain read-only",
);

for (const marker of [
  ".web25-strategy-grid",
  ".web25-cost-chart",
  ".compare-periods",
]) {
  assert(css.includes(marker), `Extended comparison CSS missing ${marker}`);
}
assert(
  worker.includes('"/compare.html"') &&
    worker.includes(`/compare-page.js?v=${assetVersion}`),
  "PWA shell must cache Compare",
);

console.log(
  `Compare page test passed for ${pkg.version}: one six-period selector and one four-way renderer are present without inventing long-period evidence.`,
);
