import fs from "node:fs";
import path from "node:path";

export const PUBLIC_DEMO_SCHEMA = 2;
export const PUBLIC_DEMO_DELAY_DAYS = 7;

const ALLOWED_KEYS = new Set([
  "date",
  "actual",
  "kems",
  "strategyLabel",
  // Legacy candidate fields are accepted only as private input compatibility.
  // The published payload always collapses them into the single KEMS product.
  "batterySolar",
  "fullKems",
  "fullKemsAgile",
  "winner"
]);

const ALLOWED_METRICS = new Set([
  "homeKwh",
  "evKwh",
  "gridImportKwh",
  "gridExportKwh",
  "solarKwh",
  "batteryChargeKwh",
  "batteryDischargeKwh",
  "batteryExportKwh",
  "electricityImportCostGbp",
  "electricityStandingChargeGbp",
  "electricityExportIncomeGbp",
  "supplierEnergyCreditGbp",
  "electricityTotalCostGbp",
  "gasUsageCostGbp",
  "gasStandingChargeGbp",
  "gasTotalCostGbp",
  "totalEnergyCostGbp",
  "savingGbp",
  "endSocPercent",
  // Retained only so an old delayed candidate can still provide non-financial
  // energy evidence. It is never promoted to Total energy cost.
  "netCostGbp",
  "exportIncomeGbp"
]);

function parseArgs(argv) {
  const result = {
    input: null,
    output: path.resolve("public-site/demo-data.json"),
    delayDays: PUBLIC_DEMO_DELAY_DAYS
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") result.input = argv[++index] || null;
    else if (token === "--output") result.output = path.resolve(argv[++index] || result.output);
    else if (token === "--delay-days") result.delayDays = Number.parseInt(argv[++index] || "", 10);
  }
  return result;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 3) {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function sanitiseMetrics(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const safe = {};
  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_METRICS.has(key)) continue;
    const digits = key.endsWith("Gbp") ? 2 : key.endsWith("Percent") ? 1 : 3;
    const number = round(value, digits);
    if (number !== null) safe[key] = number;
  }
  return Object.keys(safe).length ? safe : null;
}

function dateKey(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function latestAllowedDate(delayDays, now = new Date()) {
  const local = new Date(now);
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() - delayDays);
  return local.toISOString().slice(0, 10);
}

function legacyKemsCandidate(candidate) {
  if (candidate.kems) return [candidate.kems, candidate.strategyLabel || "Adaptive KEMS"];
  if (candidate.fullKemsAgile) return [candidate.fullKemsAgile, "Agile export optimisation"];
  if (candidate.fullKems) return [candidate.fullKems, "Fixed export optimisation"];
  if (candidate.batterySolar) return [candidate.batterySolar, "Self-use / no paid export"];
  return [null, candidate.strategyLabel || null];
}

export function sanitisePublicDemo(
  source,
  { delayDays = PUBLIC_DEMO_DELAY_DAYS, now = new Date() } = {}
) {
  if (!Number.isInteger(delayDays) || delayDays < PUBLIC_DEMO_DELAY_DAYS) {
    throw new Error(`Public demo delay must be at least ${PUBLIC_DEMO_DELAY_DAYS} days.`);
  }
  const cutoff = latestAllowedDate(delayDays, now);
  const rows = Array.isArray(source?.days) ? source.days : [];
  const days = [];

  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const key of Object.keys(candidate)) {
      if (!ALLOWED_KEYS.has(key)) {
        throw new Error(`Public demo candidate contains forbidden field: ${key}`);
      }
    }
    const date = dateKey(candidate.date);
    if (!date || date > cutoff) continue;

    const safe = { date };
    const actual = sanitiseMetrics(candidate.actual);
    const [kemsSource, strategyLabel] = legacyKemsCandidate(candidate);
    const kems = sanitiseMetrics(kemsSource);
    if (actual) safe.actual = actual;
    if (kems) safe.kems = kems;
    if (strategyLabel) safe.strategyLabel = String(strategyLabel).slice(0, 80);
    days.push(safe);
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  const dataThrough = days.at(-1)?.date || null;
  return {
    schema: PUBLIC_DEMO_SCHEMA,
    property: "Demo property",
    delayed: true,
    delayDays,
    generatedAt: new Date(now).toISOString(),
    dataThrough,
    privacy: "Sanitised daily totals only. No live power, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints.",
    products: ["actual", "kems"],
    billBasis: "Total energy cost includes electricity and gas usage, both standing charges, export income and genuine supplier/account energy credits. Battery wear is excluded.",
    days
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error("Usage: node scripts/build-public-demo.mjs --input <candidate.json> [--output <demo-data.json>] [--delay-days 7]");
    process.exitCode = 2;
    return;
  }
  const source = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  const payload = sanitisePublicDemo(source, { delayDays: args.delayDays });
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${payload.days.length} delayed public-demo day(s) to ${args.output}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
