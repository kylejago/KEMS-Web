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

const PANEL_THRESHOLD = 0.03;

function n(value) {
  if (value === null || value === undefined || value === "") return null;
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
    gridAvailable: Boolean(live?.connected && gridKnown),
    ev: n(metrics.evPower),
    evSoc: n(metrics.evSoc),
    evConnected: Boolean(metrics.evConnected),
    evCharging: Boolean(metrics.evCharging),
    rate: n(metrics.currentRate),
    costToday: n(live?.observed?.costToday)
  };
}

function metricCard(label, value, detail = "") {
  return `<article class="web21-card web25-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</article>`;
}

function panelCellIndex(column, row) {
  return (row - 1) * 16 + (column - 1);
}

function panelCells(v) {
  const cells = Array.from({ length: 256 }, () => ({ colour: "off", pulse: false, flow: false, delay: 0 }));
  const set = (column, row, colour, options = {}) => {
    if (column < 1 || column > 16 || row < 1 || row > 16) return;
    cells[panelCellIndex(column, row)] = { colour, pulse: Boolean(options.pulse), flow: Boolean(options.flow), delay: Number(options.delay || 0) };
  };
  const rect = (c1, r1, c2, r2, colour, options = {}) => {
    for (let row = r1; row <= r2; row += 1) for (let column = c1; column <= c2; column += 1) set(column, row, colour, options);
  };
  const flowHorizontal = (c1, r1, c2, r2, topColour, bottomColour, direction) => {
    const width = c2 - c1 + 1;
    for (let travel = 0; travel < width; travel += 1) {
      const column = direction > 0 ? c1 + travel : c2 - travel;
      set(column, r1, topColour, { flow: true, delay: travel * .45 });
      set(column, r2, bottomColour, { flow: true, delay: travel * .45 });
    }
  };
  const flowVertical = (c1, r1, c2, r2, leftColour, rightColour, direction) => {
    const height = r2 - r1 + 1;
    for (let travel = 0; travel < height; travel += 1) {
      const row = direction > 0 ? r1 + travel : r2 - travel;
      set(c1, row, leftColour, { flow: true, delay: travel * .45 });
      set(c2, row, rightColour, { flow: true, delay: travel * .45 });
    }
  };

  const gridImporting = Number.isFinite(v.gridImport) && v.gridImport > PANEL_THRESHOLD;
  const gridExporting = Number.isFinite(v.gridExport) && v.gridExport > PANEL_THRESHOLD;
  const solarProducing = Number.isFinite(v.solar) && v.solar > PANEL_THRESHOLD;
  const batteryDischarging = Number.isFinite(v.battery) && v.battery > PANEL_THRESHOLD;
  const batteryCharging = Number.isFinite(v.battery) && v.battery < -PANEL_THRESHOLD;
  const batteryExportComponent = gridExporting && batteryDischarging ? Math.min(v.gridExport, v.battery) : 0;
  const exportFromBattery = batteryExportComponent > PANEL_THRESHOLD;
  const exportFromSolar = gridExporting && ((Number.isFinite(v.gridExport) ? v.gridExport : 0) - batteryExportComponent > PANEL_THRESHOLD || solarProducing);
  const batteryChargeFromGrid = batteryCharging && gridImporting;
  const batteryChargeFromSolar = batteryCharging && solarProducing;
  const solarBusActive = solarProducing;
  const batteryToBusActive = batteryDischarging || exportFromBattery;
  const evFromGrid = v.evCharging && gridImporting;
  const evFromSolar = v.evCharging && solarBusActive;
  const evFromBattery = v.evCharging && batteryToBusActive;

  rect(2, 2, 5, 3, "rainbow");
  rect(12, 2, 15, 3, "rainbow");
  rect(2, 12, 5, 13, "rainbow");
  rect(12, 12, 15, 13, "rainbow");
  rect(7, 7, 10, 10, "rainbow");

  if (v.gridAvailable) rect(2, 4, 3, 5, "green"); else rect(4, 4, 5, 5, "red");
  if (Number.isFinite(v.costToday)) {
    if (v.costToday < 0) rect(12, 4, 13, 5, "green");
    else if (v.costToday > 0) rect(14, 4, 15, 5, "red");
  }
  if (gridImporting) rect(2, 14, 3, 15, "green"); else rect(4, 14, 5, 15, "red");
  if (gridExporting) rect(12, 14, 13, 15, "green"); else rect(14, 14, 15, 15, "red");

  if (solarBusActive) {
    rect(7, 1, 10, 2, "yellow", { pulse: true });
    flowVertical(8, 3, 9, 6, "yellow", "yellow", +1);
  }

  if (gridImporting) {
    rect(1, 7, 2, 10, "blue", { pulse: true });
    flowHorizontal(3, 8, 6, 9, "blue", "blue", +1);
  } else if (gridExporting) {
    rect(1, 7, 2, 10, "blue", { pulse: true });
    if (exportFromSolar && exportFromBattery) flowHorizontal(3, 8, 6, 9, "yellow", "green", -1);
    else if (exportFromSolar) flowHorizontal(3, 8, 6, 9, "yellow", "yellow", -1);
    else if (exportFromBattery) flowHorizontal(3, 8, 6, 9, "green", "green", -1);
    else flowHorizontal(3, 8, 6, 9, "white", "white", -1);
  }

  if (Number.isFinite(v.batterySoc)) {
    const soc = Math.max(0, Math.min(100, v.batterySoc));
    const batteryCells = [[15,11],[16,11],[15,10],[16,10],[15,9],[16,9],[15,8],[16,8],[15,7],[16,7]];
    if (soc >= 100) {
      batteryCells.forEach(([column, row]) => set(column, row, "green"));
    } else if (soc < 10) {
      set(15, 11, "red", { pulse: true });
    } else {
      const fullCells = Math.floor(soc / 10);
      for (let index = 0; index < fullCells; index += 1) {
        const [column, row] = batteryCells[index];
        set(column, row, soc < 20 && index === 0 ? "orange" : "green");
      }
      if (fullCells < 10) {
        const [column, row] = batteryCells[fullCells];
        set(column, row, "green", { pulse: true });
      }
    }
  }

  if (batteryCharging) {
    if (batteryChargeFromSolar && batteryChargeFromGrid) flowHorizontal(11, 8, 14, 9, "yellow", "blue", +1);
    else if (batteryChargeFromGrid) flowHorizontal(11, 8, 14, 9, "blue", "blue", +1);
    else if (batteryChargeFromSolar) flowHorizontal(11, 8, 14, 9, "yellow", "yellow", +1);
    else flowHorizontal(11, 8, 14, 9, "white", "white", +1);
  } else if (batteryToBusActive) {
    flowHorizontal(11, 8, 14, 9, "green", "green", -1);
  }

  if (v.evCharging) {
    rect(7, 15, 10, 16, "magenta", { pulse: true });
    if (evFromGrid && evFromSolar && evFromBattery) flowVertical(8, 11, 9, 14, "blue", "green", +1);
    else if (evFromGrid && evFromSolar) flowVertical(8, 11, 9, 14, "blue", "yellow", +1);
    else if (evFromSolar && evFromBattery) flowVertical(8, 11, 9, 14, "yellow", "green", +1);
    else if (evFromGrid && evFromBattery) flowVertical(8, 11, 9, 14, "blue", "green", +1);
    else if (evFromGrid) flowVertical(8, 11, 9, 14, "blue", "blue", +1);
    else if (evFromSolar) flowVertical(8, 11, 9, 14, "yellow", "yellow", +1);
    else if (evFromBattery) flowVertical(8, 11, 9, 14, "green", "green", +1);
    else flowVertical(8, 11, 9, 14, "magenta", "magenta", +1);
  } else if (v.evConnected) {
    rect(7, 15, 10, 16, "magenta");
  }

  return { cells, gridImporting, gridExporting, solarBusActive, batteryCharging, batteryDischarging };
}

