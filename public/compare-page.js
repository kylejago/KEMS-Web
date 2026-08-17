const app = document.querySelector("#compare-app");
const connectionPill = document.querySelector("#connection-pill");
const refreshButton = document.querySelector("#refresh-button");
const menuButton = document.querySelector("#menu-button");
const mobileNav = document.querySelector("#mobile-nav");
const toastRoot = document.querySelector("#toast-root");

const RANGES = new Set(["day", "week", "month", "year", "all"]);
const RANGE_LABELS = { day: "Day", week: "Week", month: "Month", year: "Year", all: "All time" };
const COLOURS = {
  actual: "#55d9e6",
  simulated: "#b7a0f6",
  positive: "#8be3a2",
  negative: "#ff8f9d",
  solar: "#f4d47a",
  battery: "#7cc8ff",
  grid: "#c8d5da",
  home: "#55d9e6",
  ev: "#c3ef77",
  muted: "#829ba5"
};

const state = {
  range: rangeFromUrl(),
  data: null,
  live: null,
  site: null,
  maintenance: null,
  loading: false,
  error: null,
  updatedAt: null
};

function rangeFromUrl() {
  const range = new URLSearchParams(location.search).get("range") || "day";
  return RANGES.has(range) ? range : "day";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value, unit = "", digits = 2) {
  if (!Number.isFinite(value)) return "Unavailable";
  const formatted = new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatMoney(value, digits = 2) {
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(value) ? `${formatNumber(value, "", digits)}%` : "Unavailable";
}

function formatDate(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDurationYears(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value < 1) return `${Math.max(1, Math.round(value * 12))} months`;
  return `${formatNumber(value, "", 1)} years`;
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function sourceBadge(type, label) {
  return `<span class="data-badge ${type}"><i></i>${escapeHtml(label)}</span>`;
}

function statusPill(text, tone = "neutral") {
  return `<span class="status-pill ${tone}">${escapeHtml(text)}</span>`;
}

function sectionHeader(title, subtitle = "") {
  return `<header class="section-heading"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div></header>`;
}

function card(title, content, subtitle = "", className = "") {
  return `<section class="panel ${className}">${sectionHeader(title, subtitle)}<div class="panel-body">${content}</div></section>`;
}

function metricCard(label, value, detail, tone = "actual", icon = "") {
  return `<article class="metric-card ${tone}"><header><span>${escapeHtml(label)}</span>${icon ? `<b aria-hidden="true">${escapeHtml(icon)}</b>` : ""}</header><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function rangeControls() {
  return `<div class="range-control compare-range-control" role="group" aria-label="Comparison period">${Object.entries(RANGE_LABELS).map(([range, label]) => `<button type="button" data-range="${range}" class="${state.range === range ? "active" : ""}">${label}</button>`).join("")}</div>`;
}

function normaliseTotals(raw = {}) {
  const totals = { ...raw };
  totals.netCost = firstFinite(number(totals.netCost), Number.isFinite(number(totals.importCost)) ? number(totals.importCost) - (number(totals.exportIncome) || 0) : null);
  totals.wholeHomeCost = firstFinite(number(totals.wholeHomeCost), Number.isFinite(totals.netCost) ? totals.netCost + (number(totals.gasCost) || 0) : null);
  return totals;
}

function periodSaving(actual, simulated) {
  return firstFinite(
    number(simulated.saving),
    Number.isFinite(actual.netCost) && Number.isFinite(simulated.netCost) ? actual.netCost - simulated.netCost : null,
    Number.isFinite(actual.wholeHomeCost) && Number.isFinite(simulated.wholeHomeCost) ? actual.wholeHomeCost - simulated.wholeHomeCost : null
  );
}

function improvement(actual, simulated, higherIsBetter) {
  if (!Number.isFinite(actual) || !Number.isFinite(simulated)) return null;
  return higherIsBetter ? simulated - actual : actual - simulated;
}

function deltaLabel(actual, simulated, unit = "kWh", higherIsBetter = null) {
  if (!Number.isFinite(actual) || !Number.isFinite(simulated)) return { text: "Unavailable", tone: "neutral" };
  const delta = simulated - actual;
  const formatter = unit === "GBP" ? formatMoney : (value) => formatNumber(value, unit, 2);
  if (Math.abs(delta) < 0.0005) return { text: "No change", tone: "neutral" };
  const arrow = delta > 0 ? "↑" : "↓";
  const magnitude = formatter(Math.abs(delta));
  if (higherIsBetter === null) return { text: `${arrow} ${magnitude}`, tone: "neutral" };
  const score = higherIsBetter ? delta : -delta;
  return { text: `${arrow} ${magnitude}`, tone: score > 0 ? "good" : "bad" };
}

function comparisonRow(label, actual, simulated, unit = "kWh", higherIsBetter = null) {
  const delta = deltaLabel(actual, simulated, unit, higherIsBetter);
  const formatter = unit === "GBP" ? formatMoney : unit === "%" ? formatPercent : (value) => formatNumber(value, unit, 2);
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(formatter(actual))}</td><td>${escapeHtml(formatter(simulated))}</td><td class="${delta.tone}">${escapeHtml(delta.text)}</td></tr>`;
}

function headline(actual, simulated) {
  const saving = periodSaving(actual, simulated);
  const rangeName = RANGE_LABELS[state.range].toLowerCase();
  const actualCost = firstFinite(actual.wholeHomeCost, actual.netCost);
  const simulatedCost = firstFinite(simulated.wholeHomeCost, simulated.netCost);
  const tone = !Number.isFinite(saving) ? "neutral" : saving > 0.005 ? "good" : saving < -0.005 ? "bad" : "neutral";
  const result = !Number.isFinite(saving)
    ? "Comparison building"
    : Math.abs(saving) < 0.005
      ? "Costs are effectively equal"
      : saving > 0
        ? `KEMS would have saved ${formatMoney(saving)}`
        : `KEMS would have cost ${formatMoney(Math.abs(saving))} more`;
  return `<section class="compare-hero ${tone}">
    <div class="compare-hero-card actual"><span>ACTUAL</span><strong>${escapeHtml(formatMoney(actualCost))}</strong><small>Whole-home / net energy cost · ${escapeHtml(rangeName)}</small></div>
    <div class="compare-hero-card simulated"><span>KEMS SIMULATED</span><strong>${escapeHtml(formatMoney(simulatedCost))}</strong><small>Same retained demand replayed through KEMS</small></div>
    <div class="compare-hero-result ${tone}"><span>DIFFERENCE</span><strong>${escapeHtml(result)}</strong><small>${Number.isFinite(saving) ? "Positive means the KEMS model is cheaper than the observed outcome." : "More retained data is needed for a cost result."}</small></div>
  </section>`;
}

function maintenanceBanner() {
  const notice = state.maintenance?.maintenance || {};
  if (!notice || ["none", "completed"].includes(String(notice.status || "none"))) return "";
  const text = notice.reason || "KEMS coordinated maintenance";
  const when = notice.scheduled_for ? ` · ${formatDate(notice.scheduled_for)} ${formatTime(notice.scheduled_for)}` : "";
  return `<section class="maintenance-banner"><div><span>KEMS maintenance</span><strong>${escapeHtml(text)}</strong><small>${escapeHtml(String(notice.status || "scheduled"))}${escapeHtml(when)}</small></div>${statusPill(String(notice.status || "scheduled").replace(/_/g, " "), "attention")}</section>`;
}

function periodNotes(data) {
  const notes = [];
  const native = data.nativePeriod;
  if (native) {
    notes.push(`<div class="data-note ${native.dataComplete ? "" : "warning"}"><strong>KEMS period ledger:</strong> ${escapeHtml(String(native.daysIncluded ?? 0))} day(s) included; ${escapeHtml(String(native.completeDays ?? 0))} complete, ${escapeHtml(String(native.incompleteDays ?? 0))} incomplete. ${native.dataComplete ? "Period marked complete." : "Current or incomplete days remain provisional."}</div>`);
  }
  if (data.warning) notes.push(`<div class="data-note warning"><strong>History note:</strong> ${escapeHtml(data.warning)}</div>`);
  notes.push(`<div class="data-note"><strong>Coverage:</strong> ${escapeHtml(String(data.coverage || 0))} retained statistic/history points. Source: ${escapeHtml(data.source || "KEMS")}. Simulated values are read-only what-if results and are never physical battery or solar measurements.</div>`);
  return notes.join("");
}

function whyKems(actual, simulated, data) {
  const items = [];
  const saving = periodSaving(actual, simulated);
  const importSaved = improvement(actual.gridImport, simulated.gridImport, false);
  const exportAdded = improvement(actual.gridExport, simulated.gridExport, true);
  if (Number.isFinite(importSaved) && importSaved > 0.02) items.push(["↓", "Less grid import", `${formatNumber(importSaved, "kWh", 2)} less energy imported in the KEMS replay.`, "good"]);
  if (Number.isFinite(exportAdded) && exportAdded > 0.02) items.push(["↑", "More grid export", `${formatNumber(exportAdded, "kWh", 2)} more energy exported in the KEMS replay.`, "good"]);
  if (Number.isFinite(simulated.batteryToHome) && simulated.batteryToHome > 0.02) items.push(["▰", "Battery supplied the home", `${formatNumber(simulated.batteryToHome, "kWh", 2)} of modelled home demand came from the virtual battery.`, "simulated"]);
  if (Number.isFinite(simulated.batteryExport) && simulated.batteryExport > 0.02) items.push(["↗", "Battery export opportunity", `${formatNumber(simulated.batteryExport, "kWh", 2)} was modelled as deliberate battery export.`, "simulated"]);
  if (Number.isFinite(simulated.solar) && simulated.solar > 0.02) items.push(["☀", "Solar contribution", `${formatNumber(simulated.solar, "kWh", 2)} of solar generation was available to home, battery or export in the model.`, "simulated"]);
  if (Number.isFinite(saving)) items.push(["£", saving >= 0 ? "Lower modelled cost" : "Higher modelled cost", `${formatMoney(Math.abs(saving))} ${saving >= 0 ? "better" : "worse"} than the observed outcome for this period.`, saving >= 0 ? "good" : "bad"]);
  if (state.range === "day" && state.live?.simulation?.noExportModeActive) items.push(["⊘", "No-export mode active", "The current KEMS simulation is deliberately suppressing export while an export tariff is unavailable or not confirmed.", "attention"]);
  if (data.nativePeriod && !data.nativePeriod.dataComplete) items.push(["◷", "Period still developing", "The native KEMS period ledger includes an incomplete/current day, so the comparison can still move before the period closes.", "attention"]);
  if (!items.length) items.push(["…", "Waiting for comparable totals", "KEMS has not retained enough actual and simulated period totals to explain a difference yet.", "neutral"]);
  return `<div class="compare-insights-grid">${items.slice(0, 6).map(([icon, title, detail, tone]) => `<article class="compare-insight ${tone}"><span>${escapeHtml(icon)}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></article>`).join("")}</div>`;
}

function pairedEnergyBars(actual, simulated) {
  const metrics = [
    ["Home usage", actual.home, simulated.home],
    ["Grid import", actual.gridImport, simulated.gridImport],
    ["Grid export", actual.gridExport, simulated.gridExport],
    ["Solar generation", actual.solar, simulated.solar],
    ["Battery → home", actual.batteryToHome, simulated.batteryToHome],
    ["Battery export", actual.batteryExport, simulated.batteryExport]
  ].filter(([, first, second]) => Number.isFinite(first) || Number.isFinite(second));
  if (!metrics.length) return `<div class="chart-empty">No comparable energy totals are available for this period.</div>`;
  return `<div class="compare-bars">${metrics.map(([label, actualValue, simulatedValue]) => {
    const maximum = Math.max(0.001, Math.abs(actualValue || 0), Math.abs(simulatedValue || 0));
    const actualWidth = Number.isFinite(actualValue) ? clamp(Math.abs(actualValue) / maximum * 100, 0, 100) : 0;
    const simulatedWidth = Number.isFinite(simulatedValue) ? clamp(Math.abs(simulatedValue) / maximum * 100, 0, 100) : 0;
    return `<div class="compare-bar-row"><header><strong>${escapeHtml(label)}</strong><span>${escapeHtml(formatNumber(actualValue, "kWh", 2))} actual · ${escapeHtml(formatNumber(simulatedValue, "kWh", 2))} KEMS</span></header><div class="compare-bar-pair"><div><span>Actual</span><i><b class="actual" style="width:${actualWidth}%"></b></i></div><div><span>KEMS</span><i><b class="simulated" style="width:${simulatedWidth}%"></b></i></div></div></div>`;
  }).join("")}</div>`;
}

function dayGridChart(history = []) {
  const points = history.filter((point) => point?.at && (Number.isFinite(number(point.grid)) || Number.isFinite(number(point.simulatedGridImport)) || Number.isFinite(number(point.simulatedGridExport))));
  if (points.length < 2) return `<div class="chart-empty">Not enough current-day history is available for a grid comparison chart.</div>`;
  const width = 960, height = 300;
  const pad = { left: 58, right: 22, top: 24, bottom: 42 };
  const start = new Date(points[0].at).getTime();
  const end = new Date(points.at(-1).at).getTime();
  const actualValues = points.map((point) => number(point.grid)).filter(Number.isFinite);
  const simulatedValues = points.map((point) => {
    const imported = number(point.simulatedGridImport);
    const exported = number(point.simulatedGridExport);
    return Number.isFinite(imported) || Number.isFinite(exported) ? (imported || 0) - (exported || 0) : null;
  }).filter(Number.isFinite);
  const values = [...actualValues, ...simulatedValues, 0];
  let minimum = Math.min(...values), maximum = Math.max(...values);
  if (minimum === maximum) { minimum -= 0.5; maximum += 0.5; }
  const x = (at) => pad.left + ((new Date(at).getTime() - start) / Math.max(1, end - start)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - minimum) / (maximum - minimum)) * (height - pad.top - pad.bottom);
  const pathFor = (getter) => {
    const segments = [];
    let current = [];
    for (const point of points) {
      const value = getter(point);
      if (Number.isFinite(value)) current.push([x(point.at), y(value)]);
      else if (current.length) { segments.push(current); current = []; }
    }
    if (current.length) segments.push(current);
    return segments.filter((segment) => segment.length > 1).map((segment) => `M ${segment.map(([px, py], index) => `${index ? "L " : ""}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ")}`).join(" ");
  };
  const actualPath = pathFor((point) => number(point.grid));
  const simulatedPath = pathFor((point) => {
    const imported = number(point.simulatedGridImport), exported = number(point.simulatedGridExport);
    return Number.isFinite(imported) || Number.isFinite(exported) ? (imported || 0) - (exported || 0) : null;
  });
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = maximum - (maximum - minimum) * index / 4;
    const py = y(value);
    return `<line class="chart-gridline" x1="${pad.left}" y1="${py}" x2="${width - pad.right}" y2="${py}"></line><text class="chart-axis" x="${pad.left - 9}" y="${py + 4}" text-anchor="end">${escapeHtml(formatNumber(value, "kW", 1))}</text>`;
  }).join("");
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const timestamp = start + (end - start) * index / 4;
    return `<text class="chart-axis" x="${x(timestamp)}" y="${height - 12}" text-anchor="middle">${escapeHtml(formatTime(timestamp))}</text>`;
  }).join("");
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Actual versus KEMS simulated net grid power"><line class="compare-zero-line" x1="${pad.left}" y1="${y(0)}" x2="${width - pad.right}" y2="${y(0)}"></line>${grid}${ticks}<path class="chart-line" style="stroke:${COLOURS.actual}" d="${actualPath}"></path><path class="chart-line dashed" style="stroke:${COLOURS.simulated}" d="${simulatedPath}"></path></svg><div class="chart-legend"><span><i style="background:${COLOURS.actual}"></i>Actual grid</span><span><i style="background:${COLOURS.simulated}"></i>KEMS simulated grid</span></div></div>`;
}

