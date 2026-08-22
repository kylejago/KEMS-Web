import crypto from "node:crypto";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const bytes = (file) => fs.readFileSync(file);
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const SHA = "ef53e22bdff4e4ebd81007c3a6d5f28da0384f547e9036a7be7e3bf2d420b464";
const SIZE = 877;
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const propertyAssetVersion = "build1";
const publicAssetVersion = "site1";

expect(project.version === pkg.version, "project.json must match package.json");
expect(
  pkg.scripts.test.includes("web19-demo-login-brand-test.mjs"),
  "Delayed demo/login/brand regression must run in npm test",
);

const master = bytes("brand/kems-logo.svg");
expect(master.length === SIZE, `canonical SVG must be ${SIZE} bytes`);
expect(
  crypto.createHash("sha256").update(master).digest("hex") === SHA,
  "canonical SVG hash mismatch",
);
for (const file of [
  "public/logo.svg",
  "public/brand-lockup.svg",
  "public-site/logo.svg",
  "public-site/brand-lockup.svg",
]) {
  expect(master.equals(bytes(file)), `${file} must be byte-identical to supplied SVG`);
}
const sync = read("scripts/sync-approved-logo.mjs");
expect(
  sync.includes('brand", "kems-logo.svg"') &&
    sync.includes(SHA) &&
    sync.includes("877"),
  "brand sync must verify local exact SVG",
);
expect(
  !sync.includes("kems_full_brand_concept.png") && !sync.includes("67ad8c3e"),
  "current release must not fetch old PNG brand",
);

const gateway = read("gateway.mjs");
for (const marker of [
  "demo-api.kems.uk",
  '"/api/public-demo"',
  "PUBLIC_DEMO_DELAY_DAYS = 7",
  "energy-ledger.json",
  "PUBLIC_DEMO_ORIGINS",
  "public-demo-evidence.json",
  "sensor.kems_scenario_comparison_today",
  "sensor.kems_agile_smart_export_plan",
  "sensor.kems_today_energy_summary",
  "Home Assistant Recorder delayed KEMS evidence",
  "evKwh",
  "systemCostGbp",
]) {
  expect(gateway.includes(marker), `public demo gateway missing ${marker}`);
}
expect(
  gateway.includes('if (hostname === PUBLIC_DEMO_HOST)'),
  "demo data must be isolated by hostname",
);
expect(
  gateway.includes('url.pathname !== "/api/public-demo"'),
  "demo hostname must reject every other path",
);
expect(
  gateway.includes('row.products?.fullKemsAgile || row.simulated'),
  "retained simulation must remain usable as delayed Agile evidence",
);
expect(
  gateway.includes("row.date <= cutoff"),
  "Recorder/public evidence must remain behind the configured delayed cutoff",
);
expect(gateway.includes("schema: 2"), "public demo must publish schema 2");
expect(
  gateway.includes("no live power, EV state/SOC"),
  "public privacy boundary must explicitly exclude live EV/property telemetry",
);

const demo = read("public-site/demo.js");
expect(
  demo.includes("https://demo-api.kems.uk/api/public-demo"),
  "public demo must load live delayed API",
);
expect(demo.includes("demo-data.json"), "public demo must retain safe static fallback");
for (const marker of [
  "let period = 'day'",
  "economicResult",
  "evKwh",
  "systemCostGbp",
  "completeCompareDay",
  "kems-panel-stage",
]) {
  expect(demo.includes(marker), `current public demo capability missing ${marker}`);
}

const login = read("public-site/login.html");
expect(
  login.includes("https://kems-uk.cloudflareaccess.com/"),
  "property login must use Cloudflare App Launcher",
);
expect(
  !/<input[^>]+type=["']?password/i.test(login),
  "kems.uk must not implement password form",
);

const worker = read("public/service-worker.js");
expect(
  worker.includes("kems-web-shell-build1"),
  "current Web release must use the neutral PWA build cache",
);
expect(
  worker.includes(`/brand-lockup.svg?v=${propertyAssetVersion}`),
  "PWA must cache current brand lockup",
);
expect(!worker.includes("approved-logo.png"), "PWA must not cache obsolete PNG concept");
const propertyPages = [
  "public/index.html",
  "public/products.html",
  "public/agile.html",
  "public/compare.html",
  "public/remote-access.html",
  "public/performance.html",
  "public/settings.html",
];
for (const file of propertyPages) {
  const text = read(file);
  expect(
    text.includes(propertyAssetVersion),
    `${file} must use current neutral property assets`,
  );
  expect(
    !/(?:alpha7web|alpha8web)/i.test(text),
    `${file} must not embed development-generation cache identity`,
  );
}
const publicPages = [
  "public-site/index.html",
  "public-site/demo.html",
  "public-site/demo-compare.html",
  "public-site/login.html",
  "public-site/privacy.html",
  "public-site/404.html",
];
for (const file of publicPages) {
  const text = read(file);
  expect(
    text.includes(publicAssetVersion),
    `${file} must use current neutral public-site assets`,
  );
  expect(
    !/(?:alpha7web|alpha8web)/i.test(text),
    `${file} must not embed development-generation cache identity`,
  );
}

const release = read(".github/workflows/release.yml");
const deploy = read(".github/workflows/deploy-kems-uk.yml");
const installer = read("install.sh");
const helper = read("deploy/remote-access-service.mjs");
expect(
  release.includes(SHA) &&
    release.includes("brand/kems-logo.svg") &&
    release.includes("package.json gateway.mjs server.mjs public brand"),
  "release must verify/package canonical SVG source",
);
expect(
  deploy.includes(SHA) && deploy.includes("brand/**"),
  "kems.uk deployment must verify canonical SVG",
);
expect(
  installer.includes('"$SRC/public/logo.svg"') && installer.includes("brand"),
  "fresh installer must verify/copy exact SVG brand",
);
expect(
  !installer.includes("approved-logo.png"),
  "fresh installer must not require obsolete PNG artwork",
);
expect(
  helper.includes("const HELPER_VERSION = JSON.parse(") &&
    helper.includes('../package.json"'),
  "Remote Access helper must derive current Web/Pi release identity from package.json",
);
expect(
  !/const HELPER_VERSION = ["'][^"']+["']/.test(helper),
  "Remote Access helper must not duplicate release identity",
);

console.log(
  `${pkg.version} exact SVG, delayed demo and Cloudflare login contract passed.`,
);
