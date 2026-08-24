import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "public/compare-page.js"), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function functionBlock(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `Missing ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  assert(signatureEnd >= 0, `Unable to find ${name} body`);
  const brace = signatureEnd + 2;
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to parse ${name}`);
}

const cost = functionBlock("scenarioCostPence");
assert(cost.includes("energy_net_cost_pence"), "Scenario cost must prefer KEMS energy-net cost");
assert(cost.includes("importCost - exportIncome"), "Scenario fallback must be import cost minus export income");
assert(!cost.includes("total_cost_pence"), "Winner cost must not include standing charge through total_cost_pence");
assert(!cost.includes("standing_charge_pence"), "Winner cost must exclude standing charge");
assert(!cost.includes("power_down_income_pence"), "Winner cost must keep Power Down reward outside the common bill basis");

const canonical = functionBlock("canonicalUninstalledActual");
assert(canonical.includes("systemInstalled()"), "No-system baseline must be gated by physical installation state");
assert(canonical.includes('scenario("no_system", periodKey)'), "Uninstalled Live Data must use the same canonical KEMS period replay");

const actual = functionBlock("actualMetrics");
assert(actual.includes("canonicalUninstalledActual(periodKey)"), "Live Data must prefer coherent KEMS period evidence before Pi analytics");
assert(actual.includes("periodEvidenceMatches"), "Commissioned Live Data must reject mismatched period evidence");
assert(actual.includes("Updating — Live Data period evidence does not match"), "Period mismatch must be visible instead of guessed");

for (const marker of [
  "import cost − export income",
  "Standing charge, battery-wear assumptions and Power Down reward are excluded",
  "Period evidence comes from the same canonical KEMS replay snapshot",
  "mismatched Live Data evidence is left unavailable rather than guessed",
]) {
  assert(source.includes(marker), `Comparison parity explanation missing: ${marker}`);
}

assert(!/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(source), "Compare must remain read-only");

console.log("Web.3 comparison parity contract passed: HA/KEMS owns period evidence and the winner uses import minus export only.");
