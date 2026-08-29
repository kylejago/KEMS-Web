import fs from "node:fs";
import assert from "node:assert/strict";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const project = JSON.parse(fs.readFileSync("config/project.json", "utf8"));
const kems = fs.readFileSync("public/agile-page.js", "utf8");
const kemsRuntime = fs.readFileSync("public/kems-page.js", "utf8");
const kemsHtml = fs.readFileSync("public/kems.html", "utf8");
const legacyAgileHtml = fs.readFileSync("public/agile.html", "utf8");
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
  "System &amp; control safety",
  "economic_opportunity_guard",
]) {
  assert.match(kems, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const marker of [
  "today_slots",
  "tomorrow_slots",
  "00:00 to 23:30",
  "flow_grid_action",
  "flow_grid_kwh",
  "flow_solar_action",
  "flow_solar_kwh",
  "flow_battery_action",
  "flow_battery_kwh",
  "flow_estimated_soc_percent",
  "NO DATA",
]) assert.match(kems, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const retiredSplit of ["00:00 to 07:30", "08:00 to 15:30", "16:00 to 23:30"]) {
  assert.doesNotMatch(kems, new RegExp(retiredSplit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const id of [
  "sensor.kems_simulated_house_load_power",
  "sensor.kems_simulated_solar_power",
  "sensor.kems_simulated_battery_power",
  "sensor.kems_simulated_battery_state_of_charge",
  "sensor.kems_simulated_grid_import_power",
  "sensor.kems_simulated_grid_export_power",
]) assert.match(kems, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `KEMS renderer missing canonical ${id}`);

assert.match(kemsHtml, /href="\/kems\.html"[^>]*>KEMS<\/a>/);
assert.match(kemsHtml, /kems-page\.js\?v=build3/);
assert.match(kemsHtml, /agile\.css\?v=build3/);
assert.doesNotMatch(kemsHtml, /web21-agile\.js|src="agile-page\.js/);
assert.match(kemsRuntime, /KemsIdleEventSource/);
assert.match(legacyAgileHtml, /\/kems\.html/);
assert.doesNotMatch(legacyAgileHtml, /web21-agile\.js|agile-page\.js/);
assert.doesNotMatch(kemsHtml + legacyAgileHtml, /Full KEMS Agile/);
assert.match(manifest, /"name": "KEMS"/);
assert.match(manifest, /"url": "\/kems\.html"/);
assert.doesNotMatch(manifest, /Full KEMS Agile|"url": "\/agile\.html"/);

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

console.log(`${packageJson.version} canonical KEMS dashboard parity contract passed on /kems.html with one full-day controlled renderer.`);
