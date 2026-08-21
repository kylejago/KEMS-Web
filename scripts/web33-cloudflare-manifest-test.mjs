import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const webNumber = Number.parseInt(pkg.version.match(/-web\.(\d+)$/)?.[1] || "0", 10);
const assetVersion = `alpha7web${webNumber}`;

assert.ok(webNumber >= 33, `Expected Web.33 or later, got ${pkg.version}`);

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
    `${file} must include Cloudflare Access credentials in the browser manifest request`,
  );
  assert.match(html, new RegExp(assetVersion), `${file} must use the current Web.${webNumber} cache key`);
  assert.doesNotMatch(
    html,
    /<link rel="manifest" href="site\.webmanifest" \/>/,
    `${file} must not retain the anonymous manifest request`,
  );
}

const bootstrap = read("public/pwa-bootstrap.js");
for (const marker of [
  "manifestCredentials",
  "manifestLinkPresent",
  "manifestLinkState",
  'link[rel="manifest"]',
  '"use-credentials"',
  'credentials: "include"',
  '"manifest-credentials-missing"',
  "Cloudflare Access credentials",
]) {
  assert.match(
    bootstrap,
    new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `PWA bootstrap missing authenticated-manifest marker ${marker}`,
  );
}

const settings = read("public/pwa-settings.js");
for (const marker of [
  "Manifest credentials",
  'state.manifestCredentials ? "Included" : "Missing"',
  "authenticated-site credentials",
  "Cloudflare Access",
  "Create shortcut is not a standalone PWA install",
]) {
  assert.match(
    settings,
    new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `PWA Settings missing authenticated-manifest marker ${marker}`,
  );
}

const manifestText = read("public/site.webmanifest");
assert.match(manifestText, new RegExp(assetVersion));
assert.doesNotMatch(manifestText, /alpha7web32/);

const worker = read("public/service-worker.js");
assert.match(worker, new RegExp(`kems-alpha7-web${webNumber}-shell-v1`));
assert.match(worker, new RegExp(`pwa-bootstrap\\.js\\?v=${assetVersion}`));

const project = JSON.parse(read("config/project.json"));
assert.equal(project.version, pkg.version);
assert.ok(
  project.principles.some((item) => /crossorigin=use-credentials.*Cloudflare Access/i.test(item)),
  "Project principles must preserve the authenticated manifest contract",
);

console.log(
  `Web.${webNumber} Cloudflare manifest contract passed: every property page uses credentialed browser manifest loading and diagnostics verify the same installability path.`,
);
