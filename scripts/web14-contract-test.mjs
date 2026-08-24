import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KEMS_PRODUCTS } from "../public/product-model.js";
import { sanitisePublicDemo } from "./build-public-demo.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

const expectedProducts = ["Live Data", "KEMS"];
assert.deepEqual(KEMS_PRODUCTS.map((product) => product.label), expectedProducts);
assert.deepEqual(KEMS_PRODUCTS.map((product) => product.key), ["live_data", "kems"]);

const project = JSON.parse(read("config/project.json"));
const versionMatch = project.version.match(/-alpha(\d+)-web\.(\d+)$/);
assert.ok(versionMatch, `Unexpected KEMS Web version ${project.version}`);
const alphaNumber = Number.parseInt(versionMatch[1], 10);
const webNumber = Number.parseInt(versionMatch[2], 10);
const hasWeb14Contract = alphaNumber > 7 || webNumber >= 14;
const hasPropertyFocusedShell = alphaNumber > 7 || webNumber >= 21;
const hasCloudflareLogin = alphaNumber > 7 || webNumber >= 19;
assert.ok(hasWeb14Contract, `Web.14+ contract required, got ${project.version}`);
for (const label of expectedProducts) {
  assert.match(`${project.summary} ${project.principles.join(" ")}`, new RegExp(label));
}

const propertyIndex = read("public/index.html");
assert.match(propertyIndex, />Live Data</);
assert.match(propertyIndex, />Compare</);
assert.match(propertyIndex, />Cost &amp; ROI</);
if (hasPropertyFocusedShell) {
  assert.doesNotMatch(propertyIndex, />Products</);
  assert.match(propertyIndex, /\/settings\.html/);
  assert.match(read("public/products.html"), /Product information has moved/);
} else {
  assert.match(propertyIndex, /\/products\.html/);
  assert.match(read("public/products.html"), /product-model\.js/);
}

const publicIndex = read("public-site/index.html");
const publicIndexText = publicIndex.replaceAll("&amp;", "&");
for (const label of expectedProducts) {
  assert.ok(publicIndexText.includes(label), `kems.uk missing ${label}`);
}
assert.doesNotMatch(publicIndexText, /Battery & Solar|Full KEMS Agile/);
assert.match(publicIndex, /demo\.html/);
assert.match(publicIndex, /login\.html/);

const publicLogo = read("public/logo.svg");
const publicSiteLogo = read("public-site/logo.svg");
assert.equal(publicLogo, publicSiteLogo, "property and public sites must use same compact KEMS logo");
assert.match(publicLogo, /KEMS logo/);

const cutoffNow = new Date("2026-08-20T09:00:00Z");
const payload = sanitisePublicDemo(
  {
    days: [
      {
        date: "2026-08-13",
        actual: {
          gridImportKwh: 12.3456,
          totalEnergyCostGbp: 2.345,
          electricityStandingChargeGbp: 0.537,
          gasStandingChargeGbp: 0.31,
          forbidden: 99,
        },
        kems: {
          gridImportKwh: 4.5,
          totalEnergyCostGbp: -1.234,
          electricityStandingChargeGbp: 0.537,
          gasStandingChargeGbp: 0.31,
        },
        strategyLabel: "Agile export optimisation",
      },
      { date: "2026-08-14", actual: { gridImportKwh: 100 } },
    ],
  },
  { now: cutoffNow, delayDays: 7 },
);
assert.equal(payload.schema, 2);
assert.deepEqual(payload.products, ["actual", "kems"]);
assert.equal(payload.days.length, 1);
assert.equal(payload.days[0].date, "2026-08-13");
assert.equal(payload.days[0].actual.gridImportKwh, 12.346);
assert.equal(payload.days[0].actual.totalEnergyCostGbp, 2.35);
assert.equal(payload.days[0].kems.totalEnergyCostGbp, -1.23);
assert.equal(payload.days[0].strategyLabel, "Agile export optimisation");
assert.ok(!("forbidden" in payload.days[0].actual));
assert.ok(!("fullKemsAgile" in payload.days[0]));

const legacy = sanitisePublicDemo(
  {
    days: [
      {
        date: "2026-08-13",
        actual: { evKwh: 2 },
        fullKemsAgile: { evKwh: 1.5 },
      },
    ],
  },
  { now: cutoffNow, delayDays: 7 },
);
assert.equal(legacy.days[0].kems.evKwh, 1.5);
assert.equal(legacy.days[0].strategyLabel, "Agile export optimisation");
assert.ok(!("fullKemsAgile" in legacy.days[0]));

assert.throws(
  () => sanitisePublicDemo({ days: [] }, { now: cutoffNow, delayDays: 6 }),
  /at least 7 days/,
);
assert.throws(
  () => sanitisePublicDemo({ days: [{ date: "2026-08-13", entityId: "sensor.private" }] }, { now: cutoffNow }),
  /forbidden field/,
);

const demoJs = read("public-site/demo.js");
assert.match(demoJs, /delayDays < 7/);
assert.match(demoJs, /too recent/);
const emptyDemo = JSON.parse(read("public-site/demo-data.json"));
assert.equal(emptyDemo.delayDays, 7);
assert.deepEqual(emptyDemo.days, []);

const login = read("public-site/login.html");
if (hasCloudflareLogin) {
  assert.match(login, /kems-uk\.cloudflareaccess\.com/);
  assert.match(login, /Sign in to KEMS/);
} else {
  assert.match(login, /does not accept credentials yet/);
}
assert.doesNotMatch(login, /type=["']password["']/i);

const server = read("server.mjs");
assert.match(server, /cf-connecting-ip/);
assert.match(server, /x-forwarded-for/);
assert.match(server, /directLanManagementRequest/);
const remote = read("docs/REMOTE-ACCESS.md");
assert.match(remote, /outbound tunnel/i);
assert.match(remote, /read-only KEMS property dashboard/i);
assert.match(remote, /no dependency on exposing `8123`, `4173`, SSH/i);

console.log(`Web.14+ contract checks passed for ${project.version}`);
