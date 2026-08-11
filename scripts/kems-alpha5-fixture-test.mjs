import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const states = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "kems-alpha5-states.json"), "utf8"));
const haPort = 23000 + (process.pid % 5000);
const sitePort = haPort + 1;
const token = "alpha5-fixture-long-lived-access-token-123456789";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kems-alpha5-web-"));
const now = new Date();
const seedLedger = { version: 1, days: {} };
for (let day = 27; day <= 31; day += 1) {
  const date = `2026-07-${String(day).padStart(2, "0")}`;
  seedLedger.days[date] = { date, actual: { home: 20 + day, gridImport: 20 + day, importCost: 5 }, simulated: {}, updatedAt: `${date}T20:00:00+01:00` };
}
for (let day = 1; day <= 10; day += 1) {
  const date = `2026-08-${String(day).padStart(2, "0")}`;
  seedLedger.days[date] = { date, actual: { home: 20 + day, gridImport: 20 + day, importCost: 5 }, simulated: {}, updatedAt: `${date}T20:00:00+01:00` };
}
fs.writeFileSync(path.join(dataDir, "energy-ledger.json"), JSON.stringify(seedLedger));

const ha = http.createServer((request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({ message: "Unauthorized" }));
  }
  const url = new URL(request.url, `http://127.0.0.1:${haPort}`);
  if (url.pathname === "/api/config") {
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({ location_name: "KEMS Alpha5 Test Home", version: "2026.8.0", time_zone: "Europe/London" }));
  }
  if (url.pathname === "/api/states") {
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify(states));
  }
  if (url.pathname.startsWith("/api/history/period/")) {
    const ids = (url.searchParams.get("filter_entity_id") || "").split(",").filter(Boolean);
    const result = ids.map((id) => {
      const source = states.find((item) => item.entity_id === id);
      if (!source) return [];
      const base = Number.parseFloat(source.state);
      return Array.from({ length: 42 }, (_, index) => {
        let value = Number.isFinite(base) ? base * (0.9 + ((index % 9) / 100)) : source.state;
        if (id === "sensor.kems_export_tariff_status") value = index < 28 ? "active" : "awaiting";
        if (id === "binary_sensor.kems_no_export_mode_active") value = index < 28 ? "off" : "on";
        if (id === "sensor.kems_simulation_strategy") value = index < 28 ? "export" : "self_use";
        const at = new Date(now.getTime() - (41 - index) * 20 * 60 * 1000).toISOString();
        return { ...source, state: String(value), last_changed: at, last_updated: at };
      });
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify(result));
  }
  response.writeHead(404).end();
});
ha.on("upgrade", (_request, socket) => socket.destroy());
await new Promise((resolve) => ha.listen(haPort, "127.0.0.1", resolve));

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: path.join(here, ".."),
  env: { ...process.env, PORT: String(sitePort), HOST: "127.0.0.1", DATA_DIR: dataDir, HA_URL: "", HA_TOKEN: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let ready = false;
  for (let i = 0; i < 45; i += 1) {
    await sleep(150);
    try { if ((await fetch(`http://127.0.0.1:${sitePort}/api/health`)).ok) { ready = true; break; } } catch {}
  }
  if (!ready) throw new Error(`Website failed to start.\n${output}`);
  const tested = await fetch(`http://127.0.0.1:${sitePort}/api/setup/test`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `http://127.0.0.1:${haPort}`, token })
  }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; });
  if (tested.kemsEntityCount !== 236) throw new Error(`Expected 236 alpha5 entities, got ${tested.kemsEntityCount}`);
  await fetch(`http://127.0.0.1:${sitePort}/api/setup/connection`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `http://127.0.0.1:${haPort}`, token, remember: true })
  }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b; });

  const [live, day, week, month, year, all, js, css] = await Promise.all([
    fetch(`http://127.0.0.1:${sitePort}/api/live`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/analytics?range=day`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/analytics?range=week`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/analytics?range=month`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/analytics?range=year`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/analytics?range=all`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/app.js`).then((r) => r.text()),
    fetch(`http://127.0.0.1:${sitePort}/styles.css`).then((r) => r.text())
  ]);

  if (live.metrics.housePower !== 1.57) throw new Error(`Unexpected alpha5 house load ${live.metrics.housePower}`);
  if (!live.alpha5?.noExportModeActive || live.alpha5?.exportTariffActive) throw new Error("Alpha5 awaiting-export policy was not detected.");
  if (live.simulation?.exportTariffStatus !== "awaiting") throw new Error("Export tariff status missing.");
  if (live.simulation?.solarToBatteryPower !== 0) throw new Error("Solar-to-battery power mapping failed.");
  if (live.simulation?.batterySoc !== 55) throw new Error("Simulated battery SOC mapping failed.");
  if (!day.nativePeriod || Math.abs(day.actual.totals.gridImport - 32.112) > 0.001) throw new Error("Alpha5 native today ledger failed.");
  if (!day.policyEvents?.some((event) => event.label.includes("Export tariff") && event.label.includes("Awaiting"))) throw new Error("Alpha5 policy-change history marker was not produced.");

  const expected = {
    week: { gridImport: 32.112, cost: 5.7539 },
    month: { gridImport: 302.369, cost: 57.9139 },
    year: { gridImport: 302.369, cost: 57.9139 },
    all: { gridImport: 302.369, cost: 57.9139 }
  };
  for (const result of [week, month, year, all]) {
    if (!result.nativePeriod) throw new Error(`${result.range} did not use the alpha5 native period ledger.`);
    if (!result.series?.length) throw new Error(`${result.range} chart fallback is empty.`);
    if (Math.abs(result.actual.totals.gridImport - expected[result.range].gridImport) > 0.001) throw new Error(`${result.range} grid import mismatch.`);
    if (Math.abs(result.actual.totals.netCost - expected[result.range].cost) > 0.001) throw new Error(`${result.range} cost mismatch: ${result.actual.totals.netCost}`);
    if (!Number.isFinite(result.simulated?.totals?.gridImport)) throw new Error(`${result.range} simulated period totals missing.`);
    const outOfRange = (result.series || []).some((row) => {
      const date = row.date || new Date(row.at).toISOString().slice(0, 10);
      return result.nativePeriod.startDate && result.nativePeriod.endDate && (date < result.nativePeriod.startDate || date > result.nativePeriod.endDate);
    });
    if (outOfRange) throw new Error(`${result.range} chart leaked a baseline bucket outside the native alpha5 period.`);
  }
  if (!js.includes("Awaiting export tariff") || !js.includes("solarBatteryCurve") || !js.includes("Alpha5 period ledger") || !js.includes("chart-event-list") || !js.includes("KEMS Pi server")) throw new Error("Alpha5/web.5 frontend features missing.");
  if (!css.includes(".alpha5-status-strip") || !css.includes(".alpha5-solar-battery")) throw new Error("Alpha5 styling missing.");
  const saved = fs.readFileSync(path.join(dataDir, "connection.enc.json"), "utf8");
  if (saved.includes(token)) throw new Error("Token was stored in plaintext.");
  const backupResponse = await fetch(`http://127.0.0.1:${sitePort}/api/system/backup`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "fixture-backup-password" })
  });
  if (!backupResponse.ok) throw new Error(`Encrypted backup endpoint failed: ${backupResponse.status}`);
  const backup = Buffer.from(await backupResponse.arrayBuffer());
  if (backup.subarray(0, 8).toString("ascii") !== "KEMSBK01" || backup.includes(Buffer.from(token))) throw new Error("Encrypted backup format/security check failed.");
  const restoreResponse = await fetch(`http://127.0.0.1:${sitePort}/api/system/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-KEMS-Backup-Password": encodeURIComponent("fixture-backup-password") },
    body: backup
  });
  if (!restoreResponse.ok) throw new Error(`Encrypted restore endpoint failed: ${restoreResponse.status}`);
  console.log(`KEMS alpha5 fixture passed: ${tested.kemsEntityCount} entities, native Day/Week/Month/Year/All-time totals, policy markers, filtered chart periods and encrypted backup/restore verified.`);
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => ha.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
