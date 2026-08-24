import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "public/compare-page.js"), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(source.includes('sensor.kems_energy_cost_comparison'), "Compare must consume the canonical HA bill contract");
assert(source.includes("contract_version"), "Compare must require a versioned financial contract");
assert(source.includes("will not reconstruct a fallback cost locally"), "Missing HA bill evidence must never trigger local financial reconstruction");
assert(source.includes("electricity_standing_charge_pence"), "Electricity standing charge must be visible");
assert(source.includes("gas_standing_charge_pence"), "Gas standing charge must be visible");
assert(source.includes("supplier_energy_credit_pence"), "Supplier/account credits must be visible");
assert(source.includes("total_energy_cost_pence"), "Winner must use total energy cost");
assert(source.includes("Battery wear is excluded"), "Household bill total must explicitly exclude battery wear");
assert(!source.includes("function scenarioCostPence("), "Web must no longer calculate scenario financial totals independently");
assert(!source.includes("importCost - exportIncome"), "The superseded import-minus-export-only winner formula must be gone");
assert(!/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(source), "Compare must remain read-only");

console.log("Comparison parity contract passed: Web consumes the canonical HA total-energy-cost payload and does not recreate billing logic.");
