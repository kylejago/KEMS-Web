import { displayFlowAction, isHistoricalRuntimeGap } from "./flow-presentation-model.js?v=build3";

const app = document.querySelector("#agile-app");
const pill = document.querySelector("#connection-pill");
const refreshButton = document.querySelector("#refresh-button");
let stream;
let snapshot;

const IDS = Object.freeze({
  slots: "sensor.kems_agile_slots",
  bill: "sensor.kems_energy_cost_comparison",
  status: "sensor.kems_status",
  operatingMode: "select.kems_operating_mode",
  systemType: "select.kems_system_type",
  exportTariff: "select.kems_export_tariff",
  advice: "sensor.kems_advice",
  rolling: "sensor.kems_agile_rolling_export_plan",
  dispatchMode: "sensor.kems_agile_dispatch_mode",
  exportTarget: "sensor.kems_agile_battery_export_target_now",
  dischargeTarget: "sensor.kems_agile_battery_discharge_target_now",
  horizon: "sensor.kems_agile_price_horizon_status",
  partial: "sensor.kems_agile_partial_horizon_dispatch",
  shadowStatus: "sensor.kems_agile_shadow_status",
  shadowCommand: "sensor.kems_agile_shadow_command",
  shadowSafety: "sensor.kems_agile_shadow_safety",
  simulatedHouse: "sensor.kems_simulated_house_load_power",
  simulatedSolar: "sensor.kems_simulated_solar_power",
  simulatedGridImport: "sensor.kems_simulated_grid_import_power",
  simulatedGridExport: "sensor.kems_simulated_grid_export_power",
  simulatedBattery: "sensor.kems_simulated_battery_power",
  simulatedSoc: "sensor.kems_simulated_battery_state_of_charge",
  simulatedSolarToBattery: "sensor.kems_simulated_solar_to_battery_power",
  simulatedBatteryToHome: "sensor.kems_simulated_battery_to_home_power",
  simulatedBatteryExport: "sensor.kems_simulated_battery_export_power",
  simulatedGridImportToday: "sensor.kems_simulated_grid_import_today",
  simulatedGridExportToday: "sensor.kems_simulated_grid_export_today",
  simulatedSolarToday: "sensor.kems_simulated_solar_generation_today",
  simulatedBatteryChargeToday: "sensor.kems_simulated_battery_charged_today",
  simulatedBatteryChargeTodayAlt: "sensor.kems_simulated_battery_charge_today",
  simulatedBatteryToHomeToday: "sensor.kems_simulated_battery_to_home_today",
  simulatedBatteryExportToday: "sensor.kems_simulated_battery_export_today",
  simulatedExportIncomeToday: "sensor.kems_simulated_export_income_today",
  forecastSolarTomorrow: "sensor.kems_forecast_solar_tomorrow",
  forecastHouseTomorrow: "sensor.kems_forecast_house_demand_tomorrow",
  forecastMorningSoc: "sensor.kems_forecast_required_morning_soc",
  forecastMaximumOvernightSoc: "sensor.kems_forecast_maximum_overnight_soc",
  forecastAdditionalCheap: "sensor.kems_forecast_additional_cheap_time_required",
  forecastSolarRecovery: "sensor.kems_forecast_solar_recovery_target",
  hoursUntilCheap: "sensor.kems_hours_until_next_cheap_period",
  exportableBattery: "sensor.kems_exportable_battery_energy_remaining",
  targetBatteryExport: "sensor.kems_target_battery_export_power",
  sourceValidation: "sensor.kems_source_validation",
  dataQuality: "sensor.kems_data_quality",
  accumulatorStatus: "sensor.kems_accumulator_status",
  simulationReady: "binary_sensor.kems_simulation_ready",
  panelStatus: "sensor.kems_panel_management_status",
  controlPreflight: "sensor.kems_control_preflight",
  controlPlanSafe: "binary_sensor.kems_control_plan_safe",
  realBackend: "binary_sensor.kems_real_control_backend_available",
  commandsPermitted: "binary_sensor.kems_control_commands_permitted",
  commissioning: "sensor.kems_commissioning_readiness",
  controlBlocked: "sensor.kems_control_blocked_reason"
});

