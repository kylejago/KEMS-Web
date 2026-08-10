import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const haPort = 20000 + (process.pid % 10000);
const sitePort = haPort + 1;
const now = new Date();
const token = "fixture-long-lived-access-token-1234567890";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kems-live-"));

const baseEntities = [
  ["sensor.kems_status", "Learning", {}],
  ["sensor.kems_phase", "Learn", {}],
  ["sensor.kems_advice", "Keep high-load tasks for the next cheap period", { description: "Based on the current import rate and learned household demand." }],
  ["sensor.kems_house_load", "0.62", { unit_of_measurement: "kW", friendly_name: "KEMS House Load" }],
  ["sensor.kems_typical_house_load_now", "0.71", { unit_of_measurement: "kW" }],
  ["sensor.kems_grid_import_power", "0.62", { unit_of_measurement: "kW" }],
  ["sensor.kems_grid_export_power", "0.0", { unit_of_measurement: "kW" }],
  ["sensor.kems_grid_net_power", "0.62", { unit_of_measurement: "kW" }],
  ["sensor.kems_grid_flow_direction", "importing", {}],
  ["sensor.kems_ev_charging_power", "0.0", { unit_of_measurement: "kW" }],
  ["sensor.kems_ev_state_of_charge", "64", { unit_of_measurement: "%" }],
  ["sensor.kems_current_import_rate", "28.3", { unit_of_measurement: "p/kWh" }],
  ["sensor.kems_next_import_rate", "3.49", { unit_of_measurement: "p/kWh" }],
  ["sensor.kems_data_quality", "97", { unit_of_measurement: "%" }],
  ["sensor.kems_history_samples", "15320", { unit_of_measurement: "samples" }],
  ["sensor.kems_learning_confidence", "74", { unit_of_measurement: "%" }],
  ["sensor.kems_observed_grid_import_today", "8.42", { unit_of_measurement: "kWh" }],
  ["sensor.kems_observed_grid_export_today", "0.0", { unit_of_measurement: "kWh" }],
  ["sensor.kems_observed_cost_today", "1.84", { unit_of_measurement: "GBP" }],
  ["sensor.kems_simulated_kems_cost_today", "1.12", { unit_of_measurement: "GBP" }],
  ["sensor.kems_simulated_saving_today", "0.72", { unit_of_measurement: "GBP" }],
  ["sensor.kems_simulated_battery_state_of_charge", "58", { unit_of_measurement: "%" }],
  ["sensor.kems_simulated_solar_power", "0.0", { unit_of_measurement: "kW" }],
  ["sensor.kems_simulated_solar_generation_today", "0.0", { unit_of_measurement: "kWh" }],
  ["sensor.kems_predicted_annual_saving", "372.44", { unit_of_measurement: "GBP" }],
  ["binary_sensor.kems_ev_connected", "on", {}],
  ["binary_sensor.kems_ev_charging", "off", {}],
  ["binary_sensor.kems_off_peak", "off", {}],
  ["binary_sensor.kems_intelligent_slot", "off", {}],
  ["binary_sensor.kems_cheap_period_confirmed", "off", {}],
  ["binary_sensor.kems_battery_data_available", "off", {}],
  ["binary_sensor.kems_proposal_solar_model_active", "on", {}],
  ["binary_sensor.kems_learning_ready", "on", {}],
  ["binary_sensor.kems_simulation_ready", "on", {}],
  ["binary_sensor.kems_simulation_shows_a_saving", "on", {}],
  ["binary_sensor.kems_roi_prediction_ready", "on", {}],
  ["binary_sensor.kems_grid_import_outside_cheap_period", "on", {}]
];
while (baseEntities.length < 115) {
  const index = baseEntities.length + 1;
  baseEntities.push([`sensor.kems_fixture_metric_${String(index).padStart(3, "0")}`, String(index), { friendly_name: `KEMS Fixture Metric ${index}` }]);
}
const states = baseEntities.map(([entity_id, state, attributes]) => ({
  entity_id, state, attributes, last_changed: now.toISOString(), last_updated: now.toISOString()
}));

