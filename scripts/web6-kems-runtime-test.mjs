import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const pages = [
  read("public/index.html"),
  read("public/compare.html"),
  read("public/performance.html"),
  read("public/settings.html"),
];
const kemsHtml = read("public/kems.html");
const legacyAgileHtml = read("public/agile.html");
const kemsRuntime = read("public/kems-page.js");
const renderer = read("public/agile-page.js");
const manifest = read("public/site.webmanifest");
const productModel = read("public/product-model.js");
const worker = read("public/service-worker.js");

assert.equal(pkg.version, "0.8.0-alpha8-web.8");
assert.equal(project.version, pkg.version);

for (const page of pages) {
  assert.match(page, /href="\/kems\.html">KEMS<\/a>/);
  assert.doesNotMatch(page, /href="\/agile\.html">KEMS<\/a>/);
}

assert.match(kemsHtml, /href="\/kems\.html">KEMS<\/a>/);
assert.match(kemsHtml, /src="kems-page\.js\?v=build2"/);
assert.doesNotMatch(kemsHtml, /web21-agile\.js|src="agile-page\.js/, "KEMS must not load two full-page renderers");
assert.doesNotMatch(kemsHtml, /ev-policy-parity\.js|ev-policy-model\.js/, "KEMS planning page must not load unrelated legacy runtime modules");

assert.match(legacyAgileHtml, /window\.location\.replace\(target\)/);
assert.match(legacyAgileHtml, /\/kems\.html/);
assert.doesNotMatch(legacyAgileHtml, /id="agile-app"|web21-agile\.js|agile-page\.js/);

assert.match(kemsRuntime, /class KemsIdleEventSource/);
assert.match(kemsRuntime, /globalThis\.EventSource = KemsIdleEventSource/);
assert.match(kemsRuntime, /import\("\.\/agile-page\.js\?v=build2"\)/);
assert.match(kemsRuntime, /REFRESH_INTERVAL_MS = 30_000/);
assert.match(kemsRuntime, /document\.hidden/);

for (const marker of [
  "sensor.kems_agile_slots",
  "sensor.kems_energy_cost_comparison",
  "sensor.kems_simulated_grid_import_power",
  "sensor.kems_simulated_grid_export_power",
  "Today's KEMS plan",
  "Tomorrow",
  "History",
]) assert.match(renderer, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.match(manifest, /"url": "\/kems\.html"/);
assert.doesNotMatch(manifest, /"url": "\/agile\.html"/);
assert.match(productModel, /href: "\/kems\.html"/);
assert.match(worker, /"\/kems\.html"/);
assert.match(worker, /"\/kems-page\.js\?v=build2"/);
assert.doesNotMatch(worker, /"\/web21-agile\.js/);

assert.doesNotMatch(renderer + kemsRuntime, /\/api\/services|services\.async_call|method:\s*["']POST/i);

console.log(`${pkg.version} KEMS runtime contract passed: canonical route, one dashboard owner, controlled refresh and read-only HA-parity evidence.`);
