import crypto from "node:crypto";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const bytes = (file) => fs.readFileSync(file);
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const SHA = "ef53e22bdff4e4ebd81007c3a6d5f28da0384f547e9036a7be7e3bf2d420b464";
const SIZE = 877;

const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const webNumber = Number.parseInt(pkg.version.match(/-web\.(\d+)$/)?.[1] || "0", 10);
const assetVersion = `alpha7web${webNumber}`;
expect(webNumber >= 19, "package.json must identify Web.19 or later");
expect(project.version === pkg.version, "project.json must match package.json");
expect(pkg.scripts.test.includes("web19-demo-login-brand-test.mjs"), "Web.19+ regression must run in npm test");

const master = bytes("brand/kems-logo.svg");
expect(master.length === SIZE, `canonical SVG must be ${SIZE} bytes`);
expect(crypto.createHash("sha256").update(master).digest("hex") === SHA, "canonical SVG hash mismatch");
for (const file of ["public/logo.svg", "public/brand-lockup.svg", "public-site/logo.svg", "public-site/brand-lockup.svg"]) {
  expect(master.equals(bytes(file)), `${file} must be byte-identical to the supplied SVG`);
}
const sync = read("scripts/sync-approved-logo.mjs");
expect(sync.includes('brand", "kems-logo.svg"') && sync.includes(SHA) && sync.includes("877"), "brand sync must verify the local exact SVG");
expect(!sync.includes("kems_full_brand_concept.png") && !sync.includes("67ad8c3e"), "Web.19+ must not fetch the old PNG brand");

const gateway = read("gateway.mjs");
for (const marker of ["demo-api.kems.uk", '"/api/public-demo"', "PUBLIC_DEMO_DELAY_DAYS = 7", "energy-ledger.json", "PUBLIC_DEMO_ORIGINS"]) {
  expect(gateway.includes(marker), `public demo gateway missing ${marker}`);
}
expect(gateway.includes('if (hostname === PUBLIC_DEMO_HOST)'), "demo data must be isolated by hostname");
expect(gateway.includes('url.pathname !== "/api/public-demo"'), "demo hostname must reject every other path");
expect(gateway.includes('row.products?.fullKemsAgile || row.simulated'), "existing retained simulation must remain usable as delayed Full KEMS Agile evidence");
expect(gateway.includes("otherProducts: \"published only when product-specific daily evidence exists\""), "missing-product evidence must not be fabricated");

const demo = read("public-site/demo.js");
expect(demo.includes("https://demo-api.kems.uk/api/public-demo"), "public demo must load the live delayed API");
expect(demo.includes("demo-data.json"), "public demo must retain safe static fallback");
const login = read("public-site/login.html");
expect(login.includes("https://kems-uk.cloudflareaccess.com/"), "property login must use the Cloudflare App Launcher");
expect(!/<input[^>]+type=["']?password/i.test(login), "kems.uk must not implement a password form");

const worker = read("public/service-worker.js");
expect(worker.includes(`kems-alpha7-web${webNumber}-shell-v1`), "current Web release must advance the PWA cache");
expect(worker.includes(`/brand-lockup.svg?v=${assetVersion}`), "PWA must cache the current brand lockup");
expect(!worker.includes("approved-logo.png"), "PWA must not cache the obsolete PNG concept");
const pages = ["public/index.html", "public/products.html", "public/agile.html", "public/compare.html", "public/remote-access.html", "public-site/index.html", "public-site/demo.html", "public-site/login.html", "public-site/privacy.html", "public-site/404.html"];
for (const file of pages) {
  const text = read(file);
  expect(text.includes(assetVersion), `${file} must use current cache-busted assets`);
  expect(!text.includes("alpha7web18"), `${file} still references Web.18 assets`);
}

const release = read(".github/workflows/release.yml");
const deploy = read(".github/workflows/deploy-kems-uk.yml");
const installer = read("install.sh");
const helper = read("deploy/remote-access-service.mjs");
expect(release.includes(SHA) && release.includes("brand/kems-logo.svg") && release.includes("package.json gateway.mjs server.mjs public brand"), "release must verify and package canonical SVG source");
expect(deploy.includes(SHA) && deploy.includes("brand/**"), "kems.uk deployment must verify the canonical SVG");
expect(installer.includes('"$SRC/public/logo.svg"') && installer.includes("brand"), "fresh installer must verify/copy the exact SVG brand");
expect(!installer.includes("approved-logo.png"), "fresh installer must not require obsolete PNG artwork");
const helperVersion = Number.parseInt(helper.match(/HELPER_VERSION = "0\.7\.0-alpha7-web\.(\d+)"/)?.[1] || "0", 10);
expect(helperVersion >= 19, "Remote Access helper must retain the Web.19+ security baseline");

console.log(`Web.${webNumber} exact SVG, delayed demo and Cloudflare login contract passed.`);
