import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const port = 4197;
const packageVersion = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const assetVersion = "build1";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kems-web-smoke-"));
const child = spawn(process.execPath, ["gateway.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    KEMS_BACKEND_PORT: String(port + 3),
    HOST: "127.0.0.1",
    DATA_DIR: dataDir,
    HA_URL: "",
    HA_TOKEN: "",
    KEMS_MANAGER_URL: "http://127.0.0.1:42997",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let ready = false;
  for (let index = 0; index < 35; index += 1) {
    await sleep(150);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
  }
  if (!ready) throw new Error(`Gateway did not start.\n${output}`);

  const get = (pathname) => fetch(`http://127.0.0.1:${port}${pathname}`);
  const [
    health,
    config,
    setup,
    site,
    manifest,
    live,
    history,
    html,
    js,
    agileHtml,
    agileJs,
    css,
    brandCss,
    system,
    scenarios,
    productsHtml,
    productModel,
    remoteHtml,
    compareHtml,
    performanceHtml,
    settingsHtml,
    web21Css,
    logo,
  ] = await Promise.all([
    get("/api/health").then((response) => response.json()),
    get("/api/config").then((response) => response.json()),
    get("/api/setup/status").then((response) => response.json()),
    get("/api/site").then((response) => response.json()),
    get("/site.webmanifest").then((response) => response.json()),
    get("/api/live").then((response) => response.json()),
    get("/api/history?hours=24").then((response) => response.json()),
    get("/").then((response) => response.text()),
    get("/app.js").then((response) => response.text()),
    get("/agile.html").then((response) => response.text()),
    get("/agile-page.js").then((response) => response.text()),
    get("/styles.css").then((response) => response.text()),
    get("/brand.css").then((response) => response.text()),
    get("/api/system/status").then((response) => response.json()),
    get("/api/scenarios").then((response) => response.json()),
    get("/products.html").then((response) => response.text()),
    get("/product-model.js").then((response) => response.text()),
    get("/remote-access.html").then((response) => response.text()),
    get("/compare.html").then((response) => response.text()),
    get("/performance.html").then((response) => response.text()),
    get("/settings.html").then((response) => response.text()),
    get("/web21.css").then((response) => response.text()),
    get("/logo.svg").then(async (response) => ({ ok: response.ok, text: await response.text() })),
  ]);

  const shellResponse = await get("/");
  const csp = shellResponse.headers.get("content-security-policy") || "";

  if (!health.ok || health.version !== packageVersion) {
    throw new Error(`Health/version failed: expected ${packageVersion}, got ${health.version}`);
  }
  if (config.dataMode !== "unconfigured" || setup.configured) {
    throw new Error("Fresh setup state failed.");
  }
  if (site.homeAssistantMode !== "external" || site.siteId !== "home" || !manifest.name.includes(site.name)) {
    throw new Error("Site identity/manifest failed.");
  }

  const manifestIcons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const runtimeManifestReady =
    manifest.id === "/" &&
    manifest.start_url === "/#live" &&
    manifest.scope === "/" &&
    manifest.display === "standalone" &&
    manifestIcons.some((icon) => icon.sizes === "192x192") &&
    manifestIcons.some((icon) => icon.sizes === "512x512") &&
    manifestIcons.some((icon) => icon.purpose === "maskable");
  if (!runtimeManifestReady) {
    throw new Error("Runtime /site.webmanifest is not a standalone-installable KEMS manifest.");
  }

  if (live.source !== "unconfigured" || live.connected) {
    throw new Error("Unconfigured snapshot failed.");
  }
  if (history.length) throw new Error("Unconfigured history should be empty.");
  if (!html.includes(`brand-lockup.svg?v=${assetVersion}`) || !html.includes("Cost &amp; ROI")) {
    throw new Error("Branded HTML shell incomplete.");
  }
  if (html.includes(">Products<") || !html.includes("/settings.html") || !html.includes("/performance.html")) {
    throw new Error("Property navigation is not focused on property data/settings.");
  }
  if (
    !logo.ok ||
    !logo.text.includes('viewBox="0 0 180 180"') ||
    !logo.text.includes('aria-label="KEMS logo"')
  ) {
    throw new Error("Canonical SVG is not being served.");
  }
  if (!productsHtml.includes("Product information has moved")) {
    throw new Error("Products page should hand off to public KEMS site.");
  }
  if (!remoteHtml.includes("Remote Access has moved")) {
    throw new Error("Remote Access should hand off to Settings.");
  }
  for (const [name, page] of [
    ["compare", compareHtml],
    ["performance", performanceHtml],
    ["settings", settingsHtml],
  ]) {
    if (!page.includes(assetVersion)) {
      throw new Error(`${name} page is not cache-version aligned`);
    }
  }
  if (!web21Css.includes("panel-flow") || !web21Css.includes("web21-mobile-nav")) {
    throw new Error("Responsive property styles missing.");
  }
  if (!productModel.includes('label: "Full KEMS Agile"')) throw new Error("Product model incomplete.");
  if (!brandCss.includes("brand-lockup") || !brandCss.includes("loading-brand-lockup")) {
    throw new Error("Brand stylesheet incomplete.");
  }
  if (
    !js.includes("renderConnectionPage") ||
    !js.includes("liveView") ||
    !js.includes("simulationView") ||
    !js.includes("compareView") ||
    !js.includes("scenarioView") ||
    !js.includes("performanceView")
  ) {
    throw new Error("Frontend bundle incomplete.");
  }
  if (!agileHtml.includes("Full KEMS Agile") || !agileJs.includes("sensor.kems_agile_shadow_status")) {
    throw new Error("Full KEMS Agile frontend incomplete.");
  }
  if (
    !css.includes(".connection-layout") ||
    !css.includes(".energy-flow") ||
    !css.includes(".breakdown-grid") ||
    !css.includes(".economics-layout") ||
    !css.includes(".system-grid") ||
    !css.includes(".chart-event-list")
  ) {
    throw new Error("Styles incomplete.");
  }
  if (!js.includes("systemSectionContent") || !js.includes("showBackupModal") || !js.includes("runSystemAction")) {
    throw new Error("Pi management frontend is missing.");
  }
  if (system.available !== false) {
    throw new Error("Non-Pi smoke environment should report manager unavailable rather than failing site.");
  }
  if (scenarios.available !== false || Object.keys(scenarios.periods || {}).length) {
    throw new Error("Fresh unconfigured instance should not invent scenario replay data.");
  }
  if (!csp.includes("style-src 'self' 'unsafe-inline'")) {
    throw new Error("Dynamic SVG/chart styles are blocked by CSP.");
  }

  console.log(
    `Smoke test passed for ${packageVersion}: setup ready, runtime manifest installable and mobile property shell present.`,
  );
} finally {
  child.kill("SIGTERM");
  fs.rmSync(dataDir, { recursive: true, force: true });
}