const haServer = http.createServer((request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({ message: "Unauthorized" }));
  }
  const url = new URL(request.url, `http://127.0.0.1:${haPort}`);
  if (url.pathname === "/api/config") {
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({ location_name: "KEMS Test Home", version: "2026.8.0", time_zone: "Europe/London" }));
  }
  if (url.pathname === "/api/states") {
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify(states));
  }
  if (url.pathname.startsWith("/api/history/period/")) {
    const ids = (url.searchParams.get("filter_entity_id") || "").split(",").filter(Boolean);
    const result = ids.map((id) => {
      const entity = states.find((item) => item.entity_id === id);
      if (!entity) return [];
      return Array.from({ length: 24 }, (_, index) => ({
        entity_id: id,
        state: entity.state,
        attributes: entity.attributes,
        last_changed: new Date(now.getTime() - (23 - index) * 60 * 60 * 1000).toISOString(),
        last_updated: new Date(now.getTime() - (23 - index) * 60 * 60 * 1000).toISOString()
      }));
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify(result));
  }
  response.writeHead(404).end();
});
await new Promise((resolve) => haServer.listen(haPort, "127.0.0.1", resolve));

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PORT: String(sitePort),
    HOST: "127.0.0.1",
    DATA_DIR: dataDir,
    HA_URL: "",
    HA_TOKEN: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(200);
    try {
      const response = await fetch(`http://127.0.0.1:${sitePort}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
  }
  if (!ready) throw new Error(`Website did not become ready.\n${output}`);

  const test = await fetch(`http://127.0.0.1:${sitePort}/api/setup/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `http://127.0.0.1:${haPort}`, token })
  }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Connection test failed");
    return body;
  });
  if (test.kemsEntityCount !== 115) throw new Error(`Setup test expected 115 KEMS entities, got ${test.kemsEntityCount}.`);

  const saved = await fetch(`http://127.0.0.1:${sitePort}/api/setup/connection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `http://127.0.0.1:${haPort}`, token, remember: true })
  }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Saving connection failed");
    return body;
  });
  if (!saved.configured || !saved.connected) throw new Error("Saved setup did not become connected.");
  if (!fs.existsSync(path.join(dataDir, "connection.enc.json"))) throw new Error("Encrypted connection file was not created.");
  const savedText = fs.readFileSync(path.join(dataDir, "connection.enc.json"), "utf8");
  if (savedText.includes(token)) throw new Error("The token was stored in plaintext.");

  const [config, live, catalog, history, setup] = await Promise.all([
    fetch(`http://127.0.0.1:${sitePort}/api/config`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/live`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/entity-catalog`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/history?hours=24`).then((r) => r.json()),
    fetch(`http://127.0.0.1:${sitePort}/api/setup/status`).then((r) => r.json())
  ]);
  if (config.dataMode !== "home-assistant") throw new Error("Expected Home Assistant live mode.");
  if (config.discoveredKemsEntityCount !== 115) throw new Error(`Expected 115 discovered entities, got ${config.discoveredKemsEntityCount}.`);
  if (catalog.entities.length !== 115) throw new Error(`Expected 115 catalog entities, got ${catalog.entities.length}.`);
  if (live.source !== "home-assistant-kems") throw new Error(`Unexpected source ${live.source}.`);
  if (live.metrics.housePower !== 0.62) throw new Error("House load was not read from sensor.kems_house_load.");
  if (live.metrics.gridImportPower !== 0.62 || live.metrics.gridExportPower !== 0) throw new Error("Grid import/export metrics are incorrect.");
  if (live.metrics.batteryDataAvailable !== false || live.metrics.batterySoc !== null) throw new Error("Physical battery data should remain unavailable.");
  if (live.simulation?.batterySoc !== 58) throw new Error("Simulated battery SOC was not kept in the simulation data class.");
  if (live.metrics.solarPower !== null || live.simulation?.solarPower !== 0) throw new Error("Live and simulated solar were not separated correctly.");
  if (!live.availability?.liveGrid || !live.availability?.liveHome || !live.availability?.liveEvPower) throw new Error("Available live signals were not marked as live.");
  if (live.availability?.liveSolar || live.availability?.liveBattery) throw new Error("Unavailable physical solar or battery was incorrectly marked live.");
  if (live.metrics.modelConfidence !== 74 || live.metrics.dataQuality !== 97) throw new Error("KEMS learning metrics are incorrect.");
  if (!live.readiness.learning || !live.readiness.simulation || !live.readiness.roi) throw new Error("KEMS readiness sensors were not read.");
  if (!Array.isArray(history) || history.length < 100) throw new Error("Recorder history was not normalised.");
  if (!("solarLive" in history[0]) || !("solarSimulated" in history[0]) || !("socLive" in history[0]) || !("socSimulated" in history[0])) throw new Error("History provenance fields are missing.");
  if (history.some((point) => point.solarLive !== null || point.socLive !== null)) throw new Error("Unavailable physical solar or battery history was populated.");
  if (!history.some((point) => point.solarSimulated === 0 || point.socSimulated === 58)) throw new Error("Simulated history was not retained separately.");
  if ("token" in setup) throw new Error("Setup status exposed the token.");

  console.log(`KEMS live fixture passed: setup connected, ${catalog.entities.length} existing entities, live/simulated separation verified, ${history.length} history points.`);
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => haServer.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
