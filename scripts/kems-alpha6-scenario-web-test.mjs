import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = new URL("..", import.meta.url);
const baseStates = JSON.parse(fs.readFileSync(new URL("fixtures/kems-alpha5-states.json", import.meta.url), "utf8"));
const haPort = 43116;
const webPort = 43117;
const now = new Date("2026-08-11T21:15:00+01:00").toISOString();

const meta = {
  no_system: ["No system", 820, 0, 41.2, 0, 0, 0, null],
  solar_only: ["Solar only", 590, 230, 31.0, 8.4, 27.8, 0, null],
  solar_battery: ["Solar + battery", 410, 410, 24.8, 1.5, 27.8, 12.7, 42],
  kems_no_export: ["KEMS no-export", 335, 485, 22.1, 0, 27.8, 16.3, 51],
  kems_full: ["Full KEMS", 205, 615, 20.4, 11.2, 27.8, 17.8, 47]
};

function summary(key, coverage = 98.7) {
  const [label, total, saving, gridImport, gridExport, solar, batteryHome, soc] = meta[key];
  const importCost = total + (key === "kems_full" ? 145 : 0);
  const exportIncome = key === "kems_full" ? 145 : key === "solar_only" ? 80 : 0;
  return {
    key, label, description: `${label} test scenario`, ready: true, samples: 288, data_coverage: coverage,
    import_cost_pence: importCost, cheap_import_cost_pence: key.includes("kems") ? 115 : 35,
    day_import_cost_pence: importCost - (key.includes("kems") ? 115 : 35), export_income_pence: exportIncome,
    power_down_income_pence: key === "kems_full" ? 18 : 0, standing_charge_pence: 33,
    energy_net_cost_pence: total - 33, total_cost_pence: total, saving_vs_no_system_pence: saving,
    day_rate_import_reduction_pence: key === "no_system" ? 0 : Math.max(0, saving - exportIncome - (key === "kems_full" ? 18 : 0) + (key.includes("kems") ? 40 : 0)),
    cheap_rate_import_change_pence: key.includes("kems") ? -40 : 0,
    house_consumption_kwh: 39.8, grid_import_kwh: gridImport, cheap_grid_import_kwh: key.includes("kems") ? 13.2 : 3.4,
    day_grid_import_kwh: gridImport - (key.includes("kems") ? 13.2 : 3.4), grid_export_kwh: gridExport,
    solar_generation_kwh: solar, solar_to_home_kwh: Math.min(solar, 15.4), solar_to_battery_kwh: key.includes("battery") || key.includes("kems") ? 9.4 : 0,
    solar_export_kwh: gridExport, solar_curtailed_kwh: key === "kems_no_export" ? 3.0 : 0,
    battery_charge_kwh: soc === null ? 0 : 18.2, battery_grid_charge_kwh: key.includes("kems") ? 9.1 : 0,
    battery_solar_charge_kwh: soc === null ? 0 : 9.1, battery_to_home_kwh: batteryHome,
    battery_export_kwh: key === "kems_full" ? 7.0 : 0, ending_soc_percent: soc
  };
}

const keys = Object.keys(meta);
function period(key, label, start, end, days, coverage) {
  return { key, label, start_date: start, end_date: end, days_included: days, cheapest_scenario: "kems_full", scenarios: keys.map((item) => summary(item, coverage)) };
}
const periods = {
  today: period("today", "Today", "2026-08-11", "2026-08-11", 1, 98.7),
  yesterday: period("yesterday", "Yesterday", "2026-08-10", "2026-08-10", 1, 99.2),
  "7_days": period("7_days", "Last 7 days", "2026-08-05", "2026-08-11", 7, 96.6),
  "30_days": period("30_days", "Last 30 days", "2026-07-13", "2026-08-11", 30, 97.3)
};
const timeline = [0, 6, 12, 18, 21].map((hour, index) => ({
  timestamp: new Date(`2026-08-11T${String(hour).padStart(2, "0")}:00:00+01:00`).toISOString(),
  no_system_cost_pence: [33, 180, 390, 680, 820][index],
  solar_only_cost_pence: [33, 170, 300, 510, 590][index],
  solar_battery_cost_pence: [33, 145, 220, 350, 410][index],
  kems_no_export_cost_pence: [33, 120, 180, 290, 335][index],
  kems_full_cost_pence: [33, 105, 145, 190, 205][index]
}));

