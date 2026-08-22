import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));

assert.equal(pkg.version, "0.8.0-alpha8-web.1");
assert.equal(project.version, pkg.version);

const forbiddenLiveIdentity = /(?:alpha7web|alpha8web|kems-alpha7|kems-alpha8|KEMS Alpha7|KEMS Alpha8|Alpha7 shadow)/i;
const propertySurfaces = [
  "public/index.html",
  "public/compare.html",
  "public/agile.html",
  "public/performance.html",
  "public/settings.html",
  "public/products.html",
  "public/remote-access.html",
  "public/service-worker.js",
  "public/site.webmanifest",
  "public/live-page.js",
  "public/panel-widget.js",
  "public/agile-page.js",
];
for (const file of propertySurfaces) {
  const source = read(file);
  assert.doesNotMatch(
    source,
    forbiddenLiveIdentity,
    `${file} must keep live KEMS identity independent of development-generation names`,
  );
}

for (const file of [
  "public/index.html",
  "public/compare.html",
  "public/agile.html",
  "public/performance.html",
  "public/settings.html",
  "public/products.html",
  "public/remote-access.html",
  "public/site.webmanifest",
  "public/service-worker.js",
  "public/live-page.js",
  "public/panel-widget.js",
]) {
  assert.match(read(file), /build1/, `${file} must use the neutral property build identity`);
}

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
  assert.doesNotMatch(
    source,
    /(?:alpha7web|alpha8web)/i,
    `${file} must keep public KEMS cache identity release-independent`,
  );
  assert.match(source, /site1/, `${file} must use the neutral public-site build identity`);
}

assert.doesNotMatch(pkg.description, /Alpha\d/i);
assert.doesNotMatch(project.summary, /Alpha\d/i);
assert.doesNotMatch(project.build, /Alpha\d/i);
assert.match(
  project.principles.at(-1),
  /Release versions identify published repository states/,
);

console.log(
  "KEMS product identity contract passed: release versions stay in metadata, not live product/cache naming.",
);
