import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));

const versionMatch = pkg.version.match(/^0\.8\.0-alpha8-web\.(\d+)$/);
assert.ok(versionMatch, `Expected Alpha8 Web release family, got ${pkg.version}`);
assert.ok(Number.parseInt(versionMatch[1], 10) >= 3, `Expected Web.3 or later, got ${pkg.version}`);
assert.equal(project.version, pkg.version);

const propertyPages = [
  "public/index.html",
  "public/compare.html",
  "public/kems.html",
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
  assert.match(html, /\?v=build1/, `${file} must use the neutral property asset identity`);
}

const legacyAgile = read("public/agile.html");
assert.match(legacyAgile, /\/kems\.html/);
assert.doesNotMatch(legacyAgile, /rel="manifest"|\?v=build1/, "Legacy Agile URL is redirect-only, not a second PWA page");

const panelState = read("public/panel-state.js");
assert.match(panelState, /export function derivePanelState/);
assert.match(panelState, /PANEL_POWER_THRESHOLD_KW/);
for (const file of ["public/live-page.js", "public/panel-widget.js"]) {
  const source = read(file);
  assert.match(source, /panel-state\.js\?v=build1/, `${file} must use the shared panel-state model`);
  assert.match(source, /derivePanelState/);
}
assert.doesNotMatch(
  read("public/live-page.js"),
  /navigator\.serviceWorker\.register/,
  "Live page must not duplicate the shared PWA bootstrap registration",
);

const kemsHtml = read("public/kems.html");
assert.match(kemsHtml, /kems-page\.js\?v=build2/);
assert.doesNotMatch(kemsHtml, /web21-agile\.js|src="agile-page\.js/);

const worker = read("public/service-worker.js");
assert.match(worker, /kems-web-shell-build2/);
assert.match(worker, /panel-state\.js\?v=build1/);
assert.match(worker, /kems-page\.js\?v=build2/);
assert.match(worker, /ev-policy-model\.js\?v=build1/);
assert.match(worker, /ev-policy-parity\.js\?v=build1/);
assert.match(worker, /url\.pathname === "\/site\.webmanifest"/);
assert.match(worker, /isAccessRedirect/);

const manifest = JSON.parse(read("public/site.webmanifest"));
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.every((icon) => icon.src.includes("build1")));
assert.ok(manifest.shortcuts.some((shortcut) => shortcut.name === "KEMS" && shortcut.url === "/kems.html"));

console.log(`KEMS ${pkg.version} consolidation contract passed: authenticated PWA parity, canonical KEMS route, single dashboard runtime, shared panel state, EV policy projection and coordinated versioning are intact.`);