function actualHistoryChart(data) {
  const series = data.series || [];
  if (!series.length) return `<div class="chart-empty">No retained historical buckets are available for this period.</div>`;
  const rows = series.slice(-(state.range === "month" ? 15 : state.range === "week" ? 8 : 12));
  const metrics = [
    ["Home", "home", COLOURS.home],
    ["Import", "gridImport", COLOURS.negative],
    ["Export", "gridExport", COLOURS.positive]
  ];
  const maximum = Math.max(1, ...rows.flatMap((row) => metrics.map(([, key]) => Math.max(0, number(row[key]) || 0))));
  return `<div class="history-bars"><div class="history-legend">${metrics.map(([label,, colour]) => `<span><i style="background:${colour}"></i>${label}</span>`).join("")}</div>${rows.map((row) => `<div class="history-bar-row"><span>${escapeHtml(row.date || formatDate(row.at))}</span><div>${metrics.map(([label, key, colour]) => { const value = Math.max(0, number(row[key]) || 0); return `<i title="${escapeHtml(`${label}: ${formatNumber(value, "kWh", 2)}`)}"><b style="height:${clamp(value / maximum * 100, 1, 100)}%;background:${colour}"></b></i>`; }).join("")}</div></div>`).join("")}</div>`;
}

function breakdownPanel(title, total, breakdown = {}, type = "actual") {
  const rows = title.toLowerCase().includes("import")
    ? [["Home usage", breakdown.home, COLOURS.home], ["EV charging", breakdown.ev, COLOURS.ev], ["Battery charging", breakdown.battery, COLOURS.battery], ["Unallocated", breakdown.unallocated, COLOURS.muted]]
    : [["Solar export", breakdown.solar, COLOURS.solar], ["Battery export", breakdown.battery, COLOURS.battery], ["Unallocated", breakdown.unallocated, COLOURS.muted]];
  const available = rows.filter(([, value]) => Number.isFinite(number(value)));
  return `<section class="compare-breakdown-card ${type}"><header><span>${escapeHtml(title)}</span><strong>${escapeHtml(formatNumber(total, "kWh", 2))}</strong></header><div>${available.length ? available.map(([label, value, colour]) => { const pct = Number.isFinite(total) && total > 0 ? clamp(number(value) / total * 100, 0, 100) : 0; return `<div class="compare-breakdown-row"><span><i style="background:${colour}"></i>${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(number(value), "kWh", 2))}</strong><small>${formatPercent(pct, 0)}</small></div>`; }).join("") : `<p class="compare-empty-copy">Allocation unavailable for this period.</p>`}</div></section>`;
}

