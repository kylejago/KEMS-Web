import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_PORT = Number.parseInt(process.env.PORT || "4173", 10) || 4173;
const BACKEND_PORT = Number.parseInt(process.env.KEMS_BACKEND_PORT || String(PUBLIC_PORT + 3), 10) || (PUBLIC_PORT + 3);
const REMOTE_HELPER_PORT = Number.parseInt(process.env.KEMS_REMOTE_ACCESS_PORT || "4175", 10) || 4175;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const DAILY_LEDGER_FILE = path.join(DATA_DIR, "energy-ledger.json");
const PUBLIC_DEMO_HOST = String(process.env.KEMS_PUBLIC_DEMO_HOST || "demo-api.kems.uk").trim().toLowerCase();
const PUBLIC_DEMO_DELAY_DAYS = 7;
const PUBLIC_DEMO_ORIGINS = new Set(["https://kems.uk", "https://www.kems.uk"]);

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

function publicProductMetrics(source, actualNetCost = null) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const metric = (key, digits = 3) => round(source[key], digits);
  const mapped = {
    homeKwh: metric("home"),
    gridImportKwh: metric("gridImport"),
    gridExportKwh: metric("gridExport"),
    solarKwh: metric("solar"),
    batteryChargeKwh: metric("batteryCharge"),
    batteryDischargeKwh: metric("batteryDischarge"),
    batteryExportKwh: metric("batteryExport"),
    netCostGbp: metric("netCost", 2),
    exportIncomeGbp: metric("exportIncome", 2),
    endSocPercent: metric("endSocPercent", 1)
  };
  if (Number.isFinite(actualNetCost) && Number.isFinite(mapped.netCostGbp)) mapped.savingGbp = round(actualNetCost - mapped.netCostGbp, 2);
  for (const key of Object.keys(mapped)) if (!Number.isFinite(mapped[key])) delete mapped[key];
  return Object.keys(mapped).length ? mapped : null;
}

function publicDemoPayload() {
  let ledger = { days: {} };
  try { ledger = JSON.parse(fs.readFileSync(DAILY_LEDGER_FILE, "utf8")); } catch {}
  const cutoff = delayedCutoff();
  const rows = Object.values(ledger?.days && typeof ledger.days === "object" ? ledger.days : {})
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")) && row.date <= cutoff)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-400);

  const days = rows.map((row) => {
    const actual = publicProductMetrics(row.actual);
    const actualNetCost = actual?.netCostGbp ?? null;
    const batterySolar = publicProductMetrics(row.products?.batterySolar, actualNetCost);
    const fullKems = publicProductMetrics(row.products?.fullKems, actualNetCost);
    const fullKemsAgile = publicProductMetrics(row.products?.fullKemsAgile || row.simulated, actualNetCost);
    const day = { date: row.date };
    if (actual) day.actual = actual;
    if (batterySolar) day.batterySolar = batterySolar;
    if (fullKems) day.fullKems = fullKems;
    if (fullKemsAgile) day.fullKemsAgile = fullKemsAgile;
    const candidates = [
      [batterySolar?.netCostGbp, "Battery & Solar"],
      [fullKems?.netCostGbp, "Full KEMS"],
      [fullKemsAgile?.netCostGbp, "Full KEMS Agile"]
    ].filter(([cost]) => Number.isFinite(cost)).sort((a, b) => a[0] - b[0]);
    if (candidates[0]) day.winner = candidates[0][1];
    return day;
  }).filter((day) => day.actual || day.batterySolar || day.fullKems || day.fullKemsAgile);

  return {
    schema: 1,
    property: "Demo property",
    delayed: true,
    delayDays: PUBLIC_DEMO_DELAY_DAYS,
    generatedAt: new Date().toISOString(),
    dataThrough: days.at(-1)?.date || null,
    source: "KEMS Pi retained daily ledger",
    privacy: "Sanitised daily totals only. No live power, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints.",
    coverage: {
      actual: "retained measured daily totals",
      fullKemsAgile: "retained KEMS simulation when available",
      otherProducts: "published only when product-specific daily evidence exists"
    },
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

const gateway = http.createServer((request, response) => {
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
    const payload = publicDemoPayload();
    if (request.method === "HEAD") {
      response.writeHead(200, { ...headers, "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      response.end();
      return;
    }
    return sendJson(response, 200, payload, headers);
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
  console.log(`KEMS Web.19 gateway listening on http://${PUBLIC_HOST}:${PUBLIC_PORT}; app backend http://127.0.0.1:${BACKEND_PORT}; remote setup helper loopback-only on ${REMOTE_HELPER_PORT}; delayed demo host ${PUBLIC_DEMO_HOST}`);
});
