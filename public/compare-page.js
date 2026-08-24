const app = document.querySelector("#compare-app");
const refreshButton = document.querySelector("#refresh-button");
const connectionPill = document.querySelector("#connection-pill");

const PERIODS = Object.freeze({
  today: { label: "Today", analytics: "day" },
  yesterday: { label: "Yesterday", analytics: "week" },
  "7_days": { label: "Last 7 days", analytics: "week" },
  "30_days": { label: "Last 30 days", analytics: "month" },
  year: { label: "Year", analytics: "year" },
  "365_days": { label: "Rolling 365", analytics: "year" },
  all_time: { label: "All time", analytics: "all" }
});

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
function kwh(value) { return Number.isFinite(n(value)) ? `${n(value).toFixed(2)} kWh` : "—"; }
function moneyPence(value) { return Number.isFinite(n(value)) ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(value) / 100) : "—"; }
function moneyPounds(value) { return Number.isFinite(n(value)) ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(value)) : "—"; }
function percent(value) { return Number.isFinite(value) ? `${value.toFixed(1)}%` : "—"; }
function years(value) { return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} years` : "—"; }
async function getJson(url) { const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error(`Request failed (${response.status})`); return response.json(); }

function entity(id) {
  const list = Array.isArray(live?.entities) ? live.entities : [];
  return list.find((item) => item.entityId === id || item.entity_id === id || item.id === id) || null;
}
function attrs(id) { return entity(id)?.attributes || {}; }
function billContract() { return attrs("sensor.kems_energy_cost_comparison"); }
function billPeriod(key = period) { return billContract()?.periods?.[key] || null; }
function productRows(key = period) {
  const group = billPeriod(key);
  if (!group) return [];
  return [
    {
      key: "live_data",
      label: "Live Data",
      source: "Measured",
      ...(group.live_data || {}),
      costPence: first(group.live_data?.total_energy_cost_pence)
    },
    {
      key: "kems",
      label: "KEMS",
      source: group.kems?.strategy_label || billContract()?.selected_kems_strategy_label || "Adaptive simulation",
      ...(group.kems || {}),
      costPence: first(group.kems?.total_energy_cost_pence)
    }
  ];
}
function periodControls() {
  return `<div class="web21-toggle compare-periods" role="group" aria-label="Comparison period">${Object.entries(PERIODS).map(([key, item]) => `<button type="button" data-period="${key}" class="${period === key ? "active" : ""}">${esc(item.label)}</button>`).join("")}</div>`;
}
function winner(rows) {
  if (rows.length !== 2 || !rows.every((row) => Number.isFinite(row.costPence))) return null;
  return [...rows].sort((a, b) => a.costPence - b.costPence)[0];
}
function strategyCard(row, winnerKey) {
  const winning = row.key === winnerKey;
  const evidence = row.evidence ? `<div class="web26-evidence-note">${esc(row.evidence)}</div>` : "";
  return `<article class="web21-card web25-strategy ${winning ? "web21-winner" : ""}"><div class="web21-kicker">${esc(row.source)}</div><h3>${esc(row.label)}</h3>${winning ? `<span class="web21-winner-badge">Lowest total</span>` : ""}<strong>${moneyPence(row.costPence)}</strong><small>Total energy cost · ${esc(PERIODS[period].label)}</small><div class="web25-strategy-mini"><span>Home <b>${kwh(row.home_energy_kwh)}</b></span><span>Import <b>${kwh(row.grid_import_kwh)}</b></span><span>Export <b>${kwh(row.grid_export_kwh)}</b></span></div>${evidence}</article>`;
}
function signedCredit(value) {
  return Number.isFinite(n(value)) ? `−${moneyPence(Math.abs(n(value)))}` : "—";
}
function costBreakdown(rows) {
  const metrics = [
    ["Electricity import", "electricity_import_cost_pence", false],
    ["Electricity standing charge", "electricity_standing_charge_pence", false],
    ["Electricity export income", "electricity_export_income_pence", true],
    ["Supplier / account energy credits", "supplier_energy_credit_pence", true],
    ["Electricity total", "electricity_total_cost_pence", false],
    ["Gas usage", "gas_usage_cost_pence", false],
    ["Gas standing charge", "gas_standing_charge_pence", false],
    ["Gas total", "gas_total_cost_pence", false],
    ["TOTAL ENERGY COST", "total_energy_cost_pence", false]
  ];
  return `<div class="web21-table-wrap"><table class="web21-table"><thead><tr><th>Bill component</th>${rows.map((row) => `<th>${esc(row.label)}</th>`).join("")}</tr></thead><tbody>${metrics.map(([label, key, credit]) => `<tr><th>${esc(label)}</th>${rows.map((row) => `<td>${credit ? signedCredit(row[key]) : moneyPence(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function energyTable(rows) {
  const metrics = [
    ["Home usage", "home_energy_kwh"],
    ["Grid import", "grid_import_kwh"],
    ["Grid export", "grid_export_kwh"]
  ];
  return `<div class="web21-table-wrap"><table class="web21-table"><thead><tr><th>Energy</th>${rows.map((row) => `<th>${esc(row.label)}</th>`).join("")}</tr></thead><tbody>${metrics.map(([label, key]) => `<tr><th>${esc(label)}</th>${rows.map((row) => `<td>${kwh(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function costChart(rows, winnerKey) {
  const values = rows.map((row) => row.costPence).filter(Number.isFinite);
  if (!values.length) return `<p class="web21-muted">Building comparable bill evidence…</p>`;
  const maxAbs = Math.max(1, ...values.map(Math.abs));
  return `<div class="web25-cost-chart">${rows.map((row) => {
    const height = Number.isFinite(row.costPence) ? Math.max(4, Math.abs(row.costPence) / maxAbs * 155) : 0;
    return `<div class="web25-cost-item ${row.key === winnerKey ? "winner" : ""} ${row.costPence < 0 ? "negative" : ""}"><div class="web25-cost-value">${moneyPence(row.costPence)}</div><div class="web25-cost-column"><i style="height:${height}px"></i></div><strong>${esc(row.label)}</strong></div>`;
  }).join("")}</div>`;
}
function roiCard() {
  const group = billContract()?.periods?.["30_days"];
  const liveCost = first(group?.live_data?.total_energy_cost_pence);
  const kemsCost = first(group?.kems?.total_energy_cost_pence);
  const days = first(group?.days_included) || 0;
  const systemCost = first(roiAnalytics?.economics?.systemCost, analytics?.economics?.systemCost);
  const savingPence = Number.isFinite(liveCost) && Number.isFinite(kemsCost) ? liveCost - kemsCost : null;
  const annualSaving = Number.isFinite(savingPence) && days > 0 ? savingPence / 100 / days * 365 : null;
  const roi = Number.isFinite(annualSaving) && Number.isFinite(systemCost) && systemCost > 0 ? annualSaving / systemCost * 100 : null;
  const payback = Number.isFinite(annualSaving) && annualSaving > 0 && Number.isFinite(systemCost) && systemCost > 0 ? systemCost / annualSaving : null;
  return `<section class="web21-section"><div class="web21-kicker">Bill-equivalent evidence</div><h2>Estimated KEMS ROI</h2><p class="web21-muted">Uses the same Live Data vs KEMS total-energy-cost contract over the retained 30-day evidence. Battery wear is not part of the household bill total.</p><div class="web21-roi-grid"><article class="web21-card"><div class="web21-kicker">Live Data</div><strong>Baseline</strong><small>Measured household energy bill</small></article><article class="web21-card"><div class="web21-kicker">KEMS</div><strong>${percent(roi)}</strong><small>${Number.isFinite(annualSaving) ? `${moneyPounds(annualSaving)} estimated annual bill saving` : "Building comparable evidence"}</small><div class="web25-roi-detail"><span>Payback <b>${Number.isFinite(payback) ? years(payback) : Number.isFinite(annualSaving) && annualSaving <= 0 ? "No payback at current evidence" : "—"}</b></span></div></article></div></section>`;
}
function renderMissingContract() {
  app.innerHTML = `<header class="page-heading web25-page-heading"><div><p class="eyebrow">COMPARE</p><h1>Live Data vs KEMS</h1><p>One bill basis across every KEMS surface.</p></div>${periodControls()}</header><section class="web21-section"><h2>Waiting for the coordinated KEMS bill contract</h2><p class="web21-muted">This Web.4 page requires KEMS Home Assistant Alpha8.13 or later. It will not reconstruct a fallback cost locally because that is how cross-surface figures drifted previously.</p></section>`;
}
function render() {
  if (!app || !live) return;
  const contract = billContract();
  if (!contract?.periods || Number(contract.contract_version) < 1) {
    renderMissingContract();
    bindPeriodButtons();
    return;
  }
  const rows = productRows();
  const lead = winner(rows);
  const group = billPeriod();
  const saving = first(group?.saving_pence);
  app.innerHTML = `<header class="page-heading web25-page-heading"><div><p class="eyebrow">COMPARE</p><h1>Live Data vs KEMS</h1><p>What actually happened compared with what KEMS would have done for the configured system and tariff.</p></div>${periodControls()}</header><section class="web21-section"><div class="web21-kicker">${lead ? "Lowest total energy cost" : "Comparison building"}</div><h2>${lead ? `${esc(lead.label)} · ${moneyPence(lead.costPence)}` : "Waiting for comparable bill totals"}</h2><p class="web21-muted">Headline totals mirror the household energy bill: electricity import + electricity standing charge − export income − genuine supplier/account credits + gas usage + gas standing charge. Battery wear is excluded.${Number.isFinite(saving) ? ` KEMS saving for this period: ${moneyPence(saving)}.` : ""}</p><div class="web25-strategy-grid">${rows.map((row) => strategyCard(row, lead?.key)).join("")}</div></section><section class="web21-section"><div class="web21-kicker">Bill breakdown</div><h2>Total energy cost</h2>${costBreakdown(rows)}</section><section class="web21-section"><div class="web21-kicker">Energy</div><h2>Same-period energy evidence</h2>${energyTable(rows)}</section><section class="web21-section"><div class="web21-kicker">Cost comparison</div><h2>Total energy cost</h2>${costChart(rows, lead?.key)}</section>${roiCard()}<section class="web21-section web25-evidence"><div class="web21-kicker">Evidence</div><p>${esc(group?.label || PERIODS[period].label)} · ${esc(String(group?.days_included ?? "—"))} retained day(s). KEMS strategy: ${esc(contract.selected_kems_strategy_label || group?.kems?.strategy_label || "—")}. Contract v${esc(String(contract.contract_version))}; Web does not recalculate these totals.</p></section>`;
  bindPeriodButtons();
  if (connectionPill) {
    connectionPill.classList.toggle("offline", !live.connected);
    const label = connectionPill.querySelector("span");
    if (label) label.textContent = live.connected ? "Live" : "Offline";
  }
}
function bindPeriodButtons() {
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", async () => {
    const next = button.dataset.period;
    if (!PERIODS[next] || next === period) return;
    period = next;
    await refresh(false);
  }));
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
