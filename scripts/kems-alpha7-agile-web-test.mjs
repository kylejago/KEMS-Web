import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const index = read("public/index.html");
const products = read("public/product-model.js");
const kemsHtml = read("public/kems.html");
const legacyAgileHtml = read("public/agile.html");
const kemsRuntime = read("public/kems-page.js");
const kems = read("public/agile-page.js");
const serviceWorker = read("public/service-worker.js");
const publicSite = read("public-site/index.html");
const publicPrivacy = read("public-site/privacy.html");
const smoke = read("scripts/smoke-test.mjs");
const assetVersion = "build1";

if (project.version !== pkg.version) throw new Error("project.json and package.json version drift");
if (!pkg.scripts.test.includes("kems-live-fixture-test.mjs") || !pkg.scripts.test.includes("kems-alpha7-agile-web-test.mjs")) {
  throw new Error("Core web regressions are not in npm test");
}
if (!pkg.scripts.test.includes("web21-property-ui-test.mjs") || !pkg.scripts.test.includes("web6-kems-runtime-test.mjs")) {
  throw new Error("Current property/runtime regressions are not in npm test");
}
if (!smoke.includes("packageVersion")) throw new Error("Smoke version must derive from package.json");

if (index.includes(">Products<") || index.includes("History &amp; scenarios")) {
  throw new Error("Property Pi must not expose Products or History & scenarios navigation");
}
for (const marker of ["/compare.html", "/kems.html", "/performance.html", "/settings.html"]) {
  if (!index.includes(marker)) throw new Error(`Property navigation missing ${marker}`);
}
if (index.includes('href="/agile.html"')) throw new Error("Retired Agile URL must not remain in property navigation");

for (const label of ["Live Data", "KEMS"]) {
  if (!products.includes(`label: "${label}"`)) throw new Error(`Product model missing ${label}`);
}
if (!products.includes('href: "/kems.html"')) throw new Error("KEMS product must use canonical /kems.html route");
for (const key of ['key: "battery_solar"', 'key: "full_kems"', 'key: "full_kems_agile"']) {
  if (products.includes(key)) throw new Error(`Retired product key remains user-facing: ${key}`);
}

if (!kemsHtml.includes('src="kems-page.js?v=build3"') || kemsHtml.includes("web21-agile.js")) {
  throw new Error("KEMS page must have one controlled renderer");
}
if (!legacyAgileHtml.includes("/kems.html") || /agile-page\.js|web21-agile\.js|id="agile-app"/.test(legacyAgileHtml)) {
  throw new Error("Legacy Agile page must be redirect-only");
}
if (!kemsRuntime.includes("KemsIdleEventSource") || !kemsRuntime.includes("30_000")) {
  throw new Error("KEMS runtime must suppress high-frequency full-page rebuilds");
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
  if (!kems.includes(entityId)) throw new Error(`KEMS page contract missing ${entityId}`);
}
if (!kems.includes("hardware_writes_blocked") || !kems.includes("unknown_price_dispatch_blocked")) {
  throw new Error("KEMS optimiser safety evidence missing");
}
for (const marker of ["today_slots", "tomorrow_slots", "grid_import_kwh", "grid_export_kwh", "battery_export_kwh", "ending_soc_percent"]) {
  if (!kems.includes(marker)) throw new Error(`KEMS slot contract missing ${marker}`);
}
if (/\/api\/services|services\.async_call|method:\s*["']POST/i.test(kems + kemsRuntime)) throw new Error("KEMS page must remain read-only");

if (!serviceWorker.includes("kems-web-shell-build4") || !serviceWorker.includes(`/brand-lockup.svg?v=${assetVersion}`) || !serviceWorker.includes(`/brand.css?v=${assetVersion}`)) {
  throw new Error("PWA cache is not aligned with neutral KEMS brand shell");
}
if (!serviceWorker.includes("/kems.html") || !serviceWorker.includes("/kems-page.js?v=build3")) throw new Error("PWA canonical KEMS route missing");
if (!serviceWorker.includes("/agile.css?v=build3") || !serviceWorker.includes("/flow-presentation-model.js?v=build3")) throw new Error("PWA Agile presentation assets missing");
if (!serviceWorker.includes("/performance.html") || !serviceWorker.includes("/settings.html")) throw new Error("PWA property pages missing");
if (!publicSite.includes("kems.uk") || !publicSite.includes("Home Assistant remains private")) throw new Error("Public kems.uk boundary copy missing");
if (/\/api\/|HA_TOKEN|long-lived access token/i.test(publicSite + publicPrivacy)) throw new Error("Public site must not reference private property APIs or credentials");

console.log(`KEMS ${pkg.version} contract passed: canonical /kems.html route, one controlled renderer, current routing, full Agile slot evidence and property/public safety boundaries preserved.`);