function costPanel(title, totals, type) {
  const rows = [
    ["Gross import cost", totals.importCost],
    ["Export income", totals.exportIncome],
    ["Net electricity cost", totals.netCost],
    ["Gas cost", totals.gasCost],
    ["Whole-home cost", totals.wholeHomeCost],
    ["System value", totals.systemValue]
  ];
  return `<section class="compare-cost-card ${type}"><header><span>${escapeHtml(title)}</span>${sourceBadge(type === "actual" ? "observed" : "simulated", type === "actual" ? "Observed" : "KEMS simulated")}</header>${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatMoney(number(value)))}</strong></div>`).join("")}</section>`;
}

function economicsPanel(economics = {}) {
  const systemCost = number(economics.systemCost);
  const actualValue = number(economics.actualValue);
  const simulatedValue = number(economics.simulatedValue);
  const recovered = Number.isFinite(systemCost) && systemCost > 0 && Number.isFinite(actualValue) ? clamp(actualValue / systemCost * 100, 0, 100) : null;
  return `<div class="compare-economics">
    <section class="compare-roi-summary"><div class="compare-roi-ring" style="--value:${Number.isFinite(recovered) ? recovered : 0}"><span><strong>${escapeHtml(formatPercent(recovered, 1))}</strong><small>actual cost recovered</small></span></div><div><span>System cost</span><strong>${escapeHtml(formatMoney(systemCost))}</strong><p>Actual realised value is kept separate from KEMS simulator evidence and forecast ROI.</p></div></section>
    <div class="compare-roi-grid">
      <div><span>Actual value accrued</span><strong>${escapeHtml(formatMoney(actualValue))}</strong></div>
      <div><span>Actual ROI</span><strong>${escapeHtml(formatPercent(number(economics.actualRoi), 2))}</strong></div>
      <div><span>Actual annualised value</span><strong>${escapeHtml(formatMoney(number(economics.actualAnnualisedValue)))}</strong></div>
      <div><span>Actual payback</span><strong>${escapeHtml(formatDurationYears(number(economics.actualPaybackYears)))}</strong></div>
      <div><span>Simulated value accrued</span><strong>${escapeHtml(formatMoney(simulatedValue))}</strong></div>
      <div><span>Evidence annualised</span><strong>${escapeHtml(formatMoney(number(economics.simulatorEvidenceAnnualValue)))}</strong></div>
      <div><span>Evidence-based ROI</span><strong>${escapeHtml(formatPercent(number(economics.simulatorEvidenceAnnualRoi), 2))}</strong></div>
      <div><span>Evidence payback</span><strong>${escapeHtml(formatDurationYears(number(economics.simulatorEvidencePaybackYears)))}</strong></div>
      <div><span>KEMS annual forecast</span><strong>${escapeHtml(formatMoney(number(economics.predictedAnnualSaving)))}</strong></div>
      <div><span>KEMS forecast ROI</span><strong>${escapeHtml(formatPercent(number(economics.simulatorAnnualRoi), 2))}</strong></div>
      <div><span>Predicted payback</span><strong>${escapeHtml(formatDurationYears(number(economics.predictedPaybackYears)))}</strong></div>
      <div><span>Proposal benchmark</span><strong>${escapeHtml(formatMoney(number(economics.proposalAnnualSavingBenchmark)))}</strong></div>
    </div>
  </div>`;
}

function comparisonTable(actual, simulated) {
  return `<div class="table-scroll"><table class="comparison-table compare-master-table"><thead><tr><th>Measure</th><th>Actual</th><th>KEMS simulated</th><th>Difference</th></tr></thead><tbody>
    ${comparisonRow("Home energy", number(actual.home), number(simulated.home), "kWh", null)}
    ${comparisonRow("Grid import", number(actual.gridImport), number(simulated.gridImport), "kWh", false)}
    ${comparisonRow("Grid export", number(actual.gridExport), number(simulated.gridExport), "kWh", true)}
    ${comparisonRow("EV charging", number(actual.ev), number(simulated.ev), "kWh", null)}
    ${comparisonRow("Solar generation", number(actual.solar), number(simulated.solar), "kWh", null)}
    ${comparisonRow("Battery charged", number(actual.batteryCharge), number(simulated.batteryCharge), "kWh", null)}
    ${comparisonRow("Battery to home", number(actual.batteryToHome), number(simulated.batteryToHome), "kWh", true)}
    ${comparisonRow("Battery export", number(actual.batteryExport), number(simulated.batteryExport), "kWh", true)}
    ${comparisonRow("Gross import cost", number(actual.importCost), number(simulated.importCost), "GBP", false)}
    ${comparisonRow("Export income", number(actual.exportIncome), number(simulated.exportIncome), "GBP", true)}
    ${comparisonRow("Net electricity cost", number(actual.netCost), number(simulated.netCost), "GBP", false)}
    ${comparisonRow("Gas cost", number(actual.gasCost), number(simulated.gasCost), "GBP", null)}
    ${comparisonRow("Whole-home cost", number(actual.wholeHomeCost), number(simulated.wholeHomeCost), "GBP", false)}
    ${comparisonRow("System value", number(actual.systemValue), number(simulated.systemValue), "GBP", true)}
  </tbody></table></div>`;
}

function render() {
  if (state.loading && !state.data) {
    app.innerHTML = `${maintenanceBanner()}<section class="loading-screen"><img src="logo.svg" alt="" /><h1>Loading ${escapeHtml(RANGE_LABELS[state.range])} comparison</h1><p>Reading actual and KEMS simulated period totals…</p></section>`;
    return;
  }
  if (state.error && !state.data) {
    app.innerHTML = `<section class="fatal"><img src="logo.svg" alt="" /><h1>Comparison unavailable</h1><p>${escapeHtml(state.error)}</p><button class="button primary" id="retry-button" type="button">Try again</button></section>`;
    document.querySelector("#retry-button")?.addEventListener("click", () => refresh(true));
    return;
  }
  const data = state.data || {};
  const actual = normaliseTotals(data.actual?.totals || {});
  const simulated = normaliseTotals(data.simulated?.totals || {});
  const importSaved = improvement(number(actual.gridImport), number(simulated.gridImport), false);
  const extraExport = improvement(number(actual.gridExport), number(simulated.gridExport), true);
  const saving = periodSaving(actual, simulated);
  const batteryContribution = number(simulated.batteryToHome);
  const headerBadges = `${sourceBadge("observed", "Actual")}${sourceBadge("simulated", "KEMS what-if")}${statusPill(data.label || RANGE_LABELS[state.range], "neutral")}`;
  const historyBlock = state.range === "day"
    ? card("Net grid power through today", dayGridChart(data.history || []), "Above zero is import; below zero is export. Both lines use the same current-day timeline.", "chart-panel")
    : `<div class="comparison-grid compare-history-grid">${card("Actual energy history", actualHistoryChart(data), "Retained Home Assistant / KEMS buckets for the selected period.", "chart-panel")}${card("Aggregate energy comparison", pairedEnergyBars(actual, simulated), "Each pair compares the full selected-period total.", "chart-panel")}</div>`;

  app.innerHTML = `${maintenanceBanner()}
    <header class="page-heading compare-heading"><div><p class="eyebrow">KEMS 0.7.0-alpha6 · web.12</p><h1>Actual vs KEMS</h1><p>${escapeHtml(data.label || RANGE_LABELS[state.range])}. See what actually happened beside the KEMS simulation, then inspect the energy, cost and ROI difference.</p></div><div class="heading-badges">${headerBadges}${rangeControls()}</div></header>
    ${headline(actual, simulated)}
    <div class="metric-grid four compare-kpis">
      ${metricCard("Grid import avoided", formatNumber(importSaved, "kWh", 2), Number.isFinite(importSaved) && number(actual.gridImport) > 0 ? `${formatPercent(importSaved / actual.gridImport * 100, 1)} of observed import` : "Comparison unavailable", importSaved > 0 ? "positive" : "calculated", "↓")}
      ${metricCard("Extra export", formatNumber(extraExport, "kWh", 2), "KEMS simulated minus actual", extraExport > 0 ? "positive" : "calculated", "↑")}
      ${metricCard("Cost difference", formatMoney(saving), Number.isFinite(saving) ? (saving >= 0 ? "KEMS simulated saving" : "KEMS simulated extra cost") : "Comparison unavailable", saving > 0 ? "positive" : "simulated", "£")}
      ${metricCard("Battery to home", formatNumber(batteryContribution, "kWh", 2), "Virtual battery contribution", "simulated", "▰")}
    </div>
    ${card("Why KEMS performed differently", whyKems(actual, simulated, data), "These explanations are derived only from retained actual-versus-simulated totals; they do not invent physical flows.", "compare-why-panel")}
    ${historyBlock}
    ${card("Actual vs KEMS totals", comparisonTable(actual, simulated), "A positive green difference means the simulated KEMS outcome improved the relevant measure.", "comparison-table-panel")}
    <div class="compare-breakdown-grid">
      ${breakdownPanel("Actual grid import", number(actual.gridImport), data.actual?.breakdowns?.gridImport || {}, "actual")}
      ${breakdownPanel("KEMS grid import", number(simulated.gridImport), data.simulated?.breakdowns?.gridImport || {}, "simulated")}
      ${breakdownPanel("Actual grid export", number(actual.gridExport), data.actual?.breakdowns?.gridExport || {}, "actual")}
      ${breakdownPanel("KEMS grid export", number(simulated.gridExport), data.simulated?.breakdowns?.gridExport || {}, "simulated")}
    </div>
    <div class="compare-cost-grid">
      ${costPanel("Actual costs", actual, "actual")}
      ${costPanel("KEMS simulated costs", simulated, "simulated")}
    </div>
    ${card("System cost, actual ROI and KEMS simulator ROI", economicsPanel(data.economics || {}), "Realised return, simulator evidence and forecast return remain clearly separated.", "economics-panel compare-economics-panel")}
    ${periodNotes(data)}
    <footer class="site-footer"><div><strong>KEMS web.12 comparison</strong><span>Read-only actual vs simulated analysis</span></div><div><span>${escapeHtml(state.site?.name || "KEMS Home")}</span><span>Updated ${escapeHtml(formatTime(state.updatedAt))}</span></div></footer>`;
}

function updateShell() {
  const connected = Boolean(state.live?.connected);
  connectionPill.classList.toggle("connected", connected);
  connectionPill.classList.toggle("error", !connected);
  connectionPill.querySelector("span").textContent = connected ? `Live · ${formatTime(state.live?.updatedAt)}` : "Connection issue";
  const label = document.querySelector("#site-label");
  if (label) label.textContent = `${state.site?.name || "KEMS Home"} · compare`;
  document.title = `KEMS — ${state.site?.name || "KEMS Home"} — Actual vs KEMS`;
}

async function refresh(showToast = false) {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  refreshButton.classList.add("spinning");
  if (!state.data) render();
  try {
    const [data, live, site, maintenance] = await Promise.all([
      getJson(`/api/analytics?range=${encodeURIComponent(state.range)}`),
      getJson("/api/live"),
      getJson("/api/site").catch(() => ({ name: "KEMS Home" })),
      getJson("/api/maintenance").catch(() => ({ maintenance: { status: "none" } }))
    ]);
    if (!data.available) throw new Error(data.error || "Comparison data is unavailable.");
    state.data = data;
    state.live = live;
    state.site = site;
    state.maintenance = maintenance;
    state.updatedAt = new Date().toISOString();
    updateShell();
    render();
    if (showToast) toast("Comparison refreshed.", "good");
  } catch (error) {
    state.error = error.message || String(error);
    if (showToast) toast(state.error, "danger");
    render();
  } finally {
    state.loading = false;
    refreshButton.classList.remove("spinning");
  }
}

function toast(message, tone = "neutral") {
  const element = document.createElement("div");
  element.className = `toast ${tone}`;
  element.textContent = message;
  toastRoot.append(element);
  setTimeout(() => element.remove(), 4000);
}

document.addEventListener("click", async (event) => {
  const rangeButton = event.target.closest("[data-range]");
  if (rangeButton) {
    const range = rangeButton.dataset.range;
    if (!RANGES.has(range) || range === state.range) return;
    state.range = range;
    state.data = null;
    history.replaceState({}, "", `/compare.html?range=${encodeURIComponent(range)}`);
    await refresh(false);
  }
});

refreshButton.addEventListener("click", () => refresh(true));
menuButton.addEventListener("click", () => {
  const open = mobileNav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});
mobileNav.addEventListener("click", () => {
  mobileNav.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
});

refresh(false);
setInterval(() => {
  if (document.visibilityState === "visible" && state.range === "day") refresh(false);
}, 60_000);
