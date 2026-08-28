import fs from "node:fs";
import assert from "node:assert/strict";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const project = JSON.parse(fs.readFileSync("config/project.json", "utf8"));
const agile = fs.readFileSync("public/agile-page.js", "utf8");
const agilePanel = fs.readFileSync("public/web21-agile.js", "utf8");
const agileHtml = fs.readFileSync("public/agile.html", "utf8");
const manifest = fs.readFileSync("public/site.webmanifest", "utf8");
const compare = fs.readFileSync("public/compare-page.js", "utf8");
const compareHtml = fs.readFileSync("public/compare.html", "utf8");

assert.equal(project.version, packageJson.version);
assert.match(project.tagline, /actual energy bill|KEMS would have done/i);
for (const marker of [
  "sensor.kems_agile_slots",
  "sensor.kems_energy_cost_comparison",
  "sensor.kems_simulated_grid_import_power",
  "sensor.kems_simulated_grid_export_power",
  "sensor.kems_simulated_battery_export_power",
  "Today's KEMS plan",
  "Tomorrow",
  "History",
  "System & control safety",
  "economic_opportunity_guard",
]) {
  assert.match(agile, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const marker of [
  "today_slots",
  "tomorrow_slots",
  "0, 16",
  "16, 32",
  "32, 48",
  "grid_import_kwh",
  "grid_export_kwh",
  "battery_export_kwh",
  "ending_soc_percent",
]) assert.match(agile, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

for (const id of [
  "sensor.kems_simulated_house_load_power",
  "sensor.kems_simulated_solar_power",
  "sensor.kems_simulated_battery_power",
  "sensor.kems_simulated_battery_state_of_charge",
  "sensor.kems_simulated_grid_import_power",
  "sensor.kems_simulated_grid_export_power",
]) assert.match(agilePanel, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `KEMS panel missing canonical ${id}`);
assert.doesNotMatch(agilePanel, /gridNet\s*=\s*\[home, solar, battery\]/, "KEMS current panel must not reconstruct grid routing in the browser");

assert.match(agileHtml, />KEMS<\/a>/);
assert.doesNotMatch(agileHtml, /Full KEMS Agile/);
assert.match(manifest, /"name": "KEMS"/);
assert.doesNotMatch(manifest, /Full KEMS Agile/);

for (const marker of [
  "Live Data",
  "KEMS",
  "Total energy cost",
  "Estimated KEMS ROI",
]) {
  assert.match(compare, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(compare, /Battery & Solar|Full KEMS Agile/);
assert.match(compareHtml, /compare-page\.js\?v=build1/);
assert.doesNotMatch(compareHtml, /strategy-comparison\.js/);

console.log(`${packageJson.version} canonical KEMS dashboard parity contract passed.`);
