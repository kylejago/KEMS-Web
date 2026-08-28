const app = document.querySelector("#agile-app");
let mode = localStorage.getItem("kems-agile-view-mode") || "simulated";
let analytics = null;
let liveNow = null;
let loading = false;
const PANEL_THRESHOLD = 0.03;

const series = [
  { key: "home", label: "Home usage", stroke: "#55d9e6" },
  { key: "solar", label: "Solar generation", stroke: "#f4d47a" },
  { key: "battery", label: "Battery power", stroke: "#7cc8ff" },
  { key: "ev", label: "EV usage", stroke: "#c3ef77" }
];

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function kw(value, digits = 2) { return Number.isFinite(value) ? `${value.toFixed(digits)} kW` : "—"; }
function pct(value) { return Number.isFinite(value) ? `${Math.max(0, Math.min(100, value)).toFixed(0)}%` : "—"; }
function time(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
async function getJson(url) { const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error(`Request failed (${response.status})`); return response.json(); }
function liveEntity(id) { return (liveNow?.entities || []).find((item) => item.entityId === id) || null; }
function liveEntityNumber(id) { const item = liveEntity(id); return item?.available ? n(item.state) : null; }
function billToday(side) { return liveEntity("sensor.kems_energy_cost_comparison")?.attributes?.periods?.today?.[side] || {}; }

function mappedRows() {
  const rows = analytics?.history || [];
  return rows.map((row) => mode === "live"
    ? { at: row.at, home: n(row.house), solar: n(row.solarLive), battery: n(row.batteryLive), soc: n(row.socLive), ev: n(row.ev) }
    : { at: row.at, home: n(row.simulatedHouse), solar: n(row.solarSimulated), battery: n(row.simulatedBattery), soc: n(row.socSimulated), ev: n(row.ev) });
}

function points(rows, key, width, height, pad, min, max) {
  return rows.map((row, index) => {
    const value = n(row[key]);
    if (value === null) return null;
    const x = pad + (rows.length <= 1 ? 0 : index / (rows.length - 1) * (width - pad * 2));
    const y = height - pad - (value - min) / (max - min || 1) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
}

function chart() {
  const rows = mappedRows();
  if (rows.length < 2) return `<p class="web21-muted">Building ${mode} history for today…</p>`;
  const width = 900, height = 330, pad = 44;
  const values = rows.flatMap((row) => series.map((item) => row[item.key]).filter(Number.isFinite));
  if (!values.length) return `<p class="web21-muted">No ${mode} power series is available yet.</p>`;
  let min = Math.min(0, ...values), max = Math.max(1, ...values);
  if (min === max) max = min + 1;
  const powerLines = series.map((item) => {
    const linePoints = points(rows, item.key, width, height, pad, min, max);
    return linePoints ? `<polyline fill="none" stroke="${item.stroke}" stroke-width="2.4" points="${linePoints}" />` : "";
  }).join("");
  const socPoints = rows.map((row, index) => {
    if (!Number.isFinite(row.soc)) return null;
    const x = pad + index / (rows.length - 1) * (width - pad * 2);
    const y = height - pad - row.soc / 100 * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
  const grid = [0, .25, .5, .75, 1].map((fraction) => {
    const y = pad + fraction * (height - pad * 2);
    const value = max - (max - min) * fraction;
    return `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="rgba(135,191,209,.13)"/><text x="4" y="${y + 4}" fill="currentColor" opacity=".65" font-size="11">${value.toFixed(1)}kW</text><text x="${width - 38}" y="${y + 4}" fill="currentColor" opacity=".65" font-size="11">${Math.round((1 - fraction) * 100)}%</text>`;
  }).join("");
  return `<div class="web21-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(mode)} solar, battery, home, EV and battery SOC chart">${grid}${powerLines}${socPoints ? `<polyline fill="none" stroke="#b7a0f6" stroke-width="2.4" stroke-dasharray="5 4" points="${socPoints}"/>` : ""}<text x="${pad}" y="${height - 8}" fill="currentColor" opacity=".6" font-size="11">${esc(time(rows[0].at))}</text><text x="${width - pad - 35}" y="${height - 8}" fill="currentColor" opacity=".6" font-size="11">${esc(time(rows.at(-1)?.at))}</text></svg></div><div class="web21-chart-key">${series.map((item) => `<span style="color:${item.stroke}">${item.label}</span>`).join("")}<span style="color:#b7a0f6">Battery SoC · right axis</span></div>`;
}

function buildPanelValues(values) {
  return {
    ...values,
    gridImporting: Number.isFinite(values.gridImport) && values.gridImport > PANEL_THRESHOLD,
    gridExporting: Number.isFinite(values.gridExport) && values.gridExport > PANEL_THRESHOLD,
    solarProducing: Number.isFinite(values.solar) && values.solar > PANEL_THRESHOLD,
    batteryCharging: Number.isFinite(values.battery) && values.battery < -PANEL_THRESHOLD,
    batteryDischarging: Number.isFinite(values.battery) && values.battery > PANEL_THRESHOLD
  };
}

function livePanelValues() {
  const metrics = liveNow?.metrics || {};
  const availability = liveNow?.availability || {};
  const gridNet = n(metrics.gridPower);
  const gridKnown = availability.liveGrid !== false && (n(metrics.gridImportPower) !== null || n(metrics.gridExportPower) !== null || gridNet !== null);
  const gridImport = n(metrics.gridImportPower) ?? (gridNet !== null ? Math.max(0, gridNet) : null);
  const gridExport = n(metrics.gridExportPower) ?? (gridNet !== null ? Math.max(0, -gridNet) : null);
  const solarKnown = metrics.solarDataAvailable !== false && availability.liveSolar !== false;
  const batteryKnown = metrics.batteryDataAvailable !== false && availability.liveBattery !== false;
  const totalPence = n(billToday("live_data").total_energy_cost_pence);
  return buildPanelValues({
    home: n(metrics.housePower),
    solar: solarKnown ? n(metrics.solarPower) : null,
    battery: batteryKnown ? n(metrics.batteryPower) : null,
    batterySoc: batteryKnown ? n(metrics.batterySoc) : null,
    gridImport: gridKnown ? gridImport : null,
    gridExport: gridKnown ? gridExport : null,
    gridAvailable: Boolean(liveNow?.connected && gridKnown),
    ev: n(metrics.evPower),
    evSoc: n(metrics.evSoc),
    evConnected: Boolean(metrics.evConnected),
    evCharging: Boolean(metrics.evCharging),
    costToday: Number.isFinite(totalPence) ? totalPence / 100 : null,
    source: "Live physical telemetry"
  });
}

function simulatedPanelValues() {
  const totalPence = n(billToday("kems").total_energy_cost_pence);
  const gridImport = liveEntityNumber("sensor.kems_simulated_grid_import_power");
  const gridExport = liveEntityNumber("sensor.kems_simulated_grid_export_power");
  const ev = n(liveNow?.metrics?.evPower);
  return buildPanelValues({
    home: liveEntityNumber("sensor.kems_simulated_house_load_power"),
    solar: liveEntityNumber("sensor.kems_simulated_solar_power"),
    battery: liveEntityNumber("sensor.kems_simulated_battery_power"),
    batterySoc: liveEntityNumber("sensor.kems_simulated_battery_state_of_charge"),
    gridImport,
    gridExport,
    gridAvailable: Number.isFinite(gridImport) || Number.isFinite(gridExport),
    ev,
    evSoc: n(liveNow?.metrics?.evSoc),
    evConnected: Boolean(liveNow?.metrics?.evConnected),
    evCharging: Number.isFinite(ev) && ev > PANEL_THRESHOLD,
    costToday: Number.isFinite(totalPence) ? totalPence / 100 : null,
    source: "KEMS canonical digital twin"
  });
}

function statusTone(active, available = true) { if (!available) return "unknown"; return active ? "good" : "idle"; }
function statusTile(label, value, tileTone, detail) { return `<div class="kems-status-tile ${tileTone}"><span>${label}</span><strong>${value}</strong><small>${esc(detail)}</small></div>`; }
function flowClass(active, reverse = false) { return `kems-web-flow${active ? " active" : ""}${reverse ? " reverse" : ""}`; }
function batteryNode(values) {
  if (!Number.isFinite(values.batterySoc)) return `<div class="kems-web-node battery unavailable"><div class="kems-web-icon">▰</div><span>BATTERY</span><strong>—</strong><small>${mode === "live" ? "Physical battery unavailable" : "Simulated battery unavailable"}</small></div>`;
  const soc = Math.max(0, Math.min(100, values.batterySoc));
  const state = values.batteryCharging ? "Charging" : values.batteryDischarging ? "Discharging" : "Idle";
  return `<div class="kems-web-node battery${soc < 10 ? " low" : ""}"><div class="kems-battery-gauge" aria-hidden="true"><i style="--soc:${soc}%"></i></div><span>BATTERY</span><strong>${pct(soc)}</strong><small>${state}${Number.isFinite(values.battery) ? ` · ${kw(Math.abs(values.battery))}` : ""}</small></div>`;
}

function panelHtml() {
  const values = mode === "live" ? livePanelValues() : simulatedPanelValues();
  const costKnown = Number.isFinite(values.costToday);
  const costGood = costKnown && values.costToday <= 0;
  const gridStatus = values.gridAvailable ? "✓" : "×";
  const costValue = !costKnown ? "—" : costGood ? "✓" : "×";
  const importValue = values.gridImporting ? "✓" : "×";
  const exportValue = values.gridExporting ? "✓" : "×";
  const gridText = values.gridImporting ? `Grid importing ${kw(values.gridImport)}` : values.gridExporting ? `Grid exporting ${kw(values.gridExport)}` : values.gridAvailable ? "Grid balanced" : "Grid unavailable";
  const batteryText = Number.isFinite(values.batterySoc) ? `Battery ${pct(values.batterySoc)}` : "Battery unavailable";
  const modeLabel = mode === "live" ? "Live" : "KEMS";

  return `<section id="web29-agile-panel" class="web21-section"><div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap"><div><div class="web21-kicker">KEMS · ${modeLabel}</div><h2>KEMS Panel View</h2><p class="web21-muted">Switch between physical Live Data and the canonical KEMS digital twin. KEMS current grid and battery routing comes directly from Alpha8 simulation entities rather than being reconstructed in the browser.</p></div><div class="web21-toggle" role="group" aria-label="Live or KEMS"><button type="button" data-agile-mode="live" class="${mode === "live" ? "active" : ""}">Live</button><button type="button" data-agile-mode="simulated" class="${mode === "simulated" ? "active" : ""}">KEMS</button></div></div><div class="kems-panel-shell"><div class="kems-web-panel" role="img" aria-label="${esc(`${modeLabel} KEMS energy panel. ${gridText}. ${batteryText}.`)}"><div class="kems-web-status">${statusTile("GRID", gridStatus, values.gridAvailable ? "good" : "bad", values.gridAvailable ? (mode === "live" ? "Connected" : "Digital twin available") : "Unavailable")}${statusTile("COST", costValue, !costKnown ? "unknown" : costGood ? "good" : "bad", !costKnown ? "No bill evidence yet" : costGood ? "Net saving / income" : "Total energy cost today")}${statusTile("IMPORT", importValue, statusTone(values.gridImporting, values.gridAvailable), values.gridImporting ? kw(values.gridImport) : "Not importing")}${statusTile("EXPORT", exportValue, statusTone(values.gridExporting, values.gridAvailable), values.gridExporting ? kw(values.gridExport) : "Not exporting")}</div><div class="kems-web-stage"><div class="${flowClass(values.solarProducing)} kems-web-connector solar-link solar-colour"><i></i></div><div class="${flowClass(values.gridImporting || values.gridExporting, values.gridExporting)} kems-web-connector grid-link grid-colour"><i></i></div><div class="${flowClass(values.batteryCharging || values.batteryDischarging, values.batteryDischarging)} kems-web-connector battery-link battery-colour"><i></i></div><div class="${flowClass(values.evCharging)} kems-web-connector ev-link ev-colour"><i></i></div><div class="kems-web-node solar"><div class="kems-web-icon">☀</div><span>SOLAR</span><strong>${kw(values.solar)}</strong><small>${Number.isFinite(values.solar) ? (values.solarProducing ? "Generating" : "Idle") : mode === "live" ? "Physical solar unavailable" : "Simulated solar unavailable"}</small></div><div class="kems-web-node grid"><div class="kems-web-icon">⌁</div><span>GRID</span><strong>${values.gridImporting ? kw(values.gridImport) : values.gridExporting ? kw(values.gridExport) : values.gridAvailable ? "0.00 kW" : "—"}</strong><small>${values.gridImporting ? "Importing" : values.gridExporting ? "Exporting" : values.gridAvailable ? "Balanced" : "Unavailable"}</small></div><div class="kems-web-node home"><div class="kems-web-icon">⌂</div><span>HOME</span><strong>${kw(values.home)}</strong><small>${mode === "live" ? "Live house load" : "KEMS digital-twin demand"}</small></div>${batteryNode(values)}<div class="kems-web-node ev"><div class="kems-web-icon">⚡</div><span>EV</span><strong>${kw(values.ev)}</strong><small>${values.evCharging ? `Charging${Number.isFinite(values.evSoc) ? ` · SoC ${pct(values.evSoc)}` : ""}` : values.evConnected ? `Connected${Number.isFinite(values.evSoc) ? ` · SoC ${pct(values.evSoc)}` : ""}` : "Not connected"}</small></div></div></div></div><div class="kems-panel-caption"><span class="kems-panel-state-dot"></span><b>${modeLabel} mode</b><span>·</span><span>${esc(gridText)}</span><span>·</span><span>${esc(batteryText)}</span><span>·</span><span>${esc(values.source)}</span></div></section>`;
}

function historyHtml() {
  const modeLabel = mode === "live" ? "Live" : "KEMS";
  return `<section id="web21-agile-history" class="web21-section"><div class="web21-kicker">KEMS telemetry · ${modeLabel}</div><h2>Energy through today</h2><p class="web21-muted">Solar generation, battery power and SoC, home usage and EV usage on one timeline.</p>${chart()}<p class="web21-muted" style="margin-bottom:0">Live uses physical telemetry. KEMS uses retained canonical digital-twin history; EV usage remains the same retained household EV demand in both views.</p></section>`;
}

function bindModeButtons() {
  document.querySelectorAll("[data-agile-mode]").forEach((button) => button.addEventListener("click", () => {
    mode = button.dataset.agileMode;
    localStorage.setItem("kems-agile-view-mode", mode);
    render();
  }));
}

function render() {
  if (!app || !analytics || !liveNow) return;
  const panel = document.querySelector("#web29-agile-panel");
  const history = document.querySelector("#web21-agile-history");
  if (panel && history) {
    panel.outerHTML = panelHtml();
    const nextHistory = document.querySelector("#web21-agile-history");
    if (nextHistory) nextHistory.outerHTML = historyHtml();
  } else {
    panel?.remove();
    history?.remove();
    const heading = app.querySelector(".agile-hero") || app.firstElementChild;
    heading?.insertAdjacentHTML("afterend", `${panelHtml()}${historyHtml()}`);
  }
  bindModeButtons();
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const [analyticsResult, liveResult] = await Promise.allSettled([getJson("/api/analytics?range=day"), getJson("/api/live")]);
    if (analyticsResult.status === "fulfilled") analytics = analyticsResult.value;
    if (liveResult.status === "fulfilled") liveNow = liveResult.value;
    render();
  } finally {
    loading = false;
  }
}

const observer = new MutationObserver(() => {
  if (analytics && liveNow && (!document.querySelector("#web29-agile-panel") || !document.querySelector("#web21-agile-history"))) render();
});
if (app) observer.observe(app, { childList: true, subtree: false });
refresh();
setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
