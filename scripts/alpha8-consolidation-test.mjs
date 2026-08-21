import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));

assert.equal(pkg.version, "0.8.0-alpha8-web.0");
assert.equal(project.version, pkg.version);

const propertyPages = [
  "public/index.html",
  "public/compare.html",
  "public/agile.html",
  "public/performance.html",
  "public/settings.html",
  "public/products.html",
  "public/remote-access.html",
];
for (const file of propertyPages) {
  const html = read(file);
  assert.match(
    html,
    /<link rel="manifest" href="site\.webmanifest" crossorigin="use-credentials" \/>/,
    `${file} must preserve Web.33 credentialed manifest loading`,
  );
  assert.doesNotMatch(html, /alpha7web33/, `${file} must not serve the stale Web.33 asset key`);
}

const panelState = read("public/panel-state.js");
assert.match(panelState, /export function derivePanelState/);
assert.match(panelState, /PANEL_POWER_THRESHOLD_KW/);
for (const file of ["public/live-page.js", "public/panel-widget.js"]) {
  const source = read(file);
  assert.match(source, /panel-state\.js\?v=alpha8web0/, `${file} must use the shared panel-state model`);
  assert.match(source, /derivePanelState/);
}
assert.doesNotMatch(
  read("public/live-page.js"),
  /navigator\.serviceWorker\.register/,
  "Live page must not duplicate the shared PWA bootstrap registration",
);

const worker = read("public/service-worker.js");
assert.match(worker, /kems-alpha8-web0-shell-v1/);
assert.match(worker, /panel-state\.js\?v=alpha8web0/);
assert.match(worker, /url\.pathname === "\/site\.webmanifest"/);
assert.match(worker, /isAccessRedirect/);

const manifest = JSON.parse(read("public/site.webmanifest"));
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.every((icon) => icon.src.includes("alpha8web0")));

console.log("Alpha8 Web.0 consolidation contract passed: Web.33 PWA parity, shared panel state and coordinated versioning are intact.");
