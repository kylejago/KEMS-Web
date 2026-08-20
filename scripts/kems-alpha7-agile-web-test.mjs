import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const index = read("public/index.html");
const products = read("public/product-model.js");
const agile = read("public/agile-page.js");
const agileHtml = read("public/agile.html");
const serviceWorker = read("public/service-worker.js");
const publicSite = read("public-site/index.html");
const publicPrivacy = read("public-site/privacy.html");
const smoke = read("scripts/smoke-test.mjs");

if (pkg.version !== "0.7.0-alpha7-web.14") throw new Error(`Unexpected package version ${pkg.version}`);
if (project.version !== pkg.version) throw new Error("project.json and package.json version drift");
if (!pkg.scripts.test.includes("kems-live-fixture-test.mjs")) throw new Error("Live HA fixture is not in npm test");
if (!pkg.scripts.test.includes("kems-alpha7-agile-web-test.mjs")) throw new Error("Alpha7 Agile regression is not in npm test");
if (!pkg.scripts.test.includes("web14-contract-test.mjs")) throw new Error("Web.14 contract regression is not in npm test");
if (!smoke.includes("packageVersion") || smoke.includes('health.version!=="0.7.0-alpha6-web.7"')) throw new Error("Smoke version must derive from package.json");
if (!index.includes("/products.html") || !index.includes("/agile.html") || !agileHtml.includes("Full KEMS Agile")) throw new Error("Four-product navigation / Full KEMS Agile page missing");
for (const label of ["Live Data", "Battery & Solar", "Full KEMS", "Full KEMS Agile"]) if (!products.includes(`label: "${label}"`)) throw new Error(`Product model missing ${label}`);
for (const entityId of [
  "sensor.kems_agile_smart_export_status",
  "sensor.kems_agile_price_horizon_status",
  "sensor.kems_agile_partial_horizon_dispatch",
  "sensor.kems_agile_live_scenario",
  "sensor.kems_agile_shadow_status",
  "sensor.kems_agile_shadow_command",
  "sensor.kems_agile_shadow_safety"
]) if (!agile.includes(entityId)) throw new Error(`Agile page contract missing ${entityId}`);
if (!agile.includes("hardware_writes_blocked") || !agile.includes("independent_safety_13_of_13")) throw new Error("Agile proof safety evidence missing");
if (/\/api\/services|services\.async_call|method:\s*["']POST/i.test(agile)) throw new Error("Agile page must remain read-only");
if (!serviceWorker.includes("kems-alpha7-web14-shell-v1") || !serviceWorker.includes("/products.html") || !serviceWorker.includes("/agile.html")) throw new Error("PWA cache is not Web.14 product aware");
if (!publicSite.includes("kems.uk") || !publicSite.includes("Home Assistant remains private") || !publicSite.includes("demo.html") || !publicSite.includes("login.html")) throw new Error("Public kems.uk boundary/demo/login copy missing");
if (/\/api\/|HA_TOKEN|long-lived access token/i.test(publicSite + publicPrivacy)) throw new Error("Public site must not reference private property APIs or credentials");
console.log("KEMS Web.14 contract passed: versions aligned, four products + Full KEMS Agile read-only parity present, public boundary preserved.");
