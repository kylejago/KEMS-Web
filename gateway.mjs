import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_PORT = Number.parseInt(process.env.PORT || "4173", 10) || 4173;
const BACKEND_PORT = Number.parseInt(process.env.KEMS_BACKEND_PORT || String(PUBLIC_PORT + 3), 10) || (PUBLIC_PORT + 3);
const REMOTE_HELPER_PORT = Number.parseInt(process.env.KEMS_REMOTE_ACCESS_PORT || "4175", 10) || 4175;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const DAILY_LEDGER_FILE = path.join(DATA_DIR, "energy-ledger.json");
const PUBLIC_EVIDENCE_FILE = path.join(DATA_DIR, "public-demo-evidence.json");
const CONNECTION_FILE = path.join(DATA_DIR, "connection.enc.json");
const SECRET_FILE = path.join(DATA_DIR, ".connection-key");
const PUBLIC_DEMO_HOST = String(process.env.KEMS_PUBLIC_DEMO_HOST || "demo-api.kems.uk").trim().toLowerCase();
const PUBLIC_DEMO_DELAY_DAYS = 7;
const PUBLIC_DEMO_ORIGINS = new Set(["https://kems.uk", "https://www.kems.uk"]);
const PUBLIC_BACKFILL_DAYS = 14;
const PUBLIC_EVIDENCE_VERSION = 3;
const PUBLIC_HISTORY_ENTITIES = [
  "sensor.kems_energy_cost_comparison",
  "sensor.kems_scenario_comparison_today",
  "sensor.kems_agile_smart_export_plan",
  "sensor.kems_today_energy_summary",
  "sensor.kems_simulated_kems_cost_today"
];
let publicEvidenceRefresh = null;
let publicEvidenceLastRefresh = 0;

function privateIpv4(value) {
  const parts = String(value || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

function privateHostname(value = "") {
  const host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  return net.isIP(host) === 4 ? privateIpv4(host) : false;
}

function requestHostname(request) {
  try { return new URL(`http://${request.headers.host || ""}`).hostname.toLowerCase(); }
  catch { return ""; }
}

function sameOrigin(request) {
  const origin = String(request.headers.origin || "");
  if (!origin) return true;
  try { return new URL(origin).host === String(request.headers.host || ""); } catch { return false; }
}

function directLanManagementRequest(request) {
  if (!sameOrigin(request)) return false;
  if (request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"] || request.headers["x-forwarded-host"] || request.headers.forwarded) return false;
  return privateHostname(requestHostname(request));
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(JSON.stringify(value));
}

function demoCorsHeaders(request) {
  const origin = String(request.headers.origin || "");
  if (!PUBLIC_DEMO_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
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

function delayedCutoff(delayDays = PUBLIC_DEMO_DELAY_DAYS) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - delayDays);
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey, count) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function readJsonIfExists(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback; }
  catch { return fallback; }
}

function atomicWriteJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

function getConnectionKey() {
  const supplied = String(process.env.KEMS_CONFIG_KEY || "").trim();
  if (supplied) return crypto.createHash("sha256").update(supplied).digest();
  if (!fs.existsSync(SECRET_FILE)) return null;
  const key = Buffer.from(fs.readFileSync(SECRET_FILE, "utf8").trim(), "base64url");
  return key.length === 32 ? key : null;
}

function storedHomeAssistantConnection() {
  const environmentUrl = String(process.env.HA_URL || "").trim().replace(/\/$/, "");
  const environmentToken = String(process.env.HA_TOKEN || "").trim();
  if (environmentUrl && environmentToken) return { url: environmentUrl, token: environmentToken };
  if (!fs.existsSync(CONNECTION_FILE)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(CONNECTION_FILE, "utf8"));
    const key = getConnectionKey();
    if (!key || payload?.version !== 1) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
    const stored = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64url")),
      decipher.final()
    ]).toString("utf8"));
    const url = String(stored?.url || "").trim().replace(/\/$/, "");
    const token = String(stored?.token || "").trim();
    return url && token ? { url, token } : null;
  } catch {
    return null;
  }
}

