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
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
}
function kw(value, digits = 2) { return Number.isFinite(value) ? `${value.toFixed(digits)} kW` : "—"; }
function pct(value) { return Number.isFinite(value) ? `${Math.max(0, Math.min(100, value)).toFixed(0)}%` : "—"; }
function time(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
async function getJson(url) { const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error(`Request failed (${response.status})`); return response.json(); }

function mappedRows() {
  const rows = analytics?.history || [];
  return rows.map((r) => mode === "live"
    ? { at: r.at, home: n(r.house), solar: n(r.solarLive), battery: n(r.batteryLive), soc: n(r.socLive), ev: n(r.ev) }
    : { at: r.at, home: n(r.simulatedHouse), solar: n(r.solarSimulated), battery: n(r.simulatedBattery), soc: n(r.socSimulated), ev: n(r.ev) });
}

function points(rows, key, w, h, pad, min, max) {
  return rows.map((row, index) => {
    const value = n(row[key]);
    if (value === null) return null;
    const x = pad + (rows.length <= 1 ? 0 : index / (rows.length - 1) * (w - pad * 2));
    const y = h - pad - (value - min) / (max - min || 1) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
}

function chart() {
  const rows = mappedRows();
  if (rows.length < 2) return `<p class="web21-muted">Building ${mode} history for today…</p>`;
  const w = 900, h = 330, pad = 44;
  const values = rows.flatMap((r) => series.map((s) => r[s.key]).filter(Number.isFinite));
  if (!values.length) return `<p class="web21-muted">No ${mode} power series is available yet.</p>`;
  let min = Math.min(0, ...values), max = Math.max(1, ...values);
  if (min === max) max = min + 1;
  const powerLines = series.map((s) => {
    const p = points(rows, s.key, w, h, pad, min, max);
    return p ? `<polyline fill="none" stroke="${s.stroke}" stroke-width="2.4" points="${p}" />` : "";
  }).join("");
  const socPoints = rows.map((r, index) => {
    if (!Number.isFinite(r.soc)) return null;
    const x = pad + index / (rows.length - 1) * (w - pad * 2);
    const y = h - pad - r.soc / 100 * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
  const grid = [0, .25, .5, .75, 1].map((f) => {
    const y = pad + f * (h - pad * 2);
    const val = max - (max - min) * f;
    return `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="rgba(135,191,209,.13)"/><text x="4" y="${y + 4}" fill="currentColor" opacity=".65" font-size="11">${val.toFixed(1)}kW</text><text x="${w - 38}" y="${y + 4}" fill="currentColor" opacity=".65" font-size="11">${Math.round((1 - f) * 100)}%</text>`;
  }).join("");
  return `<div class="web21-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(mode)} solar, battery, home, EV and battery SOC chart">${grid}${powerLines}${socPoints ? `<polyline fill="none" stroke="#b7a0f6" stroke-width="2.4" stroke-dasharray="5 4" points="${socPoints}"/>` : ""}<text x="${pad}" y="${h - 8}" fill="currentColor" opacity=".6" font-size="11">${esc(time(rows[0].at))}</text><text x="${w - pad - 35}" y="${h - 8}" fill="currentColor" opacity=".6" font-size="11">${esc(time(rows.at(-1)?.at))}</text></svg></div><div class="web21-chart-key">${series.map((s) => `<span style="color:${s.stroke}">${s.label}</span>`).join("")}<span style="color:#b7a0f6">Battery SoC · right axis</span></div>`;
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
    costToday: n(liveNow?.observed?.costToday) ?? n(analytics?.actual?.totals?.netCost),
    source: "Live physical telemetry"
  });
}

function simulatedPanelValues() {
  const row = (analytics?.history || []).at(-1) || {};
  const home = n(row.simulatedHouse);
  const solar = n(row.solarSimulated);
  const battery = n(row.simulatedBattery);
  const batterySoc = n(row.socSimulated);
  const ev = n(row.ev);
  const gridNet = [home, solar, battery].every(Number.isFinite) ? home - solar - battery : null;
  return buildPanelValues({
    home,
    solar,
    battery,
    batterySoc,
    gridImport: gridNet !== null ? Math.max(0, gridNet) : null,
    gridExport: gridNet !== null ? Math.max(0, -gridNet) : null,
    gridAvailable: gridNet !== null,
    ev,
    evSoc: null,
    evConnected: Number.isFinite(ev) && ev > PANEL_THRESHOLD,
    evCharging: Number.isFinite(ev) && ev > PANEL_THRESHOLD,
    costToday: n(analytics?.simulated?.totals?.netCost),
    source: "Full KEMS Agile digital twin"
  });
}

function buildPanelValues(v) {
  return {
    ...v,
    gridImporting: Number.isFinite(v.gridImport) && v.gridImport > PANEL_THRESHOLD,
    gridExporting: Number.isFinite(v.gridExport) && v.gridExport > PANEL_THRESHOLD,
    solarProducing: Number.isFinite(v.solar) && v.solar > PANEL_THRESHOLD,
    batteryCharging: Number.isFinite(v.battery) && v.battery < -PANEL_THRESHOLD,
    batteryDischarging: Number.isFinite(v.battery) && v.battery > PANEL_THRESHOLD
  };
}

function statusTone(active, available = true) {
  if (!available) return "unknown";
  return active ? "good" : "idle";
}
function statusTile(label, value, tone, detail) {
  return `<div class="kems-status-tile ${tone}"><span>${label}</span><strong>${value}</strong><small>${esc(detail)}</small></div>`;
}
function flowClass(active, reverse = false) {
  return `kems-web-flow${active ? " active" : ""}${reverse ? " reverse" : ""}`;
}
function batteryNode(v) {
  if (!Number.isFinite(v.batterySoc)) return `<div class="kems-web-node battery unavailable"><div class="kems-web-icon">▰</div><span>BATTERY</span><strong>—</strong><small>${mode === "live" ? "Physical battery unavailable" : "Simulated battery unavailable"}</small></div>`;
  const soc = Math.max(0, Math.min(100, v.batterySoc));
  const state = v.batteryCharging ? "Charging" : v.batteryDischarging ? "Discharging" : "Idle";
  return `<div class="kems-web-node battery${soc < 10 ? " low" : ""}"><div class="kems-battery-gauge" aria-hidden="true"><i style="--soc:${soc}%"></i></div><span>BATTERY</span><strong>${pct(soc)}</strong><small>${state}${Number.isFinite(v.battery) ? ` · ${kw(Math.abs(v.battery))}` : ""}</small></div>`;
}

function panelHtml() {
  const v = mode === "live" ? livePanelValues() : simulatedPanelValues();
  const costKnown = Number.isFinite(v.costToday);
  const costGood = costKnown && v.costToday <= 0;
  const gridStatus = v.gridAvailable ? "✓" : "×";
  const costValue = !costKnown ? "—" : costGood ? "✓" : "×";
  const importValue = v.gridImporting ? "✓" : "×";
  const exportValue = v.gridExporting ? "✓" : "×";
  const gridText = v.gridImporting ? `Grid importing ${kw(v.gridImport)}` : v.gridExporting ? `Grid exporting ${kw(v.gridExport)}` : v.gridAvailable ? "Grid balanced" : "Grid unavailable";
  const batteryText = Number.isFinite(v.batterySoc) ? `Battery ${pct(v.batterySoc)}` : "Battery unavailable";
  const modeLabel = mode === "live" ? "Live" : "Simulated";

  return `<section id="web29-agile-panel" class="web21-section"><div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap"><div><div class="web21-kicker">Full KEMS Agile · ${modeLabel}</div><h2>KEMS Panel View</h2><p class="web21-muted">The same panel-inspired energy view as Live Data, switched between physical telemetry and the Full KEMS Agile digital twin.</p></div><div class="web21-toggle" role="group" aria-label="Live or simulated"><button type="button" data-agile-mode="live" class="${mode === "live" ? "active" : ""}">Live</button><button type="button" data-agile-mode="simulated" class="${mode === "simulated" ? "active" : ""}">Simulated</button></div></div><div class="kems-panel-shell"><div class="kems-web-panel" role="img" aria-label="${esc(`${modeLabel} KEMS energy panel. ${gridText}. ${batteryText}.`)}"><div class="kems-web-status">${statusTile("GRID", gridStatus, v.gridAvailable ? "good" : "bad", v.gridAvailable ? (mode === "live" ? "Connected" : "Digital twin available") : "Unavailable")}${statusTile("COST", costValue, !costKnown ? "unknown" : costGood ? "good" : "bad", !costKnown ? "No cost evidence yet" : costGood ? "Net saving / income" : "Net cost today")}${statusTile("IMPORT", importValue, statusTone(v.gridImporting, v.gridAvailable), v.gridImporting ? kw(v.gridImport) : "Not importing")}${statusTile("EXPORT", exportValue, statusTone(v.gridExporting, v.gridAvailable), v.gridExporting ? kw(v.gridExport) : "Not exporting")}</div><div class="kems-web-stage"><div class="${flowClass(v.solarProducing)} kems-web-connector solar-link solar-colour"><i></i></div><div class="${flowClass(v.gridImporting || v.gridExporting, v.gridExporting)} kems-web-connector grid-link grid-colour"><i></i></div><div class="${flowClass(v.batteryCharging || v.batteryDischarging, v.batteryDischarging)} kems-web-connector battery-link battery-colour"><i></i></div><div class="${flowClass(v.evCharging)} kems-web-connector ev-link ev-colour"><i></i></div><div class="kems-web-node solar"><div class="kems-web-icon">☀</div><span>SOLAR</span><strong>${kw(v.solar)}</strong><small>${Number.isFinite(v.solar) ? (v.solarProducing ? "Generating" : "Idle") : mode === "live" ? "Physical solar unavailable" : "Simulated solar unavailable"}</small></div><div class="kems-web-node grid"><div class="kems-web-icon">⌁</div><span>GRID</span><strong>${v.gridImporting ? kw(v.gridImport) : v.gridExporting ? kw(v.gridExport) : v.gridAvailable ? "0.00 kW" : "—"}</strong><small>${v.gridImporting ? "Importing" : v.gridExporting ? "Exporting" : v.gridAvailable ? "Balanced" : "Unavailable"}</small></div><div class="kems-web-node home"><div class="kems-web-icon">⌂</div><span>HOME</span><strong>${kw(v.home)}</strong><small>${mode === "live" ? "Live house load" : "Digital-twin demand"}</small></div>${batteryNode(v)}<div class="kems-web-node ev"><div class="kems-web-icon">⚡</div><span>EV</span><strong>${kw(v.ev)}</strong><small>${v.evCharging ? `Charging${Number.isFinite(v.evSoc) ? ` · SoC ${pct(v.evSoc)}` : ""}` : v.evConnected ? `Connected${Number.isFinite(v.evSoc) ? ` · SoC ${pct(v.evSoc)}` : ""}` : "Not connected"}</small></div></div></div></div><div class="kems-panel-caption"><span class="kems-panel-state-dot"></span><b>${modeLabel} mode</b><span>·</span><span>${esc(gridText)}</span><span>·</span><span>${esc(batteryText)}</span><span>·</span><span>${esc(v.source)}</span></div></section>`;
}

function historyHtml() {
  const modeLabel = mode === "live" ? "Live" : "Simulated";
  return `<section id="web21-agile-history" class="web21-section"><div class="web21-kicker">Full KEMS Agile telemetry · ${modeLabel}</div><h2>Energy through today</h2><p class="web21-muted">Solar generation, battery power and SoC, home usage and EV usage on one timeline.</p>${chart()}<p class="web21-muted" style="margin-bottom:0">Live uses only physical telemetry. Simulated uses the Full KEMS Agile digital twin; EV usage remains the same retained household EV demand in both views.</p></section>`;
}

function bindModeButtons() {
  document.querySelectorAll("[data-agile-mode]").forEach((button) => button.addEventListener("click", () => {
    mode = button.dataset.agileMode;
    localStorage.setItem("kems-agile-view-mode", mode);
    render();
  }));
}

function render() {
  if (!app || !analytics) return;
  const combined = `${panelHtml()}${historyHtml()}`;
  const panel = document.querySelector("#web29-agile-panel");
  const history = document.querySelector("#web21-agile-history");
  if (panel && history) {
    panel.outerHTML = panelHtml();
    const nextHistory = document.querySelector("#web21-agile-history");
    if (nextHistory) nextHistory.outerHTML = historyHtml();
  } else {
    panel?.remove();
    history?.remove();
    const heading = app.querySelector(".page-heading") || app.firstElementChild;
    heading?.insertAdjacentHTML("afterend", combined);
  }
  bindModeButtons();
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const [analyticsResult, liveResult] = await Promise.allSettled([
      getJson("/api/analytics?range=day"),
      getJson("/api/live")
    ]);
    if (analyticsResult.status === "fulfilled") analytics = analyticsResult.value;
    if (liveResult.status === "fulfilled") liveNow = liveResult.value;
    render();
  } finally {
    loading = false;
  }
}

const observer = new MutationObserver(() => {
  if (analytics && (!document.querySelector("#web29-agile-panel") || !document.querySelector("#web21-agile-history"))) render();
});
if (app) observer.observe(app, { childList: true, subtree: false });
refresh();
setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