function panelReplica(v) {
  const state = panelCells(v);
  const cells = state.cells.map((cell) => {
    const classes = ["kems-panel-led", cell.colour];
    if (cell.pulse) classes.push("pulse");
    if (cell.flow) classes.push("flow");
    const style = cell.flow ? ` style="--flow-delay:-${cell.delay.toFixed(2)}s"` : "";
    return `<span class="${classes.join(" ")}"${style}></span>`;
  }).join("");
  const gridText = state.gridImporting ? `Grid importing ${kw(v.gridImport)}` : state.gridExporting ? `Grid exporting ${kw(v.gridExport)}` : "Grid balanced";
  const batteryText = Number.isFinite(v.batterySoc) ? `Battery ${pct(v.batterySoc)}` : "Battery unavailable";
  return `<section class="web21-section"><div class="web21-kicker">Physical panel mirror</div><h2>16×16 KEMS panel</h2><p class="web21-muted">This is the same front face and the same live LED rules as the physical panel: GRID, COST, IMPORT and EXPORT status blocks, source colours, moving two-row flow dots, battery cells and EV state.</p><div class="kems-panel-shell"><div class="kems-panel-replica" role="img" aria-label="${esc(`KEMS panel. ${gridText}. ${batteryText}.`)}"><div class="kems-panel-led-mask">${cells}</div><div class="kems-panel-glass"></div></div></div><div class="kems-panel-caption"><span class="kems-panel-state-dot"></span><b>Live Data mode</b><span>·</span><span>${esc(gridText)}</span><span>·</span><span>${esc(batteryText)}</span></div></section>`;
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
  app.innerHTML = `<header class="page-heading"><div><p class="eyebrow">LIVE DATA</p><h1>${esc(live.site?.name || "Your home")}</h1><p>Measured property data only. Missing physical solar or battery sources stay unavailable rather than being replaced with simulated values.</p></div></header><section class="web21-section"><div class="web21-kicker">Live now · updated ${esc(updated)}</div><h2>Property at a glance</h2><div class="web21-grid">${metricCard("Home load", kw(v.home))}${metricCard("Solar generation", kw(v.solar), v.solar === null ? "Waiting for physical solar" : "Live PV output")}${metricCard("Battery SoC", pct(v.batterySoc), v.batterySoc === null ? "Waiting for physical battery" : "Live battery")}${metricCard("Battery power", kw(v.battery), Number.isFinite(v.battery) ? (v.battery > 0.01 ? "Discharging" : v.battery < -0.01 ? "Charging" : "Idle") : "Unavailable")}${metricCard("Grid import", kw(v.gridImport))}${metricCard("Grid export", kw(v.gridExport))}${metricCard("EV power", kw(v.ev))}${metricCard("Import rate", penceRate(v.rate))}</div></section>${panelReplica(v)}${todaySection(v)}`;
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