async function homeAssistantJson(connection, apiPath) {
  if (!connection) return null;
  const response = await fetch(`${connection.url}${apiPath}`, {
    headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Home Assistant returned ${response.status}.`);
  return response.json();
}

function stateTimestamp(state) {
  const value = new Date(state?.last_updated || state?.last_changed || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function statesForEntity(history, entityId) {
  if (!Array.isArray(history)) return [];
  const rows = history.find((group) => Array.isArray(group) && group.some((item) => item?.entity_id === entityId));
  return Array.isArray(rows) ? rows.filter((item) => item?.entity_id === entityId).sort((a, b) => stateTimestamp(a) - stateTimestamp(b)) : [];
}

function matchingLatestState(history, entityId, matcher) {
  const rows = statesForEntity(history, entityId).filter((state) => {
    try { return matcher(state?.attributes || {}); } catch { return false; }
  });
  return rows.at(-1) || null;
}

function poundsFromPence(value) {
  const number = finite(value);
  return number === null ? null : round(number / 100, 2);
}

function scenarioProduct(source, evKwh = null) {
  if (!source || typeof source !== "object" || source.ready === false) return null;
  const mapped = {
    home: finite(source.house_consumption_kwh ?? source.home_energy_kwh ?? source.house_energy_kwh ?? source.home_usage_kwh),
    ev: finite(evKwh),
    gridImport: finite(source.grid_import_kwh ?? source.import_kwh),
    gridExport: finite(source.grid_export_kwh ?? source.export_kwh),
    solar: finite(source.solar_generation_kwh ?? source.solar_kwh),
    batteryCharge: finite(source.battery_charge_kwh),
    batteryDischarge: finite(source.battery_to_home_kwh ?? source.battery_discharged_kwh ?? source.battery_discharge_kwh),
    batteryExport: finite(source.battery_export_kwh),
    endSocPercent: finite(source.ending_soc_percent ?? source.end_soc_percent)
  };
  for (const key of Object.keys(mapped)) if (!Number.isFinite(mapped[key])) delete mapped[key];
  return Object.keys(mapped).length ? mapped : null;
}

function scenarioByKey(state, dateKey, keys) {
  const attrs = state?.attributes || {};
  const period = attrs?.periods?.today || attrs;
  if (String(period?.end_date || period?.endDate || "").slice(0, 10) !== dateKey) return null;
  const scenarios = Array.isArray(period?.scenarios) ? period.scenarios : [];
  for (const key of keys) {
    const found = scenarios.find((row) => row?.key === key);
    if (found) return found;
  }
  return null;
}

function agileScenario(state, dateKey) {
  const attrs = state?.attributes || {};
  const period = attrs?.periods?.today;
  if (!period) return null;
  const endDate = String(period?.end_date || period?.endDate || "").slice(0, 10);
  if (endDate && endDate !== dateKey) return null;
  return period.agile_smart_export || period.full_kems_agile || period.scenario || (period.ready !== undefined ? period : null);
}

function evEnergyFromHistory(history, dateKey) {
  const summary = matchingLatestState(history, "sensor.kems_today_energy_summary", (attrs) => {
    const endDate = String(attrs?.end_date || attrs?.endDate || "").slice(0, 10);
    return !endDate || endDate === dateKey;
  });
  const summaryEv = finite(summary?.attributes?.ev_energy_kwh);
  if (Number.isFinite(summaryEv)) return summaryEv;
  const simulation = matchingLatestState(history, "sensor.kems_simulated_kems_cost_today", () => true);
  return finite(simulation?.attributes?.actual_ev_energy_kwh);
}

function canonicalBillProduct(source) {
  if (!source || typeof source !== "object" || source.ready === false) return null;
  const mapped = {
    homeKwh: round(source.home_energy_kwh),
    gridImportKwh: round(source.grid_import_kwh),
    gridExportKwh: round(source.grid_export_kwh),
    gasUsageKwh: round(source.gas_usage_kwh),
    electricityImportCostGbp: poundsFromPence(source.electricity_import_cost_pence),
    electricityStandingChargeGbp: poundsFromPence(source.electricity_standing_charge_pence),
    electricityExportIncomeGbp: poundsFromPence(source.electricity_export_income_pence),
    supplierEnergyCreditGbp: poundsFromPence(source.supplier_energy_credit_pence),
    electricityTotalCostGbp: poundsFromPence(source.electricity_total_cost_pence),
    gasUsageCostGbp: poundsFromPence(source.gas_usage_cost_pence),
    gasStandingChargeGbp: poundsFromPence(source.gas_standing_charge_pence),
    gasTotalCostGbp: poundsFromPence(source.gas_total_cost_pence),
    totalEnergyCostGbp: poundsFromPence(source.total_energy_cost_pence)
  };
  for (const key of Object.keys(mapped)) if (!Number.isFinite(mapped[key])) delete mapped[key];
  return Object.keys(mapped).length ? mapped : null;
}

function canonicalBillForDay(state, dateKey) {
  const attrs = state?.attributes || {};
  if (Number(attrs.contract_version) < 1 || attrs.basis !== "bill_equivalent") return null;
  const period = attrs?.periods?.today;
  if (!period) return null;
  const endDate = String(period?.end_date || period?.endDate || "").slice(0, 10);
  if (endDate !== dateKey) return null;
  const liveData = canonicalBillProduct(period.live_data);
  const kems = canonicalBillProduct(period.kems);
  if (!liveData && !kems) return null;
  return {
    liveData,
    kems,
    savingGbp: poundsFromPence(period.saving_pence),
    strategy: String(period?.kems?.strategy || attrs.selected_kems_strategy || ""),
    strategyLabel: String(period?.kems?.strategy_label || attrs.selected_kems_strategy_label || "Adaptive KEMS")
  };
}

function selectLegacyKemsEnergy(strategy, batterySolar, fullKems, fullKemsAgile) {
  if (strategy === "agile") return fullKemsAgile || fullKems || batterySolar || null;
  if (strategy === "none") return batterySolar || fullKems || fullKemsAgile || null;
  return fullKems || fullKemsAgile || batterySolar || null;
}

async function historicalEvidenceForDay(connection, dateKey) {
  const start = `${dateKey}T00:00:00Z`;
  const end = `${addDays(dateKey, 1)}T01:30:00Z`;
  const params = new URLSearchParams({
    filter_entity_id: PUBLIC_HISTORY_ENTITIES.join(","),
    end_time: end,
    significant_changes_only: "0"
  });
  const history = await homeAssistantJson(connection, `/api/history/period/${encodeURIComponent(start)}?${params.toString()}`);
  if (!history) return null;

  const billState = matchingLatestState(history, "sensor.kems_energy_cost_comparison", (attrs) => {
    const period = attrs?.periods?.today;
    return Number(attrs.contract_version) >= 1
      && attrs.basis === "bill_equivalent"
      && String(period?.end_date || period?.endDate || "").slice(0, 10) === dateKey;
  });
  const bill = canonicalBillForDay(billState, dateKey);

  const scenarioState = matchingLatestState(history, "sensor.kems_scenario_comparison_today", (attrs) => {
    const period = attrs?.periods?.today || attrs;
    return String(period?.end_date || period?.endDate || "").slice(0, 10) === dateKey;
  });
  const agileState = matchingLatestState(history, "sensor.kems_agile_smart_export_plan", (attrs) => {
    const period = attrs?.periods?.today;
    const endDate = String(period?.end_date || period?.endDate || "").slice(0, 10);
    return !endDate || endDate === dateKey;
  });
  const evKwh = evEnergyFromHistory(history, dateKey);
  const batterySolar = scenarioProduct(scenarioByKey(scenarioState, dateKey, ["solar_battery"]), evKwh);
  const fullKems = scenarioProduct(scenarioByKey(scenarioState, dateKey, ["kems_forecast", "kems_full"]), evKwh);
  const fullKemsAgile = scenarioProduct(agileScenario(agileState, dateKey), evKwh);
  const legacyKems = selectLegacyKemsEnergy(bill?.strategy || "", batterySolar, fullKems, fullKemsAgile);

  return {
    date: dateKey,
    canonicalChecked: true,
    billLive: bill?.liveData || null,
    billKems: bill?.kems || null,
    savingGbp: bill?.savingGbp ?? null,
    strategy: bill?.strategy || null,
    strategyLabel: bill?.strategyLabel || null,
    evKwh: Number.isFinite(evKwh) ? round(evKwh, 3) : null,
    legacyKems,
    capturedAt: new Date().toISOString(),
    source: "Home Assistant Recorder delayed KEMS evidence"
  };
}

async function currentPublicEconomics(connection) {
  if (!connection) return null;
  try {
    const ids = ["sensor.kems_system_investment", "sensor.kems_system_operating_costs"];
    const states = await Promise.all(ids.map((id) => homeAssistantJson(connection, `/api/states/${id}`).catch(() => null)));
    const investment = finite(states[0]?.state);
    const operatingCosts = finite(states[1]?.state) ?? 0;
    if (!Number.isFinite(investment)) return null;
    return {
      systemCostGbp: round(investment + operatingCosts, 2),
      investmentGbp: round(investment, 2),
      operatingCostsGbp: round(operatingCosts, 2)
    };
  } catch {
    return null;
  }
}

async function refreshPublicEvidence(rows, cutoff) {
  if (Date.now() - publicEvidenceLastRefresh < 5 * 60_000 && fs.existsSync(PUBLIC_EVIDENCE_FILE)) {
    return readJsonIfExists(PUBLIC_EVIDENCE_FILE, { version: PUBLIC_EVIDENCE_VERSION, days: {} });
  }
  if (publicEvidenceRefresh) return publicEvidenceRefresh;
  publicEvidenceRefresh = (async () => {
    const cache = readJsonIfExists(PUBLIC_EVIDENCE_FILE, { version: PUBLIC_EVIDENCE_VERSION, days: {}, economics: null });
    if (!cache || typeof cache !== "object") return { version: PUBLIC_EVIDENCE_VERSION, days: {}, economics: null };
    if (!cache.days || typeof cache.days !== "object") cache.days = {};
    cache.version = PUBLIC_EVIDENCE_VERSION;
    const connection = storedHomeAssistantConnection();
    if (!connection) return cache;

    const eligible = rows.filter((row) => row?.date <= cutoff).slice(-PUBLIC_BACKFILL_DAYS);
    const missing = eligible.filter((row) => !cache.days[row.date]?.canonicalChecked);
    const chunks = [];
    for (let index = 0; index < missing.length; index += 4) chunks.push(missing.slice(index, index + 4));
    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map(async (row) => {
        try { return await historicalEvidenceForDay(connection, row.date); }
        catch { return null; }
      }));
      for (const evidence of results.filter(Boolean)) {
        cache.days[evidence.date] = { ...(cache.days[evidence.date] || {}), ...evidence };
      }
    }
    const economics = await currentPublicEconomics(connection);
    if (economics) cache.economics = { ...economics, publishedAt: new Date().toISOString() };
    cache.updatedAt = new Date().toISOString();
    const keys = Object.keys(cache.days).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - 400))) delete cache.days[key];
    try { atomicWriteJson(PUBLIC_EVIDENCE_FILE, cache); } catch {}
    publicEvidenceLastRefresh = Date.now();
    return cache;
  })();
  try { return await publicEvidenceRefresh; }
  finally { publicEvidenceRefresh = null; }
}

function mergeProduct(base, recovered, evKwh = null) {
  const value = { ...(base && typeof base === "object" ? base : {}), ...(recovered && typeof recovered === "object" ? recovered : {}) };
  if (Number.isFinite(finite(evKwh))) value.ev = finite(evKwh);
  return Object.keys(value).length ? value : null;
}

function publicEnergyMetrics(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const metric = (key, digits = 3) => round(source[key], digits);
  const mapped = {
    homeKwh: metric("home"),
    evKwh: metric("ev"),
    gridImportKwh: metric("gridImport"),
    gridExportKwh: metric("gridExport"),
    solarKwh: metric("solar"),
    batteryChargeKwh: metric("batteryCharge"),
    batteryDischargeKwh: metric("batteryDischarge"),
    batteryExportKwh: metric("batteryExport"),
    endSocPercent: metric("endSocPercent", 1)
  };
  for (const key of Object.keys(mapped)) if (!Number.isFinite(mapped[key])) delete mapped[key];
  return Object.keys(mapped).length ? mapped : null;
}

function legacyEnergyForStrategy(row, recovered) {
  if (recovered?.legacyKems) return recovered.legacyKems;
  if (recovered?.strategy === "none") return row.products?.batterySolar || null;
  if (recovered?.strategy === "fixed") return row.products?.fullKems || null;
  if (recovered?.strategy === "agile") return row.products?.fullKemsAgile || row.simulated || null;
  return null;
}

async function publicDemoPayload() {
  let ledger = { days: {} };
  try { ledger = JSON.parse(fs.readFileSync(DAILY_LEDGER_FILE, "utf8")); } catch {}
  const cutoff = delayedCutoff();
  const rows = Object.values(ledger?.days && typeof ledger.days === "object" ? ledger.days : {})
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")) && row.date <= cutoff)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-400);
  const evidence = await refreshPublicEvidence(rows, cutoff);

  const days = rows.map((row) => {
    const recovered = evidence?.days?.[row.date] || {};
    const evKwh = finite(recovered.evKwh);
    const actualEnergy = publicEnergyMetrics(mergeProduct(row.actual, null, evKwh)) || {};
    const kemsEnergy = publicEnergyMetrics(mergeProduct(legacyEnergyForStrategy(row, recovered), null, evKwh)) || {};
    const actual = { ...actualEnergy, ...(recovered.billLive || {}) };
    const kems = { ...kemsEnergy, ...(recovered.billKems || {}) };
    if (Number.isFinite(finite(recovered.savingGbp))) kems.savingGbp = round(recovered.savingGbp, 2);
    const day = { date: row.date };
    if (Object.keys(actual).length) day.actual = actual;
    if (Object.keys(kems).length) day.kems = kems;
    if (recovered.strategyLabel) day.strategyLabel = recovered.strategyLabel;
    return day;
  }).filter((day) => day.actual || day.kems);

  return {
    schema: 2,
    property: "Demo property",
    delayed: true,
    delayDays: PUBLIC_DEMO_DELAY_DAYS,
    generatedAt: new Date().toISOString(),
    dataThrough: days.at(-1)?.date || null,
    source: "KEMS Pi retained daily ledger plus delayed Recorder evidence",
    privacy: "Sanitised daily totals only. Aggregate EV energy is included after the privacy delay; no live power, EV state/SOC, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints are published.",
    products: ["actual", "kems"],
    billBasis: "Total energy cost includes electricity and gas usage, both standing charges, export income and genuine supplier/account energy credits. Battery wear is excluded.",
    coverage: {
      actual: "retained measured energy plus delayed canonical KEMS bill evidence",
      kems: "delayed canonical KEMS bill evidence with strategy-matched replay energy where available",
      finance: "only sensor.kems_energy_cost_comparison Recorder evidence is accepted for bill totals",
      ev: "aggregate daily EV energy only, delayed by at least seven days"
    },
    economics: evidence?.economics?.systemCostGbp ? { systemCostGbp: evidence.economics.systemCostGbp } : null,
    days
  };
}

function proxy(request, response, port, pathname = request.url) {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port,
    path: pathname,
    method: request.method,
    headers: { ...request.headers },
    timeout: 30_000
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("KEMS upstream timed out.")));
  upstream.on("error", (error) => {
    if (!response.headersSent) sendJson(response, 503, { available: false, error: error.message });
    else response.destroy(error);
  });
  request.pipe(upstream);
}

// Run the existing KEMS application on loopback. The gateway owns the public
// property port, LAN-only setup surface and the deliberately tiny public-demo host.
process.env.HOST = "127.0.0.1";
process.env.PORT = String(BACKEND_PORT);
await import("./server.mjs");

const gateway = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const hostname = requestHostname(request);

  if (hostname === PUBLIC_DEMO_HOST) {
    const headers = demoCorsHeaders(request);
    if (request.method === "OPTIONS" && url.pathname === "/api/public-demo") {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    if (url.pathname !== "/api/public-demo") return sendJson(response, 404, { error: "Not found." }, headers);
    if (!["GET", "HEAD"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." }, headers);
    try {
      const payload = await publicDemoPayload();
      if (request.method === "HEAD") {
        response.writeHead(200, { ...headers, "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
        response.end();
        return;
      }
      return sendJson(response, 200, payload, headers);
    } catch (error) {
      return sendJson(response, 503, { available: false, error: error.message }, headers);
    }
  }

  if (url.pathname.startsWith("/api/remote-access/")) {
    if (!directLanManagementRequest(request)) {
      return sendJson(response, 403, { error: "Remote Access Setup is available only over a direct local-network KEMS address." });
    }
    const action = url.pathname.slice("/api/remote-access/".length);
    const routes = new Map([
      ["status", "/status"],
      ["install", "/install"],
      ["action", "/action"]
    ]);
    if (!routes.has(action)) return sendJson(response, 404, { error: "Not found." });
    if (action === "status" && request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });
    if (["install", "action"].includes(action) && request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
    return proxy(request, response, REMOTE_HELPER_PORT, routes.get(action));
  }
  return proxy(request, response, BACKEND_PORT);
});

gateway.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
  console.log(`KEMS Web.4 gateway listening on http://${PUBLIC_HOST}:${PUBLIC_PORT}; app backend http://127.0.0.1:${BACKEND_PORT}; remote setup helper loopback-only on ${REMOTE_HELPER_PORT}; delayed demo host ${PUBLIC_DEMO_HOST}`);
});