const FLOW_FIELDS = Object.freeze({
  grid: Object.freeze({ action: "flow_grid_action", value: "flow_grid_kwh" }),
  solar: Object.freeze({ action: "flow_solar_action", value: "flow_solar_kwh" }),
  battery: Object.freeze({ action: "flow_battery_action", value: "flow_battery_kwh" }),
});
const FLOW_SOC_FIELD = "flow_estimated_soc_percent";
const FLOW_SCOPE_FIELD = "flow_scope";
const FLOW_BASIS_FIELD = "flow_basis";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function fmt(value, unit = "", digits = 2) {
  const parsed = number(value);
  return parsed === null ? "—" : `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(parsed)}${unit ? ` ${unit}` : ""}`;
}
function moneyPence(value) {
  const parsed = number(value);
  return parsed === null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed / 100);
}
function signedCredit(value) {
  const parsed = number(value);
  return parsed === null ? "—" : `−${moneyPence(Math.abs(parsed))}`;
}
function entity(id) {
  return snapshot?.entities?.find((item) => item.entityId === id) || null;
}
function state(id, fallback = "Unavailable") {
  const item = entity(id);
  return item?.available ? String(item.state) : fallback;
}
function attr(id, key, fallback = null) {
  return entity(id)?.attributes?.[key] ?? fallback;
}
function entityNumber(id) {
  return entity(id)?.available ? number(entity(id)?.state) : null;
}
function firstEntityNumber(...ids) {
  for (const id of ids) {
    const value = entityNumber(id);
    if (value !== null) return value;
  }
  return null;
}
function tone(value) {
  const text = String(value || "").toLowerCase();
  if (["on", "ready", "healthy", "pass", "passed", "active", "success"].some((word) => text.includes(word))) return "good";
  if (["fail", "error", "unsafe"].some((word) => text.includes(word))) return "danger";
  return "attention";
}
function badge(text) {
  return `<span class="agile-badge ${tone(text)}">${escapeHtml(text)}</span>`;
}
function metric(label, value, detail = "") {
  return `<article class="agile-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</article>`;
}
function boolWord(value) {
  return value === true ? "PASS" : value === false ? "FAIL" : "—";
}
function billContract() {
  return entity(IDS.bill)?.attributes || {};
}
function billPeriod(key) {
  return billContract()?.periods?.[key] || null;
}
function rollingAttrs() {
  return entity(IDS.rolling)?.attributes || {};
}
function slotAttrs() {
  return entity(IDS.slots)?.attributes || {};
}
function actionsLabel(slot = {}) {
  const raw = Array.isArray(slot.actions) ? slot.actions.join(", ") : String(slot.actions || slot.action || "—");
  const text = raw.toLowerCase();
  if (text.includes("cheap charge")) return "Cheap charge";
  if (text.includes("maximum discharge")) return "Max discharge";
  if (text.includes("deadline")) return "Deadline export";
  if (text.includes("export battery")) return "Battery export";
  if (text.includes("store solar")) return "Store solar";
  if (text.includes("battery to home") || text.includes("battery → home")) return "Battery → home";
  return raw.length > 42 ? `${raw.slice(0, 39)}…` : raw;
}
function fallbackRoutes(routes) {
  const active = routes
    .filter(([value]) => (number(value) || 0) > 0.0005)
    .map(([, label]) => label === "EXPO" ? "EXPORT" : label);
  return active.length ? active.join("/") : "IDLE";
}
function flowValue(slot, prefix) {
  const field = FLOW_FIELDS[prefix];
  const canonical = number(field ? slot[field.value] : null);
  if (canonical !== null) return canonical;
  if (prefix === "grid") {
    return (number(slot.grid_import_kwh) || 0) + (number(slot.grid_export_kwh) || 0);
  }
  if (prefix === "solar") {
    const generation = number(slot.solar_generation_kwh);
    if (generation !== null) return generation;
    return (number(slot.solar_to_home_kwh) || 0) + (number(slot.solar_to_battery_kwh) || 0) + (number(slot.solar_export_kwh) || 0);
  }
  return (number(slot.battery_to_home_kwh) || 0) + (number(slot.battery_export_kwh) || 0) + (number(slot.flow_battery_charge_kwh) || 0);
}
function flowAction(slot, prefix) {
  const field = FLOW_FIELDS[prefix];
  const canonical = field ? slot[field.action] : null;
  if (canonical) return displayFlowAction(canonical, prefix);
  if (prefix === "grid") {
    return fallbackRoutes([[slot.grid_import_kwh, "IMPORT"], [slot.grid_export_kwh, "EXPO"]]);
  }
  if (prefix === "solar") {
    return fallbackRoutes([[slot.solar_to_home_kwh, "HOME"], [slot.solar_to_battery_kwh, "BATTERY"], [slot.solar_export_kwh, "EXPO"]]);
  }
  return fallbackRoutes([[slot.flow_battery_charge_kwh, "CHARGE"], [slot.battery_to_home_kwh, "HOME"], [slot.battery_export_kwh, "EXPO"]]);
}
function flowCell(slot, prefix) {
  if (isHistoricalRuntimeGap(slot)) {
    return '<span title="No retained KEMS sample"><b>NO DATA</b> · —</span>';
  }
  const action = flowAction(slot, prefix);
  const value = flowValue(slot, prefix);
  const scope = String(slot[FLOW_SCOPE_FIELD] || "full slot");
  const scopeText = scope === "remaining slot" ? " <small>remaining</small>" : "";
  const basis = escapeHtml(slot[FLOW_BASIS_FIELD] || "legacy KEMS slot fields");
  return `<span title="${basis}"><b>${escapeHtml(action)}</b> · ${fmt(value, "kWh", 2)}${scopeText}</span>`;
}
function slotRows(slots, start, end) {
  return (Array.isArray(slots) ? slots : []).slice(start, end);
}
function slotTable(title, slots, start, end, emptyText) {
  const rows = slotRows(slots, start, end);
  return `<section class="agile-card agile-slot-block"><h3>${escapeHtml(title)}</h3>${rows.length ? `<div class="agile-table-wrap"><table class="agile-table agile-slot-table agile-flow-table"><thead><tr><th>Time</th><th>Price</th><th>Est. SOC</th><th>Grid</th><th>Solar</th><th>Battery</th></tr></thead><tbody>${rows.map((slot) => {
    const soc = isHistoricalRuntimeGap(slot)
      ? "—"
      : fmt(slot[FLOW_SOC_FIELD] ?? slot.ending_soc_percent, "%", 1);
    return `<tr><td>${escapeHtml(slot.label || "—")}</td><td>${fmt(slot.rate_pence, "p/kWh", 2)}</td><td>${soc}</td><td>${flowCell(slot, "grid")}</td><td>${flowCell(slot, "solar")}</td><td>${flowCell(slot, "battery")}</td></tr>`;
  }).join("")}</tbody></table></div>` : `<div class="empty">${escapeHtml(emptyText)}</div>`}</section>`;
}
function slotPlan(day, slots) {
  const prefix = day === "Today" ? "Today" : "Tomorrow";
  return `<div class="agile-slot-grid agile-slot-grid-full">${slotTable(`${prefix} — 00:00 to 23:30`, slots, 0, 48, `${prefix}'s plan is not available yet.`)}</div>`;
}
function tomorrowSummary(slots, slotsState) {
  const rows = Array.isArray(slots) ? slots : [];
  const totals = rows.reduce((acc, slot) => {
    acc.import += number(slot.grid_import_kwh) || 0;
    acc.export += number(slot.grid_export_kwh) || 0;
    acc.batteryExport += number(slot.battery_export_kwh) || 0;
    acc.income += (number(slot.rate_pence) || 0) * (number(slot.grid_export_kwh) || 0);
    if (number(slot.ending_soc_percent) !== null) acc.endSoc = number(slot.ending_soc_percent);
    return acc;
  }, { import: 0, export: 0, batteryExport: 0, income: 0, endSoc: null });
  return `<div class="agile-grid">
    ${metric("Price publication", slotsState.tomorrow_status || "Waiting for publication", `${rows.length}/${slotsState.tomorrow_expected || 48} published slots`)}
    ${metric("Forecast house demand", fmt(entityNumber(IDS.forecastHouseTomorrow), "kWh", 2), "Tomorrow")}
    ${metric("Forecast solar", fmt(entityNumber(IDS.forecastSolarTomorrow), "kWh", 2), "Tomorrow")}
    ${metric("Planned grid import", fmt(totals.import, "kWh", 2), "Published slot plan")}
    ${metric("Planned grid export", fmt(totals.export, "kWh", 2), "Published slot plan")}
    ${metric("Planned battery export", fmt(totals.batteryExport, "kWh", 2), "Published slot plan")}
    ${metric("Estimated Agile export income", moneyPence(totals.income), "Outgoing Agile rates only")}
    ${metric("Forecast end SOC", fmt(totals.endSoc, "%", 1), "Last published slot")}
  </div><p class="safety-note">KEMS does not infer tomorrow's import cost from the Outgoing Agile export-rate feed. Monetary forecasts are only shown where the published data supports them.</p>`;
}
function historyCard(key, label) {
  const group = billPeriod(key);
  if (!group) return metric(label, "Building", "No retained bill-equivalent period yet");
  const live = group.live_data || {};
  const kems = group.kems || {};
  return `<article class="agile-card agile-history-card"><small>${escapeHtml(label)}</small><div class="proof-list"><div><span>Live total</span><b>${moneyPence(live.total_energy_cost_pence)}</b></div><div><span>KEMS total</span><b>${moneyPence(kems.total_energy_cost_pence)}</b></div><div><span>KEMS saving</span><b>${moneyPence(group.saving_pence)}</b></div><div><span>Live import</span><b>${fmt(live.grid_import_kwh, "kWh")}</b></div><div><span>KEMS import</span><b>${fmt(kems.grid_import_kwh, "kWh")}</b></div><div><span>KEMS export</span><b>${fmt(kems.grid_export_kwh, "kWh")}</b></div></div></article>`;
}
function advancedEvidence() {
  const rolling = rollingAttrs();
  const guard = rolling.economic_opportunity_guard || {};
  const deadline = rolling.deadline_guard || {};
  const proof = attr(IDS.shadowStatus, "nonzero_export_proof", {}) || {};
  const tracking = proof.replay?.tracking || {};
  const checks = proof.checks || {};
  const horizon = entity(IDS.horizon)?.attributes || {};
  return `<details class="agile-card agile-details"><summary>Advanced optimiser &amp; shadow evidence</summary><div class="proof-grid agile-details-body">
    <article class="agile-card"><small>Economic opportunity guard</small><strong>${guard.active ? "ACTIVE" : "Standby"}</strong><div class="proof-list"><div><span>Current price</span><b>${fmt(guard.current_rate_pence, "p/kWh")}</b></div><div><span>Marginal future price</span><b>${fmt(guard.marginal_future_rate_pence, "p/kWh")}</b></div><div><span>Price advantage</span><b>${fmt(guard.price_advantage_pence, "p/kWh")}</b></div><div><span>Future capacity</span><b>${fmt(guard.future_capacity_kwh, "kWh")}</b></div></div></article>
    <article class="agile-card"><small>Latest-safe protection</small><strong>${escapeHtml(deadline.mode || rolling.dispatch_mode || "Building")}</strong><div class="proof-list"><div><span>Target reachable</span><b>${boolWord(deadline.target_physically_reachable_now)}</b></div><div><span>Capacity margin</span><b>${fmt(deadline.solar_aware_deadline_margin_kwh ?? rolling.deadline_capacity_margin_kwh, "kWh")}</b></div><div><span>Latest safe start</span><b>${escapeHtml(deadline.latest_safe_export_start || "—")}</b></div><div><span>Forecast solar used</span><b>${boolWord(deadline.forecast_solar_used)}</b></div></div></article>
    <article class="agile-card"><small>Shadow proof</small><strong>${escapeHtml(proof.state || state(IDS.shadowStatus))}</strong><div class="proof-list"><div><span>Candidate export</span><b>${fmt(proof.candidate_export_kw, "kW")}</b></div><div><span>Replay export</span><b>${fmt(tracking.outcome?.battery_export_kw, "kW")}</b></div><div><span>Tracking</span><b>${fmt(tracking.tracking_score_percent, "%", 1)}</b></div><div><span>Hardware blocked</span><b>${boolWord(checks.hardware_writes_blocked)}</b></div></div></article>
    <article class="agile-card"><small>Price horizon</small><strong>${escapeHtml(state(IDS.horizon))}</strong><div class="proof-list"><div><span>Current slot known</span><b>${boolWord(attr(IDS.partial, "current_slot_known", horizon.current_slot_known))}</b></div><div><span>Upstream gap verified</span><b>${boolWord(attr(IDS.partial, "upstream_gap_verified"))}</b></div><div><span>Unknown dispatch blocked</span><b>${boolWord(attr(IDS.partial, "unknown_price_dispatch_blocked"))}</b></div><div><span>Missing prices</span><b>${escapeHtml(String((horizon.missing_labels || horizon.missing_relevant_labels || []).length))}</b></div></div></article>
  </div></details>`;
}

