import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const re = (value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const pkg = JSON.parse(read("package.json"));
const index = read("public/index.html");
const compareHtml = read("public/compare.html");
const agileHtml = read("public/agile.html");
const performanceHtml = read("public/performance.html");
const compare = read("public/compare-page.js");
const agile = read("public/web21-agile.js");
const live = read("public/live-page.js");
const panel = read("public/panel-widget.js");
const panelState = read("public/panel-state.js");
const performance = read("public/performance-page.js");
const settings = read("public/settings-page.js");
const manifest = read("public/site.webmanifest");
const worker = read("public/service-worker.js");
const css = read("public/web21.css");
const web26 = read("public/web26.css");
const assetVersion = "build1";

assert.doesNotMatch(index, />Products</);
assert.doesNotMatch(index, /History &amp; scenarios/);
assert.match(index, /\/performance\.html/);
assert.match(index, /\/settings\.html/);
assert.match(index, /live-page\.js/);
assert.match(index, /panel-widget\.js/);
assert.match(index, /web26\.css/);
assert.doesNotMatch(index, /web21-live\.js/);
assert.doesNotMatch(index, /src="app\.js/);

for (const marker of [
  "/api/live",
  "/api/analytics?range=day",
  "PANEL_THRESHOLD",
  "derivePanelState",
  `panel-state.js?v=${assetVersion}`,
  "costToday",
]) assert.match(live, re(marker), `Live renderer missing ${marker}`);

for (const marker of [
  "gridImportPower",
  "gridExportPower",
  "solarDataAvailable",
  "batteryDataAvailable",
  "batterySoc",
  "gridImporting",
  "gridExporting",
  "solarProducing",
  "batteryCharging",
  "batteryDischarging",
  "costToday",
]) assert.match(panelState, re(marker), `Shared panel state missing ${marker}`);
assert.match(panelState, /export function derivePanelState/);
assert.match(panelState, /export const PANEL_POWER_THRESHOLD_KW/);

for (const marker of [
  "/api/live",
  "derivePanelState",
  `panel-state.js?v=${assetVersion}`,
  "GRID",
  "COST",
  "IMPORT",
  "EXPORT",
  "SOLAR",
  "HOME",
  "BATTERY",
  "EV",
  "batterySoc",
  "gridImporting",
  "gridExporting",
  "solarProducing",
  "batteryCharging",
  "batteryDischarging",
  "kems-web-panel",
  "kems-web-connector",
  "MutationObserver",
]) assert.match(panel, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `Panel widget missing ${marker}`);

assert.doesNotMatch(panel, /panel-face-mask\.(?:png|svg)/, "Panel widget must not depend on artwork masks");
assert.doesNotMatch(web26, /mask-image|panel-face-mask\.(?:png|svg)/, "Panel CSS must not depend on artwork masks");
for (const marker of ["kems-web-panel", "kems-web-status", "kems-web-stage", "kems-web-node", "kems-battery-gauge", "kems-web-flow-x", "kems-web-flow-y"]) assert.match(web26, new RegExp(marker));

for (const marker of ["Live Data", "Battery & Solar", "Full KEMS", "Full KEMS Agile", "Winner", "Net electricity cost", "Estimated ROI", "Today", "Yesterday", "Last 7 days", "Last 30 days", "Year", "All time"]) assert.match(compare, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
assert.doesNotMatch(compareHtml, /strategy-comparison\.js/, "Compare must not load a second legacy renderer");

for (const marker of ["data-agile-mode", "simulated", "Solar generation", "Battery SoC", "Home usage", "EV usage", "simulatedHouse", "solarSimulated", "simulatedBattery", "socSimulated", "solarLive", "batteryLive", "socLive", "KEMS Panel View", "web29-agile-panel", "livePanelValues", "simulatedPanelValues", "gridImporting", "gridExporting", "kems-web-panel", "kems-web-connector", "/api/live"]) assert.match(agile, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
assert.match(agileHtml, new RegExp(`web26\\.css\\?v=${assetVersion}`));
assert.match(agileHtml, new RegExp(`web21-agile\\.js\\?v=${assetVersion}`));

assert.match(performance, /sensor\.kems_actual_roi/);
assert.match(performance, /sensor\.kems_actual_system_value_today/);
assert.doesNotMatch(performance, /sensor\.kems_roi["']/);
assert.doesNotMatch(performance, /\/api\/scenarios/);
for (const html of [index, compareHtml, agileHtml, performanceHtml]) assert.doesNotMatch(html, /class="settings-button[^>]*>Settings</, "Desktop pages must not duplicate the Settings nav link with a top-right Settings button");

for (const marker of ["/api/site", "/api/home-assistant/status", "/api/system/status", "/api/system/action", "/api/system/update-policy", "/api/remote-access/status", "beforeinstallprompt", "Check for updates", "Install ${esc(latest)}", "automatic-updates", "update-mode", "maintenance-start", "maintenance-end", "automatic-reboot", "maintenance-notices", "Save update policy"]) assert.match(settings, re(marker));
assert.doesNotMatch(settings, /\/api\/updates/, "Settings must use the real Pi manager status endpoint, not the nonexistent /api/updates route");
assert.match(settings, /\?refresh=1/);
assert.match(settings, /action:\"update\"/);
assert.match(settings, /method:\"PUT\"/);
for (const field of ["automaticUpdates", "coordinatedUpdates", "maintenanceStart", "maintenanceEnd", "automaticReboot", "notifyMaintenance", "channel:\"alpha\""]) assert.match(settings, re(field), `Maintenance policy missing ${field}`);

assert.doesNotMatch(manifest, /products\.html/);
assert.match(manifest, /performance\.html/);
assert.match(manifest, /settings\.html/);
assert.match(worker, /performance\.html/);
assert.match(worker, /settings\.html/);
assert.match(worker, /kems-web-shell-build1/);
assert.match(worker, new RegExp(`live-page\\.js\\?v=${assetVersion}`));
assert.match(worker, new RegExp(`panel-widget\\.js\\?v=${assetVersion}`));
assert.match(worker, new RegExp(`panel-state\\.js\\?v=${assetVersion}`));
assert.match(worker, new RegExp(`web21-agile\\.js\\?v=${assetVersion}`));
assert.doesNotMatch(worker, /panel-face-mask\.(?:png|svg)/);
assert.match(css, /@media\(max-width:620px\)/);
assert.match(css, /maintenance-time-grid/);

console.log(`${pkg.version} property UI contract passed: shared panel-state model, panel-inspired Live Data and Agile Live/Simulated views, six-period four-way comparison, actual ROI, maintenance settings and responsive PWA shell are present.`);
