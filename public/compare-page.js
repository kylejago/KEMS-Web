const app = document.querySelector("#compare-app");
const refreshButton = document.querySelector("#refresh-button");
const connectionPill = document.querySelector("#connection-pill");

const PERIODS = Object.freeze({
  today: { label: "Today", analytics: "day" },
  "7_days": { label: "Last 7 days", analytics: "week" },
  "30_days": { label: "Last 30 days", analytics: "month" }
});
const PRODUCTS = Object.freeze([
  { key: "live_data", label: "Live Data", source: "Measured" },
  { key: "battery_solar", label: "Battery & Solar", source: "Simulation", scenario: "solar_battery" },
  { key: "full_kems", label: "Full KEMS", source: "Simulation", scenario: "kems_forecast" },
  { key: "full_kems_agile", label: "Full KEMS Agile", source: "Agile simulation", agile: true }
]);

let period = "today";
let live = null;
let analytics = null;
let roiAnalytics = null;
let loading = false;

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function first(...values) { return values.map(n).find(Number.isFinite) ?? null; }
function esc(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
function kwh(value) { return Number.isFinite(value) ? `${value.toFixed(2)} kWh` : "—"; }
function money(value) { return Number.isFinite(value) ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : "—"; }
function percent(value) { return Number.isFinite(value) ? `${value.toFixed(1)}%` : "—"; }
function years(value) { return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} years` : "—"; }
async function getJson(url) { const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error(`Request failed (${response.status})`); return response.json(); }

function entity(id) {
  const list = Array.isArray(live?.entities) ? live.entities : [];
  return list.find((item) => item.entityId === id || item.entity_id === id || item.id === id) || null;
}
function attrs(id) { return entity(id)?.attributes || {}; }
function scenarioPeriod(key = period) { return attrs("sensor.kems_scenario_comparison_today")?.periods?.[key] || null; }
function scenario(key, periodKey = period) {
  const group = scenarioPeriod(periodKey);
  const rows = Array.isArray(group?.scenarios) ? group.scenarios : [];
  return rows.find((row) => row?.key === key) || null;
}
function agile(periodKey = period) {
  const raw = attrs("sensor.kems_agile_smart_export_plan")?.periods?.[periodKey];
  return raw?.agile_smart_export || raw?.full_kems_agile || raw?.scenario || raw || null;
}

function scenarioCostPence(row = {}) {
  const total = first(row.total_cost_pence, row.net_cost_pence, row.headline_electricity_bill_pence);
  if (Number.isFinite(total)) return total;
  const importCost = first(row.import_cost_pence, row.grid_import_cost_pence, row.cost_pence);
  if (!Number.isFinite(importCost)) return null;
  const exportIncome = first(row.export_income_pence, row.grid_export_income_pence) || 0;
  const standing = first(row.standing_charge_pence) || 0;
  return importCost - exportIncome + standing;
}
function scenarioMetrics(row, fallbackHome = null) {
  if (!row || row.ready === false) return { home: fallbackHome, gridImport: null, gridExport: null, solar: null, battery: null, cost: null, ready: false };
  const costPence = scenarioCostPence(row);
  return {
    home: first(row.house_consumption_kwh, row.home_energy_kwh, row.house_energy_kwh, row.home_usage_kwh, fallbackHome),
    gridImport: first(row.grid_import_kwh, row.import_kwh),
    gridExport: first(row.grid_export_kwh, row.export_kwh),
    solar: first(row.solar_generation_kwh, row.solar_kwh),
    battery: first(row.battery_to_home_kwh, row.battery_discharged_kwh, row.battery_discharge_kwh),
    cost: Number.isFinite(costPence) ? costPence / 100 : null,
    ready: row.ready !== false
  };
}
function actualMetrics(payload = analytics) {
  const totals = payload?.actual?.totals || {};
  const solarAvailable = live?.metrics?.solarDataAvailable !== false && live?.availability?.liveSolar !== false;
  const batteryAvailable = live?.metrics?.batteryDataAvailable !== false && live?.availability?.liveBattery !== false;
  return {
    home: first(totals.home),
    gridImport: first(totals.gridImport),
    gridExport: first(totals.gridExport),
    solar: solarAvailable ? first(totals.solar) : null,
    battery: batteryAvailable ? first(totals.batteryDischarge, totals.batteryToHome) : null,
    cost: first(totals.netCost),
    ready: payload?.available !== false
  };
}
function productRows(periodKey = period, actualPayload = analytics) {
  const actual = actualMetrics(actualPayload);
  return PRODUCTS.map((product) => {
    let metrics;
    if (product.key === "live_data") metrics = actual;
    else if (product.agile) metrics = scenarioMetrics(agile(periodKey), actual.home);
    else metrics = scenarioMetrics(scenario(product.scenario, periodKey), actual.home);
    return { ...product, ...metrics };
  });
}

function periodControls() {
  return `<div class="web21-toggle compare-periods" role="group" aria-label="Comparison period">${Object.entries(PERIODS).map(([key, item]) => `<button type="button" data-period="${key}" class="${period === key ? "active" : ""}">${esc(item.label)}</button>`).join("")}</div>`;
}
function winner(rows) {
  const comparable = rows.filter((row) => Number.isFinite(row.cost));
  if (comparable.length < 2) return { row: null, complete: false };
  return { row: [...comparable].sort((a, b) => a.cost - b.cost)[0], complete: comparable.length === rows.length };
}
function strategyCard(row, winnerKey, winnerComplete) {
  const winning = row.key === winnerKey;
  return `<article class="web21-card web25-strategy ${winning ? "web21-winner" : ""}"><div class="web21-kicker">${esc(row.source)}</div><h3>${esc(row.label)}</h3>${winning ? `<span class="web21-winner-badge">${winnerComplete ? "Winner" : "Current leader"}</span>` : ""}<strong>${money(row.cost)}</strong><small>Net electricity cost · ${esc(PERIODS[period].label)}</small><div class="web25-strategy-mini"><span>Home <b>${kwh(row.home)}</b></span><span>Import <b>${kwh(row.gridImport)}</b></span><span>Export <b>${kwh(row.gridExport)}</b></span></div></article>`;
}

function comparisonTable(rows) {
  const metrics = [
    ["Home usage", "home"],
    ["Grid import", "gridImport"],
    ["Grid export", "gridExport"],
    ["Solar generation", "solar"],
    ["Battery → home", "battery"]
  ];
  return `<div class="web21-table-wrap"><table class="web21-table"><thead><tr><th>Metric</th>${rows.map((row) => `<th>${esc(row.label)}</th>`).join("")}</tr></thead><tbody>${metrics.map(([label, key]) => `<tr><th>${esc(label)}</th>${rows.map((row) => `<td>${kwh(row[key])}</td>`).join("")}</tr>`).join("")}<tr><th>Net electricity cost</th>${rows.map((row) => `<td><strong>${money(row.cost)}</strong></td>`).join("")}</tr></tbody></table></div>`;
}

function costChart(rows, winnerKey) {
  const values = rows.map((row) => row.cost).filter(Number.isFinite);
  if (!values.length) return `<p class="web21-muted">Building comparable cost evidence…</p>`;
  const maxAbs = Math.max(0.01, ...values.map(Math.abs));
  return `<div class="web25-cost-chart">${rows.map((row) => {
    const height = Number.isFinite(row.cost) ? Math.max(4, Math.abs(row.cost) / maxAbs * 155) : 0;
    return `<div class="web25-cost-item ${row.key === winnerKey ? "winner" : ""} ${row.cost < 0 ? "negative" : ""}"><div class="web25-cost-value">${money(row.cost)}</div><div class="web25-cost-column"><i style="height:${height}px"></i></div><strong>${esc(row.label)}</strong></div>`;
  }).join("")}</div>`;
}

function roiRows() {
  const actual30 = actualMetrics(roiAnalytics);
  const rows = productRows("30_days", roiAnalytics);
  const systemCost = first(roiAnalytics?.economics?.systemCost, analytics?.economics?.systemCost);
  const days = first(scenarioPeriod("30_days")?.days_included, roiAnalytics?.nativePeriod?.daysIncluded, 30) || 30;
  return rows.map((row) => {
    if (row.key === "live_data") return { ...row, annualSaving: 0, roi: null, payback: null, baseline: true, systemCost };
    const saving = Number.isFinite(actual30.cost) && Number.isFinite(row.cost) ? actual30.cost - row.cost : null;
    const annualSaving = Number.isFinite(saving) && days > 0 ? saving / days * 365 : null;
    const roi = Number.isFinite(annualSaving) && Number.isFinite(systemCost) && systemCost > 0 ? annualSaving / systemCost * 100 : null;
    const payback = Number.isFinite(annualSaving) && annualSaving > 0 && Number.isFinite(systemCost) && systemCost > 0 ? systemCost / annualSaving : null;
    return { ...row, annualSaving, roi, payback, baseline: false, systemCost };
  });
}
function roiCards() {
  const rows = roiRows();
  const cost = rows.find((row) => Number.isFinite(row.systemCost))?.systemCost;
  return `<section class="web21-section"><div class="web21-kicker">Longest comparable evidence</div><h2>Estimated ROI</h2><p class="web21-muted">ROI uses the Last 30 days replay where available. Battery & Solar, Full KEMS and Full KEMS Agile currently use the same configured KEMS system investment${Number.isFinite(cost) ? ` (${money(cost)})` : ""}; product-specific installation prices can replace this when configured.</p><div class="web21-roi-grid">${rows.map((row) => `<article class="web21-card"><div class="web21-kicker">${esc(row.label)}</div><strong>${row.baseline ? "Baseline" : percent(row.roi)}</strong><small>${row.baseline ? "Measured reference · no simulated payback" : Number.isFinite(row.annualSaving) ? `${money(row.annualSaving)} estimated annual saving` : "Building 30-day saving evidence"}</small>${row.baseline ? "" : `<div class="web25-roi-detail"><span>Payback <b>${Number.isFinite(row.payback) ? years(row.payback) : Number.isFinite(row.annualSaving) && row.annualSaving <= 0 ? "No payback at current evidence" : "—"}</b></span></div>`}</article>`).join("")}</div></section>`;
}

function render() {
  if (!app || !live || !analytics) return;
  const rows = productRows();
  const lead = winner(rows);
  const winnerKey = lead.row?.key || null;
  const sourcePeriod = scenarioPeriod();
  app.innerHTML = `<header class="page-heading web25-page-heading"><div><p class="eyebrow">COMPARE</p><h1>Four ways to run the same home</h1><p>One period selector, one common set of metrics: Live Data, Battery & Solar, Full KEMS and Full KEMS Agile.</p></div>${periodControls()}</header><section class="web21-section"><div class="web21-kicker">${lead.complete ? "Winner" : lead.row ? "Current leader · incomplete evidence" : "Comparison building"}</div><h2>${lead.row ? `${esc(lead.row.label)} · ${money(lead.row.cost)}` : "Waiting for comparable costs"}</h2><p class="web21-muted">${lead.complete ? `Lowest net electricity cost for ${esc(PERIODS[period].label.toLowerCase())}.` : "A leader is shown only from strategies with cost evidence; missing values are never treated as zero."}</p><div class="web25-strategy-grid">${rows.map((row) => strategyCard(row, winnerKey, lead.complete)).join("")}</div></section><section class="web21-section"><div class="web21-kicker">Energy & cost</div><h2>Side-by-side comparison</h2><p class="web21-muted">All simulated strategies replay the same retained home demand. Where a scenario omits a duplicate home-total field, the measured demand used for the replay is shown rather than leaving Home usage blank.</p>${comparisonTable(rows)}</section><section class="web21-section"><div class="web21-kicker">Cost comparison</div><h2>Net electricity cost</h2>${costChart(rows, winnerKey)}</section>${roiCards()}<section class="web21-section web25-evidence"><div class="web21-kicker">Evidence</div><p>${esc(sourcePeriod?.label || PERIODS[period].label)} · ${esc(String(sourcePeriod?.days_included ?? analytics?.nativePeriod?.daysIncluded ?? "—"))} retained day(s). Live Data comes from the KEMS analytics ledger; Battery & Solar and Full KEMS come from scenario replay; Full KEMS Agile comes from the Agile smart-export evidence.</p></section>`;
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", async () => {
    const next = button.dataset.period;
    if (!PERIODS[next] || next === period) return;
    period = next;
    await refresh(false);
  }));
  if (connectionPill) {
    connectionPill.classList.toggle("offline", !live.connected);
    const label = connectionPill.querySelector("span");
    if (label) label.textContent = live.connected ? "Live" : "Offline";
  }
}

async function refresh(refreshLive = true) {
  if (loading) return;
  loading = true;
  refreshButton?.classList.add("spinning");
  try {
    const requests = [getJson(`/api/analytics?range=${PERIODS[period].analytics}`)];
    const needsLive = refreshLive || !live;
    const needsRoi = !roiAnalytics || PERIODS[period].analytics === "month";
    if (needsLive) requests.push(getJson("/api/live"));
    if (needsRoi) requests.push(getJson("/api/analytics?range=month"));
    const results = await Promise.all(requests);
    let cursor = 0;
    analytics = results[cursor++];
    if (needsLive) live = results[cursor++];
    if (needsRoi) roiAnalytics = results[cursor++];
    if (PERIODS[period].analytics === "month") roiAnalytics = analytics;
    render();
  } catch (error) {
    if (app) app.innerHTML = `<section class="web21-section"><h1>Comparison unavailable</h1><p>${esc(error.message)}</p></section>`;
  } finally {
    loading = false;
    refreshButton?.classList.remove("spinning");
  }
}

refreshButton?.addEventListener("click", () => refresh(true));
refresh(true);
setInterval(() => document.visibilityState === "visible" && refresh(true), 60000);
