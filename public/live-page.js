const app = document.querySelector("#live-app");
const refreshButton = document.querySelector("#refresh-button");
const connectionPill = document.querySelector("#connection-pill");
let live = null;
let analytics = null;
let busy = false;

const POWER_SERIES = [
  { key: "house", label: "Home", stroke: "#55d9e6" },
  { key: "grid", label: "Grid (+ import / − export)", stroke: "#b7a0f6" },
  { key: "solarLive", label: "Solar", stroke: "#f4d47a" },
  { key: "batteryLive", label: "Battery (+ discharge / − charge)", stroke: "#7cc8ff" },
  { key: "ev", label: "EV", stroke: "#c3ef77" }
];

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function kw(value, digits = 2) { return Number.isFinite(value) ? `${value.toFixed(digits)} kW` : "—"; }
function kwh(value, digits = 2) { return Number.isFinite(value) ? `${value.toFixed(digits)} kWh` : "—"; }
function pct(value) { return Number.isFinite(value) ? `${value.toFixed(0)}%` : "—"; }
function money(value) { return Number.isFinite(value) ? `£${value.toFixed(2)}` : "—"; }
function penceRate(value) { return Number.isFinite(value) ? `${value.toFixed(2)} p/kWh` : "—"; }
function time(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function snapshotValues() {
  const metrics = live?.metrics || {};
  const availability = live?.availability || {};
  const gridNet = n(metrics.gridPower);
  const gridKnown = availability.liveGrid !== false && (n(metrics.gridImportPower) !== null || n(metrics.gridExportPower) !== null || gridNet !== null);
  const gridImport = n(metrics.gridImportPower) ?? (gridNet !== null ? Math.max(0, gridNet) : null);
  const gridExport = n(metrics.gridExportPower) ?? (gridNet !== null ? Math.max(0, -gridNet) : null);
  const solarKnown = metrics.solarDataAvailable !== false && availability.liveSolar !== false;
  const batteryKnown = metrics.batteryDataAvailable !== false && availability.liveBattery !== false;
  return {
    home: n(metrics.housePower),
    solar: solarKnown ? n(metrics.solarPower) : null,
    solarToday: solarKnown ? n(metrics.solarEnergyToday) : null,
    battery: batteryKnown ? n(metrics.batteryPower) : null,
    batterySoc: batteryKnown ? n(metrics.batterySoc) : null,
    gridImport: gridKnown ? gridImport : null,
    gridExport: gridKnown ? gridExport : null,
    gridDirection: String(metrics.gridFlowDirection || "unavailable"),
    ev: n(metrics.evPower),
    evSoc: n(metrics.evSoc),
    evConnected: Boolean(metrics.evConnected),
    evCharging: Boolean(metrics.evCharging),
    rate: n(metrics.currentRate)
  };
}

function metricCard(label, value, detail = "") {
  return `<article class="web21-card web25-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</article>`;
}

function node(className, icon, label, value, sub = "") {
  return `<article class="panel-node ${className}"><span class="panel-icon">${icon}</span><span class="panel-label">${label}</span><span class="panel-value">${esc(value)}</span>${sub ? `<span class="panel-sub">${esc(sub)}</span>` : ""}</article>`;
}

function flowSvg(v) {
  const threshold = 0.01;
  const line = (name, x1, y1, x2, y2, active, reverse = false) => {
    const ax1 = reverse ? x2 : x1, ay1 = reverse ? y2 : y1, ax2 = reverse ? x1 : x2, ay2 = reverse ? y1 : y2;
    return `<line class="live-flow-link ${active ? "active" : "idle"} ${name}" x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" ${active ? 'marker-end="url(#flow-arrow)"' : ""}/>`;
  };
  const solarActive = Number.isFinite(v.solar) && v.solar > threshold;
  const gridImport = Number.isFinite(v.gridImport) && v.gridImport > threshold;
  const gridExport = Number.isFinite(v.gridExport) && v.gridExport > threshold;
  const batteryDischarge = Number.isFinite(v.battery) && v.battery > threshold;
  const batteryCharge = Number.isFinite(v.battery) && v.battery < -threshold;
  const evActive = Number.isFinite(v.ev) && v.ev > threshold;
  return `<svg class="live-flow-links" viewBox="0 0 600 480" aria-hidden="true"><defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z"/></marker></defs>${line("solar-link", 300, 140, 300, 190, solarActive)}${line("grid-link", 180, 240, 240, 240, gridImport || gridExport, gridExport)}${line("battery-link", 360, 240, 420, 240, batteryDischarge || batteryCharge, batteryDischarge)}${line("ev-link", 300, 290, 300, 340, evActive)}</svg>`;
}

function energyFlow(v) {
  const batterySub = Number.isFinite(v.batterySoc) ? `SoC ${pct(v.batterySoc)}` : "Physical battery unavailable";
  const gridSub = Number.isFinite(v.gridImport) || Number.isFinite(v.gridExport)
    ? (v.gridImport > 0.01 ? "Importing" : v.gridExport > 0.01 ? "Exporting" : "Balanced")
    : "Grid telemetry unavailable";
  const evSub = v.evConnected ? (v.evCharging ? "Connected · charging" : "Connected") : (Number.isFinite(v.ev) ? "Not charging" : "EV telemetry unavailable");
  return `<section class="web21-section"><div class="web21-kicker">16×16 panel layout</div><h2>Energy flow now</h2><p class="web21-muted">The website uses the same five data points as the KEMS panel: Solar above, Grid left, Home centre, Battery right and EV below. Animated flow appears only when the corresponding live telemetry is available.</p><div class="live-flow">${flowSvg(v)}${node("solar", "☀", "SOLAR", kw(v.solar), Number.isFinite(v.solarToday) ? `Today ${kwh(v.solarToday)}` : "Physical solar unavailable")}${node("grid", "⌁", "GRID", Number.isFinite(v.gridImport) || Number.isFinite(v.gridExport) ? (v.gridImport > 0.01 ? kw(v.gridImport) : v.gridExport > 0.01 ? kw(v.gridExport) : "0.00 kW") : "—", gridSub)}${node("home", "⌂", "HOME", kw(v.home), "Live house load")}${node("battery", "▰", "BATTERY", kw(v.battery), batterySub)}${node("ev", "▱", "EV", kw(v.ev), Number.isFinite(v.evSoc) ? `${evSub} · SoC ${pct(v.evSoc)}` : evSub)}</div></section>`;
}

function chart() {
  const rows = analytics?.history || [];
  if (rows.length < 2) return `<p class="web21-muted">Building live power history for today…</p>`;
  const availableSeries = POWER_SERIES.filter((series) => rows.some((row) => Number.isFinite(n(row[series.key]))));
  if (!availableSeries.length) return `<p class="web21-muted">No live power history is available yet.</p>`;
  const width = 900, height = 300, pad = 44;
  const values = rows.flatMap((row) => availableSeries.map((series) => n(row[series.key])).filter(Number.isFinite));
  let min = Math.min(0, ...values), max = Math.max(1, ...values);
  if (min === max) max = min + 1;
  const xFor = (index) => pad + (rows.length <= 1 ? 0 : index / (rows.length - 1) * (width - pad * 2));
  const yFor = (value) => height - pad - (value - min) / (max - min || 1) * (height - pad * 2);
  const segments = (key) => {
    const groups = []; let current = [];
    rows.forEach((row, index) => {
      const value = n(row[key]);
      if (!Number.isFinite(value)) { if (current.length > 1) groups.push(current); current = []; return; }
      current.push(`${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`);
    });
    if (current.length > 1) groups.push(current);
    return groups;
  };
  const lines = availableSeries.map((series) => segments(series.key).map((points) => `<polyline fill="none" stroke="${series.stroke}" stroke-width="2.4" points="${points.join(" ")}"/>`).join("")).join("");
  const grid = [0, .25, .5, .75, 1].map((f) => { const y = pad + f * (height - pad * 2); const value = max - (max - min) * f; return `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="rgba(135,191,209,.13)"/><text x="4" y="${y + 4}" fill="currentColor" opacity=".65" font-size="11">${value.toFixed(1)}kW</text>`; }).join("");
  return `<div class="web21-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Live power through today">${grid}${lines}<text x="${pad}" y="${height - 8}" fill="currentColor" opacity=".6" font-size="11">${esc(time(rows[0]?.at))}</text><text x="${width - pad - 35}" y="${height - 8}" fill="currentColor" opacity=".6" font-size="11">${esc(time(rows.at(-1)?.at))}</text></svg></div><div class="web21-chart-key">${availableSeries.map((series) => `<span style="color:${series.stroke}">${esc(series.label)}</span>`).join("")}</div>`;
}

function todaySection(v) {
  const totals = analytics?.actual?.totals || {};
  return `<section class="web21-section"><div class="web21-kicker">Observed today</div><h2>Today's live totals</h2><div class="web21-grid">${metricCard("Home energy", kwh(n(totals.home)))}${metricCard("Grid import", kwh(n(totals.gridImport)))}${metricCard("Grid export", kwh(n(totals.gridExport)))}${metricCard("Net electricity cost", money(n(totals.netCost)))}${metricCard("EV energy", kwh(n(totals.ev)))}${metricCard("Solar generation", v.solar === null ? "—" : kwh(n(totals.solar)), v.solar === null ? "Physical solar not commissioned / unavailable" : "")}${metricCard("Battery charged", v.battery === null ? "—" : kwh(n(totals.batteryCharge)), v.battery === null ? "Physical battery not commissioned / unavailable" : "")}${metricCard("Battery discharged", v.battery === null ? "—" : kwh(n(totals.batteryDischarge)), v.battery === null ? "Physical battery not commissioned / unavailable" : "")}</div><div style="margin-top:1.2rem"><h3>Power through today</h3>${chart()}</div></section>`;
}

function render() {
  if (!app || !live) return;
  const v = snapshotValues();
  const updated = live.updatedAt ? new Date(live.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  app.innerHTML = `<header class="page-heading"><div><p class="eyebrow">LIVE DATA</p><h1>${esc(live.site?.name || "Your home")}</h1><p>Measured property data only. Missing physical solar or battery sources stay unavailable rather than being replaced with simulated values.</p></div></header><section class="web21-section"><div class="web21-kicker">Live now · updated ${esc(updated)}</div><h2>Property at a glance</h2><div class="web21-grid">${metricCard("Home load", kw(v.home))}${metricCard("Solar generation", kw(v.solar), v.solar === null ? "Waiting for physical solar" : "Live PV output")}${metricCard("Battery SoC", pct(v.batterySoc), v.batterySoc === null ? "Waiting for physical battery" : "Live battery")}${metricCard("Battery power", kw(v.battery), Number.isFinite(v.battery) ? (v.battery > 0.01 ? "Discharging" : v.battery < -0.01 ? "Charging" : "Idle") : "Unavailable")}${metricCard("Grid import", kw(v.gridImport))}${metricCard("Grid export", kw(v.gridExport))}${metricCard("EV power", kw(v.ev))}${metricCard("Import rate", penceRate(v.rate))}</div></section>${energyFlow(v)}${todaySection(v)}`;
  if (connectionPill) {
    connectionPill.classList.toggle("offline", !live.connected);
    const label = connectionPill.querySelector("span");
    if (label) label.textContent = live.connected ? "Live" : "Offline";
  }
}

async function refreshAll() {
  if (busy) return;
  busy = true;
  refreshButton?.classList.add("spinning");
  try {
    const [nextLive, nextAnalytics] = await Promise.all([getJson("/api/live"), getJson("/api/analytics?range=day")]);
    live = nextLive;
    analytics = nextAnalytics;
    render();
  } catch (error) {
    if (app) app.innerHTML = `<section class="web21-section"><h1>Live data unavailable</h1><p>${esc(error.message)}</p></section>`;
  } finally {
    busy = false;
    refreshButton?.classList.remove("spinning");
  }
}

async function refreshLive() {
  if (busy) return;
  try { live = await getJson("/api/live"); render(); } catch {}
}

refreshButton?.addEventListener("click", refreshAll);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(() => {});
refreshAll();
setInterval(() => document.visibilityState === "visible" && refreshLive(), 8000);
setInterval(() => document.visibilityState === "visible" && refreshAll(), 60000);