function render() {
  if (!snapshot?.connected) {
    app.innerHTML = `<section class="agile-card empty"><h1>KEMS data unavailable</h1><p>The property dashboard is not currently connected to Home Assistant/KEMS.</p></section>`;
    return;
  }

  const slotsState = slotAttrs();
  const todaySlots = Array.isArray(slotsState.today_slots) ? slotsState.today_slots : [];
  const tomorrowSlots = Array.isArray(slotsState.tomorrow_slots) ? slotsState.tomorrow_slots : [];
  const todayAgile = slotsState.today_agile || {};
  const todayBill = billPeriod("today") || {};
  const kemsBill = todayBill.kems || {};
  const rolling = rollingAttrs();
  const currentAction = slotsState.current_action || rolling.dispatch_action || state(IDS.dispatchMode, "Building plan");
  const currentRate = number(slotsState.current_rate_pence);
  const exportTarget = firstEntityNumber(IDS.targetBatteryExport, IDS.exportTarget);
  const batteryChargeToday = firstEntityNumber(IDS.simulatedBatteryChargeToday, IDS.simulatedBatteryChargeTodayAlt);
  const todayGridExport = number(todayAgile.grid_export_kwh) ?? entityNumber(IDS.simulatedGridExportToday);
  const todaySolarExport = number(todayAgile.solar_export_kwh);
  const todayBatteryExport = number(todayAgile.battery_export_kwh) ?? entityNumber(IDS.simulatedBatteryExportToday);
  const todayExportIncome = number(todayAgile.export_income_pence) ?? entityNumber(IDS.simulatedExportIncomeToday);

  app.innerHTML = `
    <section class="agile-hero"><div><p class="eyebrow">KEMS · digital twin · read-only</p><h1>KEMS</h1><p>What KEMS would have done with the configured system, tariff and strategy. Current power uses the canonical Alpha8 simulation entities; costs use the coordinated Energy Bill contract; Agile planning uses the stable customer-facing slot feed.</p></div>${badge(state(IDS.status))}</section>

    <section class="agile-card agile-section"><h2>Decision now</h2><strong>${escapeHtml(currentAction)}</strong><p>${currentRate === null ? "Waiting for the current published Agile rate." : `Current Agile export rate ${fmt(currentRate, "p/kWh", 2)}.`} Hardware control remains read-only from KEMS Web.</p></section>

    <section class="agile-section"><h2>KEMS now</h2><p>Canonical instantaneous digital-twin power. No browser-side routing reconstruction is used for these headline values.</p><div class="agile-grid">
      ${metric("House load", fmt(entityNumber(IDS.simulatedHouse), "kW"), "KEMS digital twin")}
      ${metric("Solar", fmt(entityNumber(IDS.simulatedSolar), "kW"), "Canonical simulated solar")}
      ${metric("Grid import", fmt(entityNumber(IDS.simulatedGridImport), "kW"), "Canonical simulated routing")}
      ${metric("Grid export", fmt(entityNumber(IDS.simulatedGridExport), "kW"), "Canonical simulated routing")}
      ${metric("Battery power", fmt(entityNumber(IDS.simulatedBattery), "kW"), "Canonical simulated battery")}
      ${metric("Battery SOC", fmt(entityNumber(IDS.simulatedSoc), "%", 1), "KEMS simulated SOC")}
      ${metric("Solar → battery", fmt(entityNumber(IDS.simulatedSolarToBattery), "kW"), "Canonical route")}
      ${metric("Battery → home", fmt(entityNumber(IDS.simulatedBatteryToHome), "kW"), "Canonical route")}
      ${metric("Battery → export", fmt(entityNumber(IDS.simulatedBatteryExport), "kW"), "Canonical route")}
    </div></section>

    <section class="agile-section"><h2>Today — Energy Bill</h2><p>The same bill-equivalent accounting shown by the managed Home Assistant KEMS dashboard.</p><div class="agile-grid">
      ${metric("Electricity import", moneyPence(kemsBill.electricity_import_cost_pence), "KEMS today")}
      ${metric("Standing charge", moneyPence(kemsBill.electricity_standing_charge_pence), "Electricity")}
      ${metric("Export income", signedCredit(kemsBill.electricity_export_income_pence), "Credited against electricity")}
      ${metric("Supplier credits", signedCredit(kemsBill.supplier_energy_credit_pence), "Where applicable")}
      ${metric("Electricity total", moneyPence(kemsBill.electricity_total_cost_pence), "Bill-equivalent")}
      ${metric("Gas", moneyPence(kemsBill.gas_total_cost_pence), "Same household gas basis")}
      ${metric("TOTAL ENERGY COST", moneyPence(kemsBill.total_energy_cost_pence), "Electricity + gas")}
      ${metric("KEMS saving", moneyPence(todayBill.saving_pence), "Live Data minus KEMS")}
    </div></section>

    <section class="agile-section"><h2>Energy today</h2><div class="agile-grid">
      ${metric("Whole-home energy", fmt(kemsBill.home_energy_kwh, "kWh"), "KEMS")}
      ${metric("Grid import", fmt(entityNumber(IDS.simulatedGridImportToday), "kWh"), "KEMS")}
      ${metric("Grid export", fmt(todayGridExport, "kWh"), "Live solar + settled battery export")}
      ${metric("Solar generation", fmt(entityNumber(IDS.simulatedSolarToday), "kWh"), "KEMS")}
      ${metric("Solar export", fmt(todaySolarExport, "kWh"), "Replay through latest recorder sample")}
      ${metric("Battery charged", fmt(batteryChargeToday, "kWh"), "KEMS")}
      ${metric("Battery → home", fmt(entityNumber(IDS.simulatedBatteryToHomeToday), "kWh"), "Settled KEMS ledger")}
      ${metric("Battery export", fmt(todayBatteryExport, "kWh"), "Completed settled battery export")}
      ${metric("Export income", moneyPence(todayExportIncome), "KEMS today")}
    </div></section>

    <section class="agile-section"><h2>Forecast &amp; charge targets</h2><div class="agile-grid">
      ${metric("Solar tomorrow", fmt(entityNumber(IDS.forecastSolarTomorrow), "kWh", 2), "Forecast")}
      ${metric("House demand tomorrow", fmt(entityNumber(IDS.forecastHouseTomorrow), "kWh", 2), "Forecast")}
      ${metric("Required morning SOC", fmt(entityNumber(IDS.forecastMorningSoc), "%", 1), "Forecast")}
      ${metric("Overnight charge target", fmt(entityNumber(IDS.forecastMaximumOvernightSoc), "%", 1), "Forecast")}
      ${metric("Extra cheap time needed", fmt(entityNumber(IDS.forecastAdditionalCheap), "h", 2), "Forecast")}
      ${metric("Solar recovery target", fmt(entityNumber(IDS.forecastSolarRecovery), "%", 1), "Forecast")}
      ${metric("Hours until cheap", fmt(entityNumber(IDS.hoursUntilCheap), "h", 2), "Current plan")}
      ${metric("Exportable battery", fmt(entityNumber(IDS.exportableBattery), "kWh"), "Remaining")}
      ${metric("Battery export target", fmt(exportTarget, "kW"), "Current target")}
    </div></section>

    <section class="agile-section"><h2>Today's KEMS plan</h2><p><b>Price coverage:</b> ${escapeHtml(String(slotsState.today_count ?? todaySlots.length))}/${escapeHtml(String(slotsState.today_expected ?? 48))} slots · <b>Current rate:</b> ${fmt(currentRate, "p/kWh", 2)} · <b>Plan:</b> ${escapeHtml(rolling.action || rolling.dispatch_action || state(IDS.rolling, "—"))}.</p>${slotPlan("Today", todaySlots)}</section>

    <section class="agile-section"><h2>Tomorrow</h2><p>Forward-looking KEMS planning from currently published prices, forecast demand and forecast solar.</p>${tomorrowSummary(tomorrowSlots, slotsState)}${slotPlan("Tomorrow", tomorrowSlots)}</section>

    <section class="agile-section"><h2>History</h2><p>Retained bill-equivalent Live Data vs KEMS evidence from the same canonical contract used by Home Assistant and Compare.</p><div class="agile-history-grid">
      ${historyCard("yesterday", "Yesterday")}
      ${historyCard("this_week", "This Week")}
      ${historyCard("last_week", "Last Week")}
      ${historyCard("this_month", "This Month")}
      ${historyCard("last_month", "Last Month")}
      ${historyCard("year", "This Year")}
      ${historyCard("all_time", "All time")}
    </div></section>

    <section class="agile-section"><h2>System &amp; control safety</h2><p>Read-only operator evidence. KEMS Web does not issue Home Assistant or FoxESS commands.</p><div class="proof-grid">
      <article class="agile-card"><small>Health</small><div class="proof-list"><div><span>KEMS</span><b>${escapeHtml(state(IDS.status))}</b></div><div><span>Sources</span><b>${escapeHtml(state(IDS.sourceValidation))}</b></div><div><span>Data quality</span><b>${escapeHtml(state(IDS.dataQuality))}</b></div><div><span>Accumulator</span><b>${escapeHtml(state(IDS.accumulatorStatus))}</b></div><div><span>Simulation</span><b>${escapeHtml(state(IDS.simulationReady))}</b></div><div><span>Panel</span><b>${escapeHtml(state(IDS.panelStatus))}</b></div></div></article>
      <article class="agile-card"><small>Control safety</small><div class="proof-list"><div><span>Preflight</span><b>${escapeHtml(state(IDS.controlPreflight))}</b></div><div><span>Plan safe</span><b>${escapeHtml(state(IDS.controlPlanSafe))}</b></div><div><span>Backend available</span><b>${escapeHtml(state(IDS.realBackend))}</b></div><div><span>Commands permitted</span><b>${escapeHtml(state(IDS.commandsPermitted))}</b></div><div><span>Commissioning</span><b>${escapeHtml(state(IDS.commissioning))}</b></div><div><span>Blocked reason</span><b>${escapeHtml(state(IDS.controlBlocked))}</b></div></div></article>
    </div></section>

    ${advancedEvidence()}
  `;
}

async function refresh() {
  refreshButton?.classList.add("spinning");
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = await response.json();
    pill?.classList.toggle("connected", Boolean(snapshot.connected));
    const label = pill?.querySelector("span");
    if (label) label.textContent = snapshot.connected ? "Live" : "Connection issue";
    render();
  } catch (error) {
    app.innerHTML = `<section class="agile-card empty"><h1>Unable to load KEMS</h1><p>${escapeHtml(error.message)}</p></section>`;
    pill?.classList.add("error");
  } finally {
    refreshButton?.classList.remove("spinning");
  }
}

function connectStream() {
  try {
    stream?.close();
    stream = new EventSource("/api/stream");
    stream.addEventListener("snapshot", (event) => {
      try {
        snapshot = JSON.parse(event.data);
        render();
      } catch {}
    });
  } catch {}
}

refreshButton?.addEventListener("click", refresh);
await refresh();
connectStream();