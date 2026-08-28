import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const compare = read("public/compare-page.js");
const products = read("public/product-model.js");
const project = JSON.parse(read("config/project.json"));
const pkg = JSON.parse(read("package.json"));

assert.equal(pkg.version, "0.8.0-alpha8-web.5");
assert.equal(project.version, pkg.version);
assert.match(products, /key: "live_data"/);
assert.match(products, /key: "kems"/);
assert.doesNotMatch(products, /key: "battery_solar"/);
assert.doesNotMatch(products, /key: "full_kems"/);
assert.doesNotMatch(products, /key: "full_kems_agile"/);

for (const field of [
  "electricity_import_cost_pence",
  "electricity_standing_charge_pence",
  "electricity_export_income_pence",
  "supplier_energy_credit_pence",
  "electricity_total_cost_pence",
  "gas_usage_cost_pence",
  "gas_standing_charge_pence",
  "gas_total_cost_pence",
  "total_energy_cost_pence",
]) assert(compare.includes(field), `Compare must render canonical ${field}`);

assert(compare.includes("sensor.kems_energy_cost_comparison"));
assert(compare.includes("selected_kems_strategy_label"));
assert(compare.includes("Battery wear is excluded"));
assert(!compare.includes("scenarioCostPence"));
assert(!compare.includes("energy_net_cost_pence"));
assert(!compare.includes("economic_net_cost_pence"));
assert(!compare.includes("Battery & Solar"));
assert(!compare.includes("Full KEMS Agile"));

console.log("Unified energy bill contract passed: two products, bill-equivalent totals, no battery wear, no local accounting drift.");