function entity(entity_id, state, attributes) {
  return { entity_id, state: String(state), attributes: { friendly_name: entity_id, ...attributes }, last_changed: now, last_updated: now };
}
const scenarioStates = [
  entity("sensor.kems_scenario_comparison_today", "Full KEMS", { generated_at: now, periods, timeline }),
  entity("sensor.kems_scenario_comparison_yesterday", "Full KEMS", periods.yesterday),
  entity("sensor.kems_scenario_comparison_7_days", "Full KEMS", periods["7_days"]),
  entity("sensor.kems_scenario_comparison_30_days", "Full KEMS", periods["30_days"]),
  entity("sensor.kems_compare_no_system_cost_today", 820, { unit_of_measurement: "p", ...summary("no_system") }),
  entity("sensor.kems_compare_solar_only_cost_today", 590, { unit_of_measurement: "p", ...summary("solar_only") }),
  entity("sensor.kems_compare_solar_and_battery_cost_today", 410, { unit_of_measurement: "p", ...summary("solar_battery") }),
  entity("sensor.kems_compare_kems_no_export_cost_today", 335, { unit_of_measurement: "p", ...summary("kems_no_export") }),
  entity("sensor.kems_compare_full_kems_cost_today", 205, { unit_of_measurement: "p", ...summary("kems_full") })
];
const states = [...baseStates.filter((item) => !scenarioStates.some((scenario) => scenario.entity_id === item.entity_id)), ...scenarioStates];

const ha = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/states") return res.end(JSON.stringify(states));
  if (req.url === "/api/config") return res.end(JSON.stringify({ version: "2026.8.1", location_name: "Scenario test" }));
  res.statusCode = 404; res.end(JSON.stringify({ error: "not found" }));
});
await new Promise((resolve) => ha.listen(haPort, "127.0.0.1", resolve));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kems-alpha6-scenarios-"));
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(webPort), HOST: "127.0.0.1", DATA_DIR: dataDir, HA_URL: `http://127.0.0.1:${haPort}`, HA_TOKEN: "test-token-0123456789abcdef", KEMS_MANAGER_URL: "http://127.0.0.1:43999" },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = ""; child.stdout.on("data", (c) => output += c); child.stderr.on("data", (c) => output += c);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(150);
    try { const health = await fetch(`http://127.0.0.1:${webPort}/api/health`).then((r) => r.json()); if (health.connected) { ready = true; break; } } catch {}
  }
  if (!ready) throw new Error(`KEMS Web did not connect to fake alpha6 Home Assistant.\n${output}`);
  const data = await fetch(`http://127.0.0.1:${webPort}/api/scenarios`).then((r) => r.json());
  if (!data.available) throw new Error("Scenario API should be available.");
  if (Object.keys(data.periods).length !== 4) throw new Error(`Expected four periods, got ${Object.keys(data.periods).length}.`);
  if (data.periods.today.scenarios.length !== 5) throw new Error("Expected five Today scenarios.");
  if (data.periods.today.cheapest_scenario !== "kems_full") throw new Error("Full KEMS should be cheapest in fixture.");
  if (data.timeline.length !== 5) throw new Error("Expected complete Today cumulative timeline.");
  if (data.periods["30_days"].days_included !== 30) throw new Error("30-day rollup missing.");
  if (Math.abs(data.periods["7_days"].data_coverage - 96.6) > 0.01) throw new Error("Scenario replay coverage was not preserved.");
  const full = data.periods.today.scenarios.find((item) => item.key === "kems_full");
  if (!full || full.saving_vs_no_system_pence !== 615 || full.battery_export_kwh !== 7) throw new Error("Full KEMS scenario detail was not preserved.");
  const decomposition = full.day_rate_import_reduction_pence + full.cheap_rate_import_change_pence + full.export_income_pence + full.power_down_income_pence;
  if (Math.abs(decomposition - full.saving_vs_no_system_pence) > 0.01) throw new Error("Full KEMS saving decomposition does not reconcile.");
  console.log(`Alpha6 scenario web test passed: ${data.periods.today.scenarios.length} scenarios, ${data.timeline.length} timeline points, 4 periods.`);
} finally {
  child.kill("SIGTERM");
  ha.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
