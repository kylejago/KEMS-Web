import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));

assert.equal(pkg.version, "0.8.0-alpha8-web.10");
assert.equal(project.version, pkg.version);

const forbiddenLiveIdentity = /(?:alpha7web|alpha8web|kems-alpha7|kems-alpha8|KEMS Alpha7|KEMS Alpha8|Alpha7 shadow)/i;
const propertySurfaces = [
  "public/index.html",
  "public/compare.html",
  "public/kems.html",
  "public/agile.html",
  "public/performance.html",
  "public/settings.html",
  "public/products.html",
  "public/remote-access.html",
  "public/service-worker.js",
  "public/site.webmanifest",
  "public/live-page.js",
  "public/panel-widget.js",
  "public/kems-page.js",
  "public/agile-page.js",
  "public/flow-presentation-model.js",
  "public/control-safety-model.js",
  "public/control-safety-widget.js",
];
for (const file of propertySurfaces) {
  const source = read(file);
  assert.doesNotMatch(source, forbiddenLiveIdentity, `${file} must keep live KEMS identity independent of development-generation names`);
}

for (const file of [
  "public/index.html",
  "public/compare.html",
  "public/kems.html",
  "public/performance.html",
  "public/settings.html",
  "public/products.html",
  "public/remote-access.html",
  "public/site.webmanifest",
  "public/service-worker.js",
  "public/live-page.js",
  "public/panel-widget.js",
]) assert.match(read(file), /build1/, `${file} must retain the unchanged neutral property build identity alongside any intentionally bumped KEMS assets`);
assert.match(read("public/kems.html"), /kems-page\.js\?v=build3/);
assert.match(read("public/kems.html"), /agile\.css\?v=build3/);
assert.match(read("public/kems-page.js"), /build3/, "Changed KEMS runtime must use the neutral build3 identity");
assert.match(read("public/agile-page.js"), /flow-presentation-model\.js\?v=build3/);
assert.match(read("public/service-worker.js"), /const CACHE_NAME = "kems-web-shell-build5";/, "Web.10 must rotate the PWA shell for the safety/cleanup payload");
assert.doesNotMatch(read("public/kems-page.js"), /alpha\d+web|alpha8-web/i, "KEMS runtime cache identity must remain release-independent");
assert.doesNotMatch(read("public/agile-page.js"), /alpha\d+web|alpha8-web/i, "Agile renderer cache identity must remain release-independent");

const publicSitePages = [
  "public-site/index.html",
  "public-site/demo.html",
  "public-site/demo-compare.html",
  "public-site/login.html",
  "public-site/privacy.html",
  "public-site/404.html",
];
for (const file of publicSitePages) {
  const source = read(file);
  assert.doesNotMatch(source, /(?:alpha7web|alpha8web)/i, `${file} must keep public KEMS cache identity release-independent`);
  assert.match(source, /site2/, `${file} must use the neutral public-site build2 identity`);
}

assert.doesNotMatch(pkg.description, /Alpha\d/i);
assert.doesNotMatch(project.summary, /Alpha\d/i);
assert.doesNotMatch(project.build, /Alpha\d/i);
assert.match(project.principles.at(-1), /Release versions identify published repository states/);

const productModel = read("public/product-model.js");
assert.match(productModel, /key: "live_data"/);
assert.match(productModel, /key: "kems"/);
assert.match(productModel, /href: "\/kems\.html"/);
assert.doesNotMatch(productModel, /key: "battery_solar"/);
assert.doesNotMatch(productModel, /key: "full_kems_agile"/);

const bundleAgent = read("deploy/bundle-agent.mjs");
assert.match(bundleAgent, /const AGENT_VERSION = installedVersion\(\);/);
assert.doesNotMatch(bundleAgent, /const AGENT_VERSION = ["'][^"']*(?:alpha|beta|rc)/i);
const versionPatternSource = bundleAgent.match(/const match = \/(.+)\/i\.exec\(text\);/)?.[1];
assert.ok(versionPatternSource, "Pi bundle agent must expose an appliance release ordering pattern");
const versionPattern = new RegExp(versionPatternSource, "i");
for (const version of [
  "0.8.0-alpha8-web.10",
  "0.8.0-alpha8-web.9",
  "0.8.0-alpha8-web.8",
  "0.8.0-alpha8-web.7",
  "0.8.0-alpha8-web.6",
  "0.8.0-alpha8-web.5",
  "0.8.0-alpha8-web.4",
  "0.8.0-alpha8-web.3",
  "0.8.0-alpha8-web.2",
  "0.8.0-alpha8-web.1",
  "0.8.0-alpha.8-web.1",
  "0.8.0-beta1-web.0",
  "0.8.0-beta.1-web.0",
  "0.8.0-rc.1-web.0",
  "1.0.0-web.0",
]) assert.ok(versionPattern.test(version), `Pi bundle version ordering must understand ${version}`);

const remoteHelper = read("deploy/remote-access-service.mjs");
assert.match(remoteHelper, /const HELPER_VERSION = JSON\.parse\(/);
assert.match(remoteHelper, /\.\.\/package\.json/);
assert.doesNotMatch(remoteHelper, /const HELPER_VERSION = ["'][^"']*(?:alpha|beta|rc)/i);

console.log("KEMS product identity contract passed: Live Data and KEMS are the two user-facing products; /kems.html is canonical and cache keys remain release-independent.");
