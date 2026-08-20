import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KEMS_PRODUCTS } from "../public/product-model.js";
import { sanitisePublicDemo } from "./build-public-demo.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

const expectedProducts = ["Live Data", "Battery & Solar", "Full KEMS", "Full KEMS Agile"];
assert.deepEqual(KEMS_PRODUCTS.map((product) => product.label), expectedProducts);
assert.deepEqual(KEMS_PRODUCTS.map((product) => product.key), ["live_data", "battery_solar", "full_kems", "full_kems_agile"]);

const project = JSON.parse(read("config/project.json"));
assert.match(project.version, /^0\.7\.0-alpha7-web\.(?:1[4-9]|[2-9]\d+)$/);
for (const label of expectedProducts) assert.match(`${project.summary} ${project.principles.join(" ")}`, new RegExp(label.replace(/[&]/g, "&")));

const propertyIndex = read("public/index.html");
assert.match(propertyIndex, />Live Data</);
assert.match(propertyIndex, /\/products\.html/);
assert.match(propertyIndex, />Compare</);
assert.match(propertyIndex, />Cost &amp; ROI</);

const productsPage = read("public/products.html");
assert.match(productsPage, /product-model\.js/);
assert.match(productsPage, /read-only/);

const publicIndex = read("public-site/index.html");
const publicIndexText = publicIndex.replaceAll("&amp;", "&");
for (const label of expectedProducts) assert.ok(publicIndexText.includes(label), `kems.uk missing ${label}`);
assert.match(publicIndex, /demo\.html/);
assert.match(publicIndex, /login\.html/);

const publicLogo = read("public/logo.svg");
const publicSiteLogo = read("public-site/logo.svg");
assert.equal(publicLogo, publicSiteLogo, "property and public sites must use the same compact KEMS logo");
assert.match(publicLogo, /Solar|KEMS logo/);

const cutoffNow = new Date("2026-08-20T09:00:00Z");
const payload = sanitisePublicDemo({
  days: [
    {
      date: "2026-08-13",
      actual: { gridImportKwh: 12.3456, netCostGbp: 2.345, forbidden: 99 },
      batterySolar: { netCostGbp: 1.8 },
      fullKems: { netCostGbp: 1.5 },
      fullKemsAgile: { netCostGbp: 1.1 },
      winner: "Full KEMS Agile"
    },
    {
      date: "2026-08-14",
      actual: { gridImportKwh: 100 }
    }
  ]
}, { now: cutoffNow, delayDays: 7 });
assert.equal(payload.days.length, 1, "newer-than-cutoff demo data must be removed");
assert.equal(payload.days[0].date, "2026-08-13");
assert.equal(payload.days[0].actual.gridImportKwh, 12.346);
assert.equal(payload.days[0].actual.netCostGbp, 2.35);
assert.ok(!("forbidden" in payload.days[0].actual));
assert.equal(payload.days[0].winner, "Full KEMS Agile");
assert.throws(() => sanitisePublicDemo({ days: [] }, { now: cutoffNow, delayDays: 6 }), /at least 7 days/);
assert.throws(() => sanitisePublicDemo({ days: [{ date: "2026-08-13", entityId: "sensor.private" }] }, { now: cutoffNow }), /forbidden field/);

const demoJs = read("public-site/demo.js");
assert.match(demoJs, /delayDays < 7/);
assert.match(demoJs, /too recent/);
const emptyDemo = JSON.parse(read("public-site/demo-data.json"));
assert.equal(emptyDemo.delayDays, 7);
assert.deepEqual(emptyDemo.days, []);

const login = read("public-site/login.html");
assert.match(login, /does not accept credentials yet/);
assert.doesNotMatch(login, /type=["']password["']/i);

const server = read("server.mjs");
assert.match(server, /cf-connecting-ip/);
assert.match(server, /x-forwarded-for/);
assert.match(server, /directLanManagementRequest/);

const remote = read("docs/REMOTE-ACCESS.md");
assert.match(remote, /outbound tunnel/i);
assert.match(remote, /read-only KEMS property dashboard/i);
assert.match(remote, /no dependency on exposing `8123`, `4173`, SSH/i);

console.log("Web.14+ contract checks passed");
