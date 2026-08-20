import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const port = 4197;
const packageVersion = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const webNumber = Number.parseInt(packageVersion.match(/-web\.(\d+)$/)?.[1] || "0", 10);
const assetVersion = `alpha7web${webNumber}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kems-web-smoke-"));
const child = spawn(process.execPath, ["gateway.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port), KEMS_BACKEND_PORT: String(port + 3), HOST: "127.0.0.1", DATA_DIR: dataDir, HA_URL: "", HA_TOKEN: "", KEMS_MANAGER_URL: "http://127.0.0.1:42997" },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (c) => output += c);
child.stderr.on("data", (c) => output += c);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 35; i += 1) { await sleep(150); try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { ready = true; break; } } catch {} }
  if (!ready) throw new Error(`Gateway did not start.\n${output}`);
  const [health, config, setup, site, manifest, live, history, html, js, agileHtml, agileJs, css, brandCss, system, scenarios, productsHtml, productModel, remoteHtml, approvedLogo] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/api/config`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/api/setup/status`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/api/site`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/site.webmanifest`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/api/live`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/api/history?hours=24`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/app.js`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/agile.html`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/agile-page.js`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/styles.css`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/brand.css`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/api/system/status`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/api/scenarios`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${port}/products.html`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/product-model.js`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/remote-access.html`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${port}/approved-logo.png`).then(async (r) => ({ ok: r.ok, bytes: (await r.arrayBuffer()).byteLength }))
  ]);
  const shellResponse = await fetch(`http://127.0.0.1:${port}/`);
  const csp = shellResponse.headers.get("content-security-policy") || "";
  if (!health.ok || health.version !== packageVersion) throw new Error(`Health/version failed: expected ${packageVersion}, got ${health.version}`);
  if (config.dataMode !== "unconfigured" || setup.configured) throw new Error("Fresh setup state failed.");
  if (site.homeAssistantMode !== "external" || site.siteId !== "home" || !manifest.name.includes(site.name)) throw new Error("Site identity/manifest failed.");
  if (live.source !== "unconfigured" || live.connected) throw new Error("Unconfigured snapshot failed.");
  if (history.length) throw new Error("Unconfigured history should be empty.");
  if (!html.includes(`brand-lockup.svg?v=${assetVersion}`) || !html.includes("Products") || !html.includes("Cost &amp; ROI")) throw new Error("Branded HTML shell incomplete.");
  if (webNumber >= 18 && (!approvedLogo.ok || approvedLogo.bytes !== 2_156_120)) throw new Error("Web.18 approved artwork is not being served exactly.");
  if (!productsHtml.includes("Four clear product levels") || !productModel.includes('label: "Full KEMS Agile"')) throw new Error("Product model/page incomplete.");
  if (!remoteHtml.includes("page-brand-lockup") || !remoteHtml.includes(`brand-lockup.svg?v=${assetVersion}`)) throw new Error("Remote Access shared branding is missing.");
  if (!brandCss.includes("brand-lockup") || !brandCss.includes("loading-brand-lockup")) throw new Error("Brand stylesheet is incomplete.");
  if (!js.includes("renderConnectionPage") || !js.includes("liveView") || !js.includes("simulationView") || !js.includes("compareView") || !js.includes("scenarioView") || !js.includes("performanceView")) throw new Error("Frontend bundle incomplete.");
  if (!agileHtml.includes("Full KEMS Agile") || !agileJs.includes("sensor.kems_agile_shadow_status")) throw new Error("Alpha7 Full KEMS Agile frontend incomplete.");
  if (!css.includes(".connection-layout") || !css.includes(".energy-flow") || !css.includes(".breakdown-grid") || !css.includes(".economics-layout") || !css.includes(".system-grid") || !css.includes(".chart-event-list")) throw new Error("Styles incomplete.");
  if (!js.includes("systemSectionContent") || !js.includes("showBackupModal") || !js.includes("runSystemAction")) throw new Error("Pi management frontend is missing.");
  if (system.available !== false) throw new Error("Non-Pi smoke environment should report the manager as unavailable rather than failing the site.");
  if (scenarios.available !== false || Object.keys(scenarios.periods || {}).length) throw new Error("Fresh unconfigured instance should not invent scenario replay data.");
  if (!csp.includes("style-src 'self' 'unsafe-inline'")) throw new Error("Dynamic SVG and chart styles are blocked by the CSP.");
  console.log(`Smoke test passed through Web.${webNumber} gateway: ${packageVersion}, setup ready, ${config.mappedEntityCount} mappings, branded Alpha7 shell present.`);
} finally {
  child.kill("SIGTERM");
  fs.rmSync(dataDir, { recursive: true, force: true });
}
