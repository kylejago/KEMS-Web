import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const webNumber = Number.parseInt(pkg.version.match(/-web\.(\d+)$/)?.[1] || "0", 10);
const assetVersion = `alpha7web${webNumber}`;

assert.ok(webNumber >= 32, `Expected Web.32 or later, got ${pkg.version}`);

const manifest = JSON.parse(read("public/site.webmanifest"));
assert.equal(manifest.id, "/");
assert.equal(manifest.start_url, "/#live");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.src.includes(assetVersion)));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.src.includes(assetVersion)));
assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.src.includes(assetVersion)));

const bootstrap = read("public/pwa-bootstrap.js");
for (const marker of [
  "installReason",
  '"https-required"',
  '"prompt-ready"',
  '"browser-menu"',
  "manifestChecked",
  "manifestValid",
  "manifestStandalone",
  "manifestIcons",
  "serviceWorkerRegistered",
  "serviceWorkerReady",
  "serviceWorkerControlled",
  "navigator.serviceWorker.ready",
  'navigator.serviceWorker.addEventListener("controllerchange"',
  'window.addEventListener("beforeinstallprompt"',
  "promptInstall",
  "refreshDiagnostics",
]) {
  assert.match(bootstrap, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `PWA bootstrap missing ${marker}`);
}
assert.match(bootstrap, /credentials: "(?:same-origin|include)"/, "Manifest diagnostics must fetch with credentials");
if (webNumber >= 33) {
  assert.match(bootstrap, /manifestLinkState/);
  assert.match(bootstrap, /credentials: "include"/);
}

const settingsHtml = read("public/settings.html");
assert.match(settingsHtml, new RegExp(`pwa-settings\\.js\\?v=${assetVersion}`));

const settings = read("public/pwa-settings.js");
for (const marker of [
  "KEMSPWA",
  "getState",
  "promptInstall",
  "Open secure KEMS",
  "HTTP / shortcut only",
  "HTTPS / secure",
  "Install diagnostics",
  "Service worker",
  "Browser install prompt",
  "Standalone app",
  "Browser tab",
  "Reload to finish app setup",
  "Chrome's address bar",
  'event.stopImmediatePropagation()',
  'fetch("/api/site"',
  "kemsPwaBound",
  "alreadyBound",
  "setText",
]) {
  assert.match(settings, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `PWA Settings bridge missing ${marker}`);
}
assert.doesNotMatch(settings, /Long-Lived Access Token/i, "PWA install flow must not ask for a Home Assistant token");

const worker = read("public/service-worker.js");
assert.match(worker, new RegExp(`kems-alpha7-web${webNumber}-shell-v1`));
assert.match(worker, new RegExp(`pwa-settings\\.js\\?v=${assetVersion}`));
assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
assert.match(worker, /url\.pathname === "\/site\.webmanifest"/);

const project = JSON.parse(read("config/project.json"));
assert.equal(project.version, pkg.version);
assert.match(project.build, /install|PWA|manifest/i);
assert.ok(project.principles.some((item) => /HTTP Pi address.*browser shortcut/i.test(item)));
assert.ok(project.principles.some((item) => /secure-context.*runtime-manifest.*service-worker/i.test(item)));

console.log(`Web.${webNumber} install-state contract passed: HTTPS vs shortcut guidance, runtime diagnostics, shared prompt state, observer guard and worker activation checks are present.`);
