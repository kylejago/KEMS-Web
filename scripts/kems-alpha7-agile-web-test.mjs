import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const index = read("public/index.html");
const products = read("public/product-model.js");
const agile = read("public/agile-page.js");
const agilePanel = read("public/web21-agile.js");
const serviceWorker = read("public/service-worker.js");
const publicSite = read("public-site/index.html");
const publicPrivacy = read("public-site/privacy.html");
const smoke = read("scripts/smoke-test.mjs");
const assetVersion = "build1";

if (project.version !== pkg.version) throw new Error("project.json and package.json version drift");
if (!pkg.scripts.test.includes("kems-live-fixture-test.mjs") || !pkg.scripts.test.includes("kems-alpha7-agile-web-test.mjs")) {
  throw new Error("Core web regressions are not in npm test");
}
if (!pkg.scripts.test.includes("web21-property-ui-test.mjs")) throw new Error("Property UI regression is not in npm test");
if (!smoke.includes("packageVersion")) throw new Error("Smoke version must derive from package.json");

if (index.includes(">Products<") || index.includes("History &amp; scenarios")) {
  throw new Error("Property Pi must not expose Products or History & scenarios navigation");
}
for (const marker of ["/compare.html", "/agile.html", "/performance.html", "/settings.html"]) {
  if (!index.includes(marker)) throw new Error(`Property navigation missing ${marker}`);
}

for (const label of ["Live Data", "KEMS"]) {
  if (!products.includes(`label: "${label}"`)) throw new Error(`Product model missing ${label}`);
}
for (const key of ['key: "battery_solar"', 'key: "full_kems"', 'key: "full_kems_agile"']) {
  if (products.includes(key)) throw new Error(`Retired product key remains user-facing: ${key}`);
}

for (const entityId of [
  "sensor.kems_agile_slots",
  "sensor.kems_energy_cost_comparison",
  "sensor.kems_agile_price_horizon_status",
  "sensor.kems_agile_partial_horizon_dispatch",
  "sensor.kems_agile_shadow_status",
  "sensor.kems_simulated_house_load_power",
  "sensor.kems_simulated_grid_import_power",
  "sensor.kems_simulated_grid_export_power",
  "sensor.kems_simulated_battery_power",
  "sensor.kems_simulated_battery_state_of_charge",
  "sensor.kems_simulated_battery_to_home_power",
  "sensor.kems_simulated_battery_export_power",
]) {
  if (!agile.includes(entityId) && !agilePanel.includes(entityId)) throw new Error(`KEMS page contract missing ${entityId}`);
}
if (!agile.includes("hardware_writes_blocked") || !agile.includes("unknown_price_dispatch_blocked")) {
  throw new Error("KEMS optimiser safety evidence missing");
}
for (const marker of ["today_slots", "tomorrow_slots", "grid_import_kwh", "grid_export_kwh", "battery_export_kwh", "ending_soc_percent"]) {
  if (!agile.includes(marker)) throw new Error(`KEMS slot contract missing ${marker}`);
}
if (/\/api\/services|services\.async_call|method:\s*["']POST/i.test(agile + agilePanel)) throw new Error("KEMS page must remain read-only");

if (!serviceWorker.includes("kems-web-shell-build1") || !serviceWorker.includes(`/brand-lockup.svg?v=${assetVersion}`) || !serviceWorker.includes(`/brand.css?v=${assetVersion}`)) {
  throw new Error("PWA cache is not aligned with neutral KEMS brand shell");
}
if (!serviceWorker.includes("/performance.html") || !serviceWorker.includes("/settings.html")) throw new Error("PWA property pages missing");
if (!publicSite.includes("kems.uk") || !publicSite.includes("Home Assistant remains private")) throw new Error("Public kems.uk boundary copy missing");
if (/\/api\/|HA_TOKEN|long-lived access token/i.test(publicSite + publicPrivacy)) throw new Error("Public site must not reference private property APIs or credentials");

console.log(`KEMS ${pkg.version} contract passed: two-product identity, canonical current routing, full Agile slot evidence and property/public safety boundaries preserved.`);
