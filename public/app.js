const app = document.querySelector("#app");
const connectionPill = document.querySelector("#connection-pill");
const refreshButton = document.querySelector("#refresh-button");
const settingsButton = document.querySelector("#settings-button");
const menuButton = document.querySelector("#menu-button");
const mobileNav = document.querySelector("#mobile-nav");
const drawerRoot = document.querySelector("#drawer-root");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");

const ROUTES = new Set(["live", "simulation", "compare", "performance"]);
const RANGES = new Set(["day", "week", "month", "year", "all"]);
const COLOURS = {
  live: "#55d9e6",
  observed: "#74a9ff",
  simulated: "#b7a0f6",
  calculated: "#f3c76c",
  positive: "#8be3a2",
  negative: "#ff8f9d",
  solar: "#f4d47a",
  battery: "#7cc8ff",
  grid: "#c8d5da",
  home: "#55d9e6",
  ev: "#c3ef77",
  gas: "#f29468",
  muted: "#829ba5"
};

let flowLinkSequence = 0;
let deferredInstallPrompt = null;
let serviceWorkerReloading = false;

function isStandaloneApp() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function pwaStatus() {
  if (isStandaloneApp()) return { label: "Installed", detail: "KEMS is running as an installed web app." };
  if (deferredInstallPrompt) return { label: "Ready to install", detail: "Install KEMS on this device for an app-style launcher and full-screen experience." };
  if (!window.isSecureContext) return { label: "HTTPS required", detail: "App installation becomes available when KEMS is opened over HTTPS. The local dashboard still works normally." };
  return { label: "Browser install", detail: "Use your browser's Install app / Add to Home screen option if it is available." };
}

async function installPwa() {
  if (!deferredInstallPrompt) return;
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  try { await prompt.userChoice; } catch {}
  if (drawerRoot.innerHTML) renderSettingsDrawer();
}

async function registerPwa() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (drawerRoot.innerHTML) renderSettingsDrawer();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    toast("KEMS installed on this device.", "good");
    if (drawerRoot.innerHTML) renderSettingsDrawer();
  });
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register("/service-worker.js");
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (serviceWorkerReloading) return;
      serviceWorkerReloading = true;
      window.location.reload();
    });
  } catch (error) {
    console.warn("KEMS PWA service worker could not be registered:", error);
  }
}

const state = {
  config: null,
  setup: null,
  snapshot: null,
  today: null,
  performance: null,
  route: routeFromHash(),
  range: "month",
  stream: null,
  loading: false,
  lastAnalyticsLoad: 0,
  catalog: [],
  catalogQuery: "",
  diagnostics: null
};

function routeFromHash() {
  const route = location.hash.replace(/^#/, "").split("?")[0];
  return ROUTES.has(route) ? route : "live";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function numeric(value) {
  if (value === null || value === undefined) return null;
  if (["unknown", "unavailable", "none", ""].includes(String(value).toLowerCase())) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
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

function formatDate(value, options = {}) {
  if (!value || ["unknown", "unavailable"].includes(String(value).toLowerCase())) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: options.year ? "numeric" : undefined,
    hour: options.time ? "2-digit" : undefined, minute: options.time ? "2-digit" : undefined
  }).format(date);
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

function formatEntityValue(item) {
  if (!item?.available) return "Unavailable";
  const value = numeric(item.state);
  if (value === null) return String(item.state);
  const unit = String(item.attributes?.unit_of_measurement || "");
  if (["p", "pence"].includes(unit.toLowerCase())) return formatMoney(value / 100);
  if (["gbp", "£"].includes(unit.toLowerCase())) return formatMoney(value);
  return formatNumber(value, unit, 2);
}

function entity(entityId) {
  return state.snapshot?.entities?.find((item) => item.entityId === entityId) || null;
}

function entityNumber(entityId) {
  const item = entity(entityId);
  return item?.available ? numeric(item.state) : null;
}

function entityMoney(entityId) {
  const item = entity(entityId);
  if (!item?.available) return null;
  const value = numeric(item.state);
  if (!Number.isFinite(value)) return null;
  const unit = String(item.attributes?.unit_of_measurement || "").toLowerCase();
  return ["p", "pence"].includes(unit) ? value / 100 : value;
}

function entityState(entityId, fallback = "Unavailable") {
  const item = entity(entityId);
  return item?.available ? String(item.state) : fallback;
}

function sourceBadge(type, label = null) {
  const labels = {
    live: "Live measurement",
    observed: "KEMS observed",
    simulated: "KEMS simulated",
    calculated: "Calculated allocation",
    forecast: "Forecast / ROI"
  };
  return `<span class="data-badge ${type}"><i></i>${escapeHtml(label || labels[type] || type)}</span>`;
}

function statusPill(text, tone = "neutral") {
  return `<span class="status-pill ${tone}">${escapeHtml(text)}</span>`;
}

function metricCard(label, value, detail = "", tone = "live", icon = "") {
  return `<article class="metric-card ${tone}">
    <header><span>${escapeHtml(label)}</span>${icon ? `<b aria-hidden="true">${escapeHtml(icon)}</b>` : ""}</header>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(detail)}</small>
  </article>`;
}

function pageHeader(title, subtitle, badges = "") {
  return `<header class="page-heading">
    <div><p class="eyebrow">KEMS 0.7.0-alpha5</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
    <div class="heading-badges">${badges}</div>
  </header>`;
}

function sectionHeader(title, subtitle = "", action = "") {
  return `<header class="section-heading"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>${action}</header>`;
}

function card(title, content, options = {}) {
  const className = ["panel", options.className || ""].join(" ").trim();
  return `<section class="${className}">${options.header === false ? "" : sectionHeader(title, options.subtitle || "", options.action || "")}<div class="panel-body">${content}</div></section>`;
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function setConnectionPill() {
  const connected = Boolean(state.snapshot?.connected);
  connectionPill.classList.toggle("connected", connected);
  connectionPill.classList.toggle("error", Boolean(state.setup?.configured && !connected));
  connectionPill.querySelector("span").textContent = connected
    ? `Live · ${formatTime(state.snapshot.updatedAt)}`
    : state.setup?.configured ? "Connection issue" : "Not connected";
}

function bindShell() {
  window.addEventListener("hashchange", async () => {
    state.route = routeFromHash();
    mobileNav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    updateNavigation();
    if (state.route === "performance") await ensurePerformance(state.range);
    render();
    app.focus({ preventScroll: true });
  });
  menuButton.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  refreshButton.addEventListener("click", () => refreshAll(true));
  settingsButton.addEventListener("click", openSettingsDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      drawerRoot.innerHTML = "";
      modalRoot.innerHTML = "";
    }
  });
}

function updateNavigation() {
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route);
  });
}

async function initialise() {
  registerPwa();
  bindShell();
  updateNavigation();
  try {
    [state.config, state.setup] = await Promise.all([
      getJson("/api/config"),
      getJson("/api/setup/status")
    ]);
    if (!state.setup.configured) {
      renderConnectionPage();
      return;
    }
    await refreshAll(false);
    if (!new URLSearchParams(location.search).has("static")) connectStream();
  } catch (error) {
    renderFatal(error);
  }
}

async function refreshAll(showToast = false) {
  if (state.loading) return;
  state.loading = true;
  refreshButton.classList.add("spinning");
  try {
    const [snapshot, today] = await Promise.all([
      getJson("/api/live"),
      getJson("/api/analytics?range=day")
    ]);
    state.snapshot = snapshot;
    state.today = today;
    state.lastAnalyticsLoad = Date.now();
    state.setup = await getJson("/api/setup/status");
    if (state.route === "performance") await ensurePerformance(state.range, true);
    render();
    setConnectionPill();
    if (showToast) toast("KEMS data refreshed.", "good");
  } catch (error) {
    if (showToast) toast(error.message, "danger");
    if (!state.snapshot) renderFatal(error);
  } finally {
    state.loading = false;
    refreshButton.classList.remove("spinning");
  }
}

async function ensurePerformance(range, force = false) {
  if (!RANGES.has(range)) range = "month";
  if (!force && state.performance?.range === range) return;
  state.performance = { range, loading: true };
  if (state.route === "performance") render();
  try {
    state.performance = await getJson(`/api/analytics?range=${encodeURIComponent(range)}`);
  } catch (error) {
    state.performance = { range, available: false, error: error.message };
  }
}

function connectStream() {
  state.stream?.close();
  const stream = new EventSource("/api/stream");
  stream.addEventListener("snapshot", (event) => {
    try {
      state.snapshot = JSON.parse(event.data);
      setConnectionPill();
      render();
      if (Date.now() - state.lastAnalyticsLoad > 60_000) {
        getJson("/api/analytics?range=day").then((today) => {
          state.today = today;
          state.lastAnalyticsLoad = Date.now();
          render();
        }).catch(() => {});
      }
    } catch {}
  });
  stream.onerror = () => setConnectionPill();
  state.stream = stream;
}

function render() {
  if (!state.snapshot) return;
  updateNavigation();
  setConnectionPill();
  const views = {
    live: liveView,
    simulation: simulationView,
    compare: compareView,
    performance: performanceView
  };
  app.innerHTML = `${views[state.route]()}${footer()}`;
  bindViewEvents();
}

function liveTotals() {
  return state.today?.actual?.totals || {};
}

function simulatedTotals() {
  return state.today?.simulated?.totals || {};
}

function flowValues(mode) {
  const snapshot = state.snapshot;
  if (mode === "simulated") {
    const simulatedBattery = entityNumber("sensor.kems_simulated_battery_power");
    return {
      gridImport: snapshot.simulation.totalSiteImportPower ?? entityNumber("sensor.kems_simulated_grid_import_power") ?? 0,
      gridExport: entityNumber("sensor.kems_simulated_grid_export_power") ?? 0,
      home: entityNumber("sensor.kems_simulated_house_load_power") ?? snapshot.metrics.housePower,
      solar: snapshot.simulation.solarPower,
      solarToBattery: snapshot.simulation.solarToBatteryPower ?? entityNumber("sensor.kems_simulated_solar_to_battery_power") ?? 0,
      batteryCharging: snapshot.simulation.batteryChargingPower ?? entityNumber("sensor.kems_simulated_battery_charging_power") ?? 0,
      gridBypass: snapshot.simulation.gridBypassPower ?? entityNumber("sensor.kems_simulated_grid_bypass_power") ?? 0,
      battery: simulatedBattery,
      batterySoc: snapshot.simulation.batterySoc,
      ev: snapshot.metrics.evPower,
      source: "simulated"
    };
  }
  return {
    gridImport: snapshot.metrics.gridImportPower,
    gridExport: snapshot.metrics.gridExportPower,
    home: snapshot.metrics.housePower,
    solar: snapshot.metrics.solarPower,
    battery: snapshot.metrics.batteryPower,
    batterySoc: snapshot.metrics.batterySoc,
    ev: snapshot.metrics.evPower,
    source: "live"
  };
}

function flowLine({ x1, y1, x2, y2, active, colour, label, dashed = false }) {
  const id = `flow-link-${flowLinkSequence += 1}`;
  const className = active ? "flow-path active" : "flow-path inactive";
  const midpointX = (x1 + x2) / 2;
  const midpointY = (y1 + y2) / 2;
  const distance = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const ux = (x2 - x1) / distance;
  const uy = (y2 - y1) / distance;
  const perpendicularX = -uy;
  const perpendicularY = ux;
  const arrowLength = 15;
  const arrowWidth = 7;
  const arrowProgress = 0.82;
  const arrowTipX = x1 + (x2 - x1) * arrowProgress;
  const arrowTipY = y1 + (y2 - y1) * arrowProgress;
  const arrowBaseX = arrowTipX - ux * arrowLength;
  const arrowBaseY = arrowTipY - uy * arrowLength;
  const arrowPoints = `${arrowTipX},${arrowTipY} ${arrowBaseX + perpendicularX * arrowWidth},${arrowBaseY + perpendicularY * arrowWidth} ${arrowBaseX - perpendicularX * arrowWidth},${arrowBaseY - perpendicularY * arrowWidth}`;
  const inlineStyle = `stroke:${colour};--flow-colour:${colour};opacity:${active ? 0.96 : 0.22}`;
  const particles = active ? `<circle class="flow-particle" r="5" style="fill:${colour}"><animateMotion dur="1.45s" repeatCount="indefinite" path="M ${x1} ${y1} L ${x2} ${y2}"></animateMotion></circle><circle class="flow-particle secondary" r="3.5" style="fill:${colour}"><animateMotion begin="-.72s" dur="1.45s" repeatCount="indefinite" path="M ${x1} ${y1} L ${x2} ${y2}"></animateMotion></circle>` : "";
  return `<g class="flow-link-group" data-flow-id="${id}">
    <path id="${id}" class="${className}${dashed ? " dashed" : ""}" d="M ${x1} ${y1} L ${x2} ${y2}" style="${inlineStyle}" />
    ${active ? `<polygon class="flow-arrow" points="${arrowPoints}" style="fill:${colour}"></polygon>${particles}` : ""}
    ${label ? `<g transform="translate(${midpointX} ${midpointY})"><rect class="flow-label-bg" x="-48" y="-13" width="96" height="26" rx="13"></rect><text class="flow-label" text-anchor="middle" dominant-baseline="central">${escapeHtml(label)}</text></g>` : ""}
  </g>`;
}

function solarBatteryCurve(power, active) {
  const colour = COLOURS.solar;
  const d = "M 555 112 C 715 145 715 395 555 428";
  const label = formatNumber(power, "kW", 2);
  const particles = active ? `<circle class="flow-particle" r="5" style="fill:${colour}"><animateMotion dur="1.8s" repeatCount="indefinite" path="${d}"></animateMotion></circle><circle class="flow-particle secondary" r="3.5" style="fill:${colour}"><animateMotion begin="-.9s" dur="1.8s" repeatCount="indefinite" path="${d}"></animateMotion></circle>` : "";
  return `<g class="flow-link-group alpha5-solar-battery">
    <path class="flow-path ${active ? "active" : "inactive"}" d="${d}" style="stroke:${colour};--flow-colour:${colour};opacity:${active ? 0.92 : 0.12}" />
    ${active ? `<polygon class="flow-arrow" points="555,428 567,406 543,409" style="fill:${colour}"></polygon>${particles}
    <g transform="translate(688 270)"><rect class="flow-label-bg" x="-54" y="-13" width="108" height="26" rx="13"></rect><text class="flow-label" text-anchor="middle" dominant-baseline="central">${escapeHtml(label)}</text></g>` : ""}
  </g>`;
}

function energyFlow(mode = "live", compact = false) {
  const values = flowValues(mode);
  const isSimulated = mode === "simulated";
  const importPower = Math.max(0, values.gridImport || 0);
  const exportPower = Math.max(0, values.gridExport || 0);
  const solarPower = Math.max(0, values.solar || 0);
  const solarToBattery = isSimulated ? Math.max(0, values.solarToBattery || 0) : 0;
  const solarToHome = Math.max(0, solarPower - solarToBattery - (isSimulated ? exportPower : 0));
  const batteryPower = Number.isFinite(values.battery) ? values.battery : null;
  const batteryDischarging = Number.isFinite(batteryPower) && batteryPower > 0.02;
  const explicitBatteryCharging = isSimulated ? Math.max(0, values.batteryCharging || 0) : null;
  const batteryChargingPower = isSimulated ? Math.max(0, explicitBatteryCharging - solarToBattery) : (Number.isFinite(batteryPower) && batteryPower < -0.02 ? Math.abs(batteryPower) : 0);
  const batteryCharging = batteryChargingPower > 0.02;
  const evPower = Math.max(0, values.ev || 0);
  const liveAvailable = {
    grid: Number.isFinite(values.gridImport) || Number.isFinite(values.gridExport),
    home: Number.isFinite(values.home),
    solar: Number.isFinite(values.solar),
    battery: Number.isFinite(values.battery),
    ev: Number.isFinite(values.ev)
  };
  const gridImport = importPower > 0.01;
  const gridExport = exportPower > 0.01;
  const svg = `<svg class="energy-flow-svg" viewBox="0 0 1000 540" role="img" aria-label="${isSimulated ? "Simulated" : "Live"} energy flow with home at the centre">
    <g class="flow-grid">${Array.from({ length: 11 }, (_, index) => `<line x1="${index * 100}" y1="0" x2="${index * 100}" y2="540"></line>`).join("")}${Array.from({ length: 7 }, (_, index) => `<line x1="0" y1="${index * 90}" x2="1000" y2="${index * 90}"></line>`).join("")}</g>
    ${gridImport ? flowLine({ x1: 190, y1: 270, x2: 410, y2: 270, active: true, colour: COLOURS.grid, label: formatNumber(importPower, "kW", 2) }) : flowLine({ x1: 410, y1: 270, x2: 190, y2: 270, active: gridExport, colour: COLOURS.positive, label: gridExport ? formatNumber(exportPower, "kW", 2) : "Balanced" })}
    ${flowLine({ x1: 500, y1: 118, x2: 500, y2: 205, active: solarToHome > 0.01, colour: COLOURS.solar, label: liveAvailable.solar ? formatNumber(isSimulated ? solarToHome : solarPower, "kW", 2) : "Unavailable" })}
    ${isSimulated ? solarBatteryCurve(solarToBattery, solarToBattery > 0.01) : ""}
    ${batteryCharging ? flowLine({ x1: 500, y1: 335, x2: 500, y2: 422, active: true, colour: COLOURS.battery, label: formatNumber(batteryChargingPower, "kW", 2) }) : flowLine({ x1: 500, y1: 422, x2: 500, y2: 335, active: batteryDischarging, colour: COLOURS.battery, label: liveAvailable.battery ? formatNumber(Math.abs(batteryPower || 0), "kW", 2) : "Unavailable" })}
    ${flowLine({ x1: 590, y1: 270, x2: 810, y2: 270, active: evPower > 0.01, colour: COLOURS.ev, label: liveAvailable.ev ? formatNumber(evPower, "kW", 2) : "Unavailable" })}
    <g class="flow-node-svg grid-node" transform="translate(95 220)"><rect width="120" height="100" rx="24"></rect><text x="60" y="28" text-anchor="middle" class="node-title">GRID</text><text x="60" y="57" text-anchor="middle" class="node-value">${escapeHtml(gridImport ? formatNumber(importPower, "kW", 2) : gridExport ? formatNumber(exportPower, "kW", 2) : "0 kW")}</text><text x="60" y="80" text-anchor="middle" class="node-detail">${gridImport ? "Importing" : gridExport ? "Exporting" : "Balanced"}</text></g>
    <g class="flow-node-svg solar-node" transform="translate(440 28)"><rect width="120" height="100" rx="24"></rect><text x="60" y="28" text-anchor="middle" class="node-title">SOLAR</text><text x="60" y="57" text-anchor="middle" class="node-value">${escapeHtml(liveAvailable.solar ? formatNumber(solarPower, "kW", 2) : "—")}</text><text x="60" y="80" text-anchor="middle" class="node-detail">${liveAvailable.solar ? "Generating" : isSimulated ? "Model unavailable" : "Not installed"}</text></g>
    <g class="flow-node-svg home-node" transform="translate(410 205)"><rect width="180" height="130" rx="36"></rect><text x="90" y="38" text-anchor="middle" class="node-title">HOME</text><text x="90" y="76" text-anchor="middle" class="home-value">${escapeHtml(liveAvailable.home ? formatNumber(values.home, "kW", 2) : "Unavailable")}</text><text x="90" y="104" text-anchor="middle" class="node-detail">Centre of every flow</text></g>
    <g class="flow-node-svg battery-node" transform="translate(440 412)"><rect width="120" height="100" rx="24"></rect><text x="60" y="28" text-anchor="middle" class="node-title">BATTERY</text><text x="60" y="57" text-anchor="middle" class="node-value">${escapeHtml(Number.isFinite(values.batterySoc) ? formatPercent(values.batterySoc, 0) : "—")}</text><text x="60" y="80" text-anchor="middle" class="node-detail">${batteryCharging ? "Charging" : batteryDischarging ? "Discharging" : liveAvailable.battery ? "Idle" : isSimulated ? "Model unavailable" : "Not installed"}</text></g>
    <g class="flow-node-svg ev-node" transform="translate(785 220)"><rect width="120" height="100" rx="24"></rect><text x="60" y="28" text-anchor="middle" class="node-title">EV</text><text x="60" y="57" text-anchor="middle" class="node-value">${escapeHtml(liveAvailable.ev ? formatNumber(evPower, "kW", 2) : "—")}</text><text x="60" y="80" text-anchor="middle" class="node-detail">${evPower > 0.01 ? "Charging" : state.snapshot.metrics.evConnected ? "Connected" : "Idle"}</text></g>
  </svg>`;
  return `<div class="energy-flow ${isSimulated ? "simulated" : "live"} ${compact ? "compact" : ""}">${svg}<footer><span>${sourceBadge(isSimulated ? "simulated" : "live")}</span><span>Arrows show the current direction of energy</span></footer></div>`;
}

function chartEmpty(message = "No recorder data is available for this period.") {
  return `<div class="chart-empty">${escapeHtml(message)}</div>`;
}

function lineChart(points, definitions, options = {}) {
  const usable = (points || [])
    .filter((point) => point?.at && Number.isFinite(new Date(point.at).getTime()) && definitions.some((definition) => Number.isFinite(definition.value(point))))
    .sort((first, second) => new Date(first.at) - new Date(second.at));
  if (!usable.length) return chartEmpty();
  const width = 960;
  const height = options.height || 300;
  const padding = { left: 58, right: 24, top: 24, bottom: 42 };
  const start = new Date(usable[0].at).getTime();
  const end = new Date(usable.at(-1).at).getTime();
  const values = usable.flatMap((point) => definitions.map((definition) => definition.value(point)).filter(Number.isFinite));
  let minimum = Number.isFinite(options.minimum) ? options.minimum : Math.min(0, ...values);
  let maximum = Number.isFinite(options.maximum) ? options.maximum : Math.max(...values);
  if (maximum === minimum) {
    const paddingValue = Math.max(0.5, Math.abs(maximum) * 0.1);
    minimum -= paddingValue;
    maximum += paddingValue;
  }
  const x = (at) => padding.left + ((new Date(at).getTime() - start) / Math.max(1, end - start)) * (width - padding.left - padding.right);
  const y = (value) => padding.top + (1 - (value - minimum) / (maximum - minimum)) * (height - padding.top - padding.bottom);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = maximum - (maximum - minimum) * index / 4;
    const py = y(value);
    return `<line class="chart-gridline" x1="${padding.left}" y1="${py}" x2="${width - padding.right}" y2="${py}"></line><text class="chart-axis" x="${padding.left - 10}" y="${py + 4}" text-anchor="end">${escapeHtml(formatNumber(value, options.unit || "", 1))}</text>`;
  }).join("");
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const timestamp = start + (end - start) * index / 4;
    return `<text class="chart-axis" x="${x(timestamp)}" y="${height - 12}" text-anchor="middle">${escapeHtml(options.range === "year" || options.range === "all" ? formatDate(timestamp) : formatTime(timestamp))}</text>`;
  }).join("");
  const paths = definitions.map((definition) => {
    const segments = [];
    let segment = [];
    for (const point of usable) {
      const value = definition.value(point);
      if (Number.isFinite(value)) {
        segment.push({ point, value });
      } else if (segment.length) {
        segments.push(segment);
        segment = [];
      }
    }
    if (segment.length) segments.push(segment);
    const renderedSegments = segments.map((items) => {
      if (items.length === 1) {
        const item = items[0];
        return `<circle class="chart-point" cx="${x(item.point.at).toFixed(2)}" cy="${y(item.value).toFixed(2)}" r="3.5" style="fill:${definition.colour}"><title>${escapeHtml(`${definition.label}: ${formatNumber(item.value, options.unit || "", 2)} at ${formatTime(item.point.at)}`)}</title></circle>`;
      }
      const path = items.map((item, index) => `${index === 0 ? "M" : "L"} ${x(item.point.at).toFixed(2)} ${y(item.value).toFixed(2)}`).join(" ");
      const last = items.at(-1);
      return `<path class="chart-line ${definition.dashed ? "dashed" : ""}" style="stroke:${definition.colour}" d="${path}"></path><circle class="chart-point" cx="${x(last.point.at).toFixed(2)}" cy="${y(last.value).toFixed(2)}" r="3" style="fill:${definition.colour}"><title>${escapeHtml(`${definition.label}: ${formatNumber(last.value, options.unit || "", 2)} at ${formatTime(last.point.at)}`)}</title></circle>`;
    }).join("");
    return renderedSegments;
  }).join("");
  const availableDefinitions = definitions.filter((definition) => usable.some((point) => Number.isFinite(definition.value(point))));
  const legend = `<div class="chart-legend">${availableDefinitions.map((definition) => `<span><i style="background:${definition.colour}"></i>${escapeHtml(definition.label)}</span>`).join("")}</div>`;
  const note = usable.length === 1 ? `<div class="chart-note">Only one recorder sample is currently available.</div>` : "";
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label || "Energy chart")}">${grid}${ticks}${paths}</svg>${legend}${note}</div>`;
}

function groupedBarChart(points, definitions, options = {}) {
  const usable = (points || []).filter((point) => definitions.some((definition) => Number.isFinite(definition.value(point))));
  if (!usable.length) return chartEmpty();
  const visible = usable.slice(-Math.max(1, options.maxBars || 14));
  const width = 960;
  const height = options.height || 310;
  const padding = { left: 56, right: 20, top: 24, bottom: 54 };
  const maximum = Math.max(1, ...visible.flatMap((point) => definitions.map((definition) => Math.max(0, definition.value(point) || 0))));
  const plotWidth = width - padding.left - padding.right;
  const groupWidth = plotWidth / visible.length;
  const barWidth = Math.max(3, Math.min(24, groupWidth * 0.72 / definitions.length));
  const y = (value) => padding.top + (1 - value / maximum) * (height - padding.top - padding.bottom);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = maximum - maximum * index / 4;
    const py = y(value);
    return `<line class="chart-gridline" x1="${padding.left}" y1="${py}" x2="${width - padding.right}" y2="${py}"></line><text class="chart-axis" x="${padding.left - 9}" y="${py + 4}" text-anchor="end">${escapeHtml(formatNumber(value, options.unit || "", 1))}</text>`;
  }).join("");
  const bars = visible.map((point, pointIndex) => {
    const groupX = padding.left + pointIndex * groupWidth + groupWidth / 2;
    const rects = definitions.map((definition, definitionIndex) => {
      const value = Math.max(0, definition.value(point) || 0);
      const naturalHeight = height - padding.bottom - y(value);
      const barHeight = value === 0 ? 1.5 : Math.max(2, naturalHeight);
      const barY = value === 0 ? height - padding.bottom - barHeight : y(value);
      const bx = groupX - definitions.length * barWidth / 2 + definitionIndex * barWidth;
      return `<rect class="chart-bar" x="${bx}" y="${barY}" width="${Math.max(2, barWidth - 2)}" height="${barHeight}" rx="3" style="fill:${definition.colour}"><title>${escapeHtml(`${definition.label}: ${formatNumber(value, options.unit || "", 2)}`)}</title></rect>`;
    }).join("");
    const label = options.range === "year" || options.range === "all" ? formatDate(point.at) : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }).format(new Date(point.at));
    return `${rects}<text class="chart-axis" x="${groupX}" y="${height - 18}" text-anchor="middle">${escapeHtml(label)}</text>`;
  }).join("");
  const legend = `<div class="chart-legend">${definitions.map((definition) => `<span><i style="background:${definition.colour}"></i>${escapeHtml(definition.label)}</span>`).join("")}</div>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label || "Performance chart")}">${grid}${bars}</svg>${legend}</div>`;
}

function breakdownCard(title, total, segments, type = "calculated", subtitle = "") {
  const hasTotal = Number.isFinite(total);
  const hasSegments = segments.some((segment) => Number.isFinite(segment.value));
  if (!hasTotal && !hasSegments) {
    return `<section class="breakdown-card unavailable-breakdown">
      <header><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div>${sourceBadge(type)}</header>
      <strong>Unavailable</strong>
      <div class="segmented-bar empty"></div>
      <p class="empty-breakdown-copy">No suitable energy statistic is available for this period yet.</p>
    </section>`;
  }
  const valid = segments.map((segment) => ({ ...segment, value: Number.isFinite(segment.value) ? Math.max(0, segment.value) : 0 }));
  const sum = valid.reduce((result, segment) => result + segment.value, 0);
  const denominator = hasTotal && total > 0 ? total : sum;
  const bar = denominator > 0
    ? `<div class="segmented-bar" aria-label="${escapeHtml(title)}">${valid.map((segment) => `<span style="width:${clamp(segment.value / denominator * 100, 0, 100)}%;background:${segment.colour}" title="${escapeHtml(`${segment.label}: ${formatNumber(segment.value, "kWh", 2)}`)}"></span>`).join("")}</div>`
    : `<div class="segmented-bar empty"></div>`;
  return `<section class="breakdown-card">
    <header><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div>${sourceBadge(type)}</header>
    <strong>${formatNumber(hasTotal ? total : sum, "kWh", 2)}</strong>
    ${bar}
    <div class="breakdown-list">${valid.map((segment) => `<div><span><i style="background:${segment.colour}"></i>${escapeHtml(segment.label)}</span><b>${escapeHtml(formatNumber(segment.value, "kWh", 2))}</b></div>`).join("")}</div>
  </section>`;
}

function costBreakdown(title, values, type = "observed") {
  const rows = [
    ["Gross import cost", values.importCost, "charge"],
    ["Export income", values.exportIncome, "credit"],
    ["Net electricity cost", values.netCost, "net"],
    ["Gas cost", values.gasCost, "charge"],
    ["Whole-home cost", values.wholeHomeCost, "net"]
  ];
  return `<section class="breakdown-card cost-card">
    <header><div><h3>${escapeHtml(title)}</h3><p>Only values supplied by KEMS are shown.</p></div>${sourceBadge(type)}</header>
    <div class="cost-list">${rows.map(([label, value, tone]) => `<div><span>${escapeHtml(label)}</span><b class="${tone}">${escapeHtml(formatMoney(value))}</b></div>`).join("")}</div>
  </section>`;
}

function advicePanel() {
  const snapshot = state.snapshot;
  const currentRate = snapshot.metrics.currentRate;
  const nextRate = snapshot.metrics.nextRate;
  return card("KEMS advice", `<div class="advice-content">
    ${sourceBadge("observed", "KEMS advice")}
    <h3>${escapeHtml(snapshot.recommendation || "KEMS is observing")}</h3>
    <p>${escapeHtml(snapshot.recommendationDetail || "No additional explanation is available.")}</p>
    <div class="fact-grid">
      <div><span>Phase</span><strong>${escapeHtml(snapshot.phase || "Unknown")}</strong></div>
      <div><span>Current rate</span><strong>${escapeHtml(formatNumber(currentRate, "p/kWh", 3))}</strong></div>
      <div><span>Next rate</span><strong>${escapeHtml(formatNumber(nextRate, "p/kWh", 3))}</strong></div>
      <div><span>Cheap period</span><strong>${snapshot.metrics.cheapPeriodConfirmed ? "Confirmed" : "Not confirmed"}</strong></div>
    </div>
  </div>`, { className: "advice-panel" });
}

function currentPowerChart(mode = "live") {
  const history = state.today?.history || [];
  if (mode === "simulated") {
    return lineChart(history, [
      { label: "Home", colour: COLOURS.home, value: (point) => point.simulatedHouse },
      { label: "Grid import", colour: COLOURS.negative, value: (point) => point.simulatedGridImport },
      { label: "Grid export", colour: COLOURS.positive, value: (point) => -(point.simulatedGridExport || 0) },
      { label: "Solar", colour: COLOURS.solar, value: (point) => point.solarSimulated },
      { label: "Battery to home", colour: COLOURS.battery, value: (point) => point.simulatedBatteryToHome }
    ], { unit: "kW", label: "Simulated power through today" });
  }
  return lineChart(history, [
    { label: "Home", colour: COLOURS.home, value: (point) => point.house },
    { label: "Grid (+ import / − export)", colour: COLOURS.grid, dashed: true, value: (point) => point.grid },
    { label: "EV", colour: COLOURS.ev, value: (point) => point.ev },
    { label: "Solar", colour: COLOURS.solar, value: (point) => point.solarLive },
    { label: "Battery", colour: COLOURS.battery, value: (point) => point.batteryLive }
  ], { unit: "kW", label: "Live power through today" });
}

function liveView() {
  const snapshot = state.snapshot;
  const totals = liveTotals();
  const breakdowns = state.today?.actual?.breakdowns || {};
  const gridDirection = snapshot.metrics.gridFlowDirection || "unavailable";
  const netCost = totals.netCost ?? totals.costToday;
  return `${pageHeader("Live today", "What your home is doing now, and what has actually happened since midnight.", `${sourceBadge("live")}${sourceBadge("observed")}`)}
    <div class="metric-grid six">
      ${metricCard("Home now", formatNumber(snapshot.metrics.housePower, "kW", 2), "Current whole-home demand", "live", "⌂")}
      ${metricCard("Grid now", formatNumber(Math.abs(snapshot.metrics.gridPower || 0), "kW", 2), gridDirection, "live", "↔")}
      ${metricCard("Imported today", formatNumber(totals.gridImport, "kWh", 2), "KEMS observed", "observed", "↓")}
      ${metricCard("Exported today", formatNumber(totals.gridExport, "kWh", 2), "KEMS observed", "observed", "↑")}
      ${metricCard("Net electricity cost", formatMoney(netCost), "Import minus export income", "observed", "£")}
      ${metricCard("Current tariff", formatNumber(snapshot.metrics.currentRate, "p/kWh", 3), snapshot.metrics.offPeak ? "Off-peak" : "Standard / peak", snapshot.metrics.offPeak ? "positive" : "calculated", "◷")}
    </div>
    ${state.snapshot.alpha5 ? `<div class="alpha5-status-strip">
      <div><span>Export tariff</span><strong>${escapeHtml(state.snapshot.alpha5.exportTariffStatus || "unknown")}</strong></div>
      <div><span>No-export policy</span><strong>${state.snapshot.alpha5.noExportModeActive ? "Active" : "Inactive"}</strong></div>
      <div><span>Accumulator</span><strong>${escapeHtml(state.snapshot.alpha5.accumulatorStatus || "unknown")}</strong></div>
      <div><span>History repair</span><strong>${state.snapshot.alpha5.historicalRepairRequired ? "Required" : "Clear"}</strong></div>
    </div>` : ""}
    <div class="dashboard-grid flow-and-advice">
      ${card("Live energy flow", energyFlow("live"), { subtitle: "Home is central; every arrow follows measured power direction.", className: "flow-panel" })}
      ${advicePanel()}
    </div>
    ${card("Power through today", currentPowerChart("live"), { subtitle: "Recorder history from local midnight. Positive grid values import; negative values export.", className: "chart-panel" })}
    <div class="breakdown-grid">
      ${breakdownCard("Grid import breakdown", totals.gridImport, [
        { label: "Home usage", value: breakdowns.gridImport?.home, colour: COLOURS.home },
        { label: "EV charging", value: breakdowns.gridImport?.ev, colour: COLOURS.ev },
        { label: "Battery charging", value: breakdowns.gridImport?.battery, colour: COLOURS.battery },
        { label: "Unallocated", value: breakdowns.gridImport?.unallocated, colour: COLOURS.muted }
      ], "calculated", "Allocated from simultaneous live power samples.")}
      ${breakdownCard("Grid export breakdown", totals.gridExport, [
        { label: "Solar export", value: breakdowns.gridExport?.solar, colour: COLOURS.solar },
        { label: "Battery export", value: breakdowns.gridExport?.battery, colour: COLOURS.battery },
        { label: "Unallocated", value: breakdowns.gridExport?.unallocated, colour: COLOURS.muted }
      ], "calculated", "Calculated only when physical source data exists.")}
      ${costBreakdown("Today’s costs", totals, "observed")}
    </div>
    <div class="data-note"><strong>Data rule:</strong> physical solar and battery values stay unavailable until real sensors exist. They are never replaced by simulated values on this page.</div>`;
}

function simulationView() {
  const snapshot = state.snapshot;
  const totals = simulatedTotals();
  const breakdowns = state.today?.simulated?.breakdowns || {};
  const strategy = state.snapshot.simulation?.strategy || entityState("sensor.kems_simulation_strategy", "KEMS alpha5 model");
  const noExport = Boolean(state.snapshot.simulation?.noExportModeActive);
  const exportStatus = state.snapshot.simulation?.exportTariffStatus || "unknown";
  return `${pageHeader("Simulated today", "How KEMS alpha5 estimates today with the proposed solar, battery and current tariff policy.", `${sourceBadge("simulated")}${sourceBadge("calculated")}${noExport ? statusPill("Awaiting export tariff · no export", "attention") : statusPill("Export tariff active", "good")}`)}
    <div class="metric-grid six">
      ${metricCard("Modelled home load", formatNumber(entityNumber("sensor.kems_simulated_house_load_power") ?? snapshot.metrics.housePower, "kW", 2), "Uses today’s demand profile", "simulated", "⌂")}
      ${metricCard("Simulated SOC", formatPercent(snapshot.simulation.batterySoc, 1), "Virtual battery", "simulated", "▰")}
      ${metricCard("Imported today", formatNumber(totals.gridImport, "kWh", 2), "KEMS simulation", "simulated", "↓")}
      ${metricCard("Exported today", formatNumber(totals.gridExport, "kWh", 2), "KEMS simulation", "simulated", "↑")}
      ${metricCard("Simulated net cost", formatMoney(totals.netCost), "Electricity after export", "simulated", "£")}
      ${metricCard("Simulated saving", formatMoney(totals.saving), "Versus observed electricity", totals.saving > 0 ? "positive" : "simulated", "＋")}
    </div>
    <div class="dashboard-grid flow-and-advice">
      ${card("Simulated energy flow", energyFlow("simulated"), { subtitle: "Purple identifies modelled power. Home remains at the centre.", className: "flow-panel simulated-panel" })}
      ${card("Simulation strategy", `<div class="strategy-content">
        ${sourceBadge("simulated")}
        <h3>${escapeHtml(strategy)}</h3>
        <p>KEMS replays today’s real demand against the alpha5 proposal model. Alpha5 also understands whether paid export is active; while awaiting an export tariff it switches to self-use-first planning and deliberately keeps grid/battery export at zero.</p>
        <div class="fact-grid">
          <div><span>Export tariff</span><strong>${escapeHtml(exportStatus)}</strong></div>
          <div><span>Solar → battery now</span><strong>${formatNumber(state.snapshot.simulation?.solarToBatteryPower, "kW", 2)}</strong></div>
          <div><span>Overnight target SOC</span><strong>${formatPercent(state.snapshot.simulation?.overnightChargeTargetSoc, 0)}</strong></div>
          <div><span>Forecast solar to cheap</span><strong>${formatNumber(state.snapshot.simulation?.forecastSolarUntilNextCheap, "kWh", 2)}</strong></div>
          <div><span>Solar generated</span><strong>${formatNumber(totals.solar, "kWh", 2)}</strong></div>
          <div><span>Battery charged</span><strong>${formatNumber(totals.batteryCharge, "kWh", 2)}</strong></div>
          <div><span>Battery to home</span><strong>${formatNumber(totals.batteryToHome, "kWh", 2)}</strong></div>
          <div><span>Battery export</span><strong>${formatNumber(totals.batteryExport, "kWh", 2)}</strong></div>
        </div>
      </div>`, { className: "advice-panel simulated-panel" })}
    </div>
    ${card("Simulated power through today", currentPowerChart("simulated"), { subtitle: "Modelled power is kept separate from all physical measurements.", className: "chart-panel simulated-panel" })}
    <div class="breakdown-grid">
      ${breakdownCard("Simulated grid import", totals.gridImport, [
        { label: "Home usage", value: breakdowns.gridImport?.home, colour: COLOURS.home },
        { label: "EV charging", value: breakdowns.gridImport?.ev, colour: COLOURS.ev },
        { label: "Battery charging", value: breakdowns.gridImport?.battery, colour: COLOURS.battery },
        { label: "Unallocated", value: breakdowns.gridImport?.unallocated, colour: COLOURS.muted }
      ], "simulated", "Allocation uses modelled loads and today’s actual demand profile.")}
      ${breakdownCard("Simulated grid export", totals.gridExport, [
        { label: "Solar export", value: breakdowns.gridExport?.solar, colour: COLOURS.solar },
        { label: "Battery export", value: breakdowns.gridExport?.battery, colour: COLOURS.battery },
        { label: "Unallocated", value: breakdowns.gridExport?.unallocated, colour: COLOURS.muted }
      ], "simulated", "Battery export is direct from KEMS; solar is the remaining export.")}
      ${costBreakdown("Simulated costs", totals, "simulated")}
    </div>
    <div class="data-note simulated"><strong>Simulation only:</strong> none of the values on this page are physical FoxESS commands or live battery/solar measurements.</div>`;
}

function difference(actual, simulated, invert = false) {
  if (!Number.isFinite(actual) || !Number.isFinite(simulated)) return null;
  return invert ? actual - simulated : simulated - actual;
}

function comparisonRow(label, actual, simulated, unit = "kWh", lowerIsBetter = false) {
  const delta = difference(actual, simulated);
  const improvement = lowerIsBetter ? actual - simulated : simulated - actual;
  const tone = !Number.isFinite(improvement) ? "neutral" : improvement > 0.001 ? "good" : improvement < -0.001 ? "bad" : "neutral";
  const formatter = unit === "GBP" ? formatMoney : (value) => formatNumber(value, unit, 2);
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(formatter(actual))}</td><td>${escapeHtml(formatter(simulated))}</td><td class="${tone}">${Number.isFinite(delta) ? `${delta >= 0 ? "+" : ""}${escapeHtml(formatter(delta))}` : "Unavailable"}</td></tr>`;
}

function comparisonChart() {
  const history = state.today?.history || [];
  return lineChart(history, [
    { label: "Live grid", colour: COLOURS.live, value: (point) => point.grid },
    { label: "Simulated grid", colour: COLOURS.simulated, dashed: true, value: (point) => Number.isFinite(point.simulatedGridImport) || Number.isFinite(point.simulatedGridExport) ? (point.simulatedGridImport || 0) - (point.simulatedGridExport || 0) : null }
  ], { unit: "kW", label: "Live versus simulated net grid power" });
}

function compareView() {
  const actual = liveTotals();
  const simulated = simulatedTotals();
  const importSaved = difference(simulated.gridImport, actual.gridImport, true);
  const extraExport = difference(actual.gridExport, simulated.gridExport);
  const costSaving = Number.isFinite(simulated.saving) ? simulated.saving : difference(simulated.netCost, actual.netCost, true);
  const importPercent = Number.isFinite(importSaved) && actual.gridImport > 0 ? importSaved / actual.gridImport * 100 : null;
  return `${pageHeader("Live vs simulated", "A direct current-day comparison without repeating the full dashboard twice.", `${sourceBadge("live")}${sourceBadge("simulated")}`)}
    <div class="metric-grid four">
      ${metricCard("Grid import change", formatNumber(importSaved, "kWh", 2), Number.isFinite(importPercent) ? `${formatPercent(importPercent, 1)} less than observed` : "Comparison unavailable", importSaved > 0 ? "positive" : "calculated", "↓")}
      ${metricCard("Extra export", formatNumber(extraExport, "kWh", 2), "Simulation minus observed", extraExport > 0 ? "positive" : "calculated", "↑")}
      ${metricCard("Cost saving", formatMoney(costSaving), "KEMS simulated saving today", costSaving > 0 ? "positive" : "simulated", "£")}
      ${metricCard("Battery contribution", formatNumber(simulated.batteryToHome, "kWh", 2), "Simulated battery to home", "simulated", "▰")}
    </div>
    <div class="comparison-flows">
      ${card("Live", energyFlow("live", true), { subtitle: "Physical measurements only.", className: "mini-flow-panel" })}
      ${card("Simulated", energyFlow("simulated", true), { subtitle: "Proposal model only.", className: "mini-flow-panel simulated-panel" })}
    </div>
    ${card("Net grid power comparison", comparisonChart(), { subtitle: "Above zero is import; below zero is export.", className: "chart-panel" })}
    <div class="comparison-grid">
      ${card("Today at a glance", `<div class="table-scroll"><table class="comparison-table"><thead><tr><th>Measure</th><th>Live</th><th>Simulated</th><th>Difference</th></tr></thead><tbody>
        ${comparisonRow("Home energy", actual.home, simulated.home)}
        ${comparisonRow("Grid import", actual.gridImport, simulated.gridImport, "kWh", true)}
        ${comparisonRow("Grid export", actual.gridExport, simulated.gridExport)}
        ${comparisonRow("Electricity net cost", actual.netCost, simulated.netCost, "GBP", true)}
        ${comparisonRow("Whole-home cost", actual.wholeHomeCost, simulated.wholeHomeCost, "GBP", true)}
      </tbody></table></div>`, { className: "comparison-table-panel" })}
      ${card("What changes in the simulation", `<div class="difference-list">
        <div><span>Solar generation</span><strong>${formatNumber(simulated.solar, "kWh", 2)}</strong><small>Modelled production available to home, battery or export.</small></div>
        <div><span>Battery charged</span><strong>${formatNumber(simulated.batteryCharge, "kWh", 2)}</strong><small>Energy moved into the virtual battery.</small></div>
        <div><span>Battery to home</span><strong>${formatNumber(simulated.batteryToHome, "kWh", 2)}</strong><small>Demand no longer needing direct grid supply.</small></div>
        <div><span>Battery export</span><strong>${formatNumber(simulated.batteryExport, "kWh", 2)}</strong><small>Modelled export after home reserve and safeguards.</small></div>
      </div>`, { className: "difference-panel" })}
    </div>`;
}

function rangeControls() {
  const labels = { day: "Day", week: "Week", month: "Month", year: "Year", all: "All time" };
  return `<div class="range-control" role="group" aria-label="Performance range">${Object.entries(labels).map(([range, label]) => `<button type="button" data-range="${range}" class="${state.range === range ? "active" : ""}">${label}</button>`).join("")}</div>`;
}

function economicsPanel(economics = {}) {
  const recovered = Number.isFinite(economics.actualValue) && Number.isFinite(economics.systemCost) && economics.systemCost > 0
    ? clamp(economics.actualValue / economics.systemCost * 100, 0, 100) : 0;
  return `<div class="economics-layout">
    <section class="economics-hero">
      <div class="roi-ring" style="--value:${recovered}"><span><strong>${formatPercent(recovered, 1)}</strong><small>cost recovered</small></span></div>
      <div><p class="eyebrow">Actual economics</p><h3>${formatMoney(economics.actualValue)}</h3><p>Actual system value accumulated against a total system cost of <strong>${formatMoney(economics.systemCost)}</strong>.</p></div>
    </section>
    <div class="economics-cards">
      <div><span>System purchase</span><strong>${formatMoney(economics.investment)}</strong></div>
      <div><span>Operating costs</span><strong>${formatMoney(economics.operatingCosts)}</strong></div>
      <div><span>Actual ROI</span><strong>${formatPercent(economics.actualRoi, 2)}</strong></div>
      <div><span>Actual annualised value</span><strong>${formatMoney(economics.actualAnnualisedValue)}</strong></div>
      <div><span>Actual payback</span><strong>${formatDurationYears(economics.actualPaybackYears)}</strong></div>
      <div><span>Still to recover</span><strong>${formatMoney(economics.actualPaybackRemaining)}</strong></div>
    </div>
    <section class="simulator-roi">
      <header>${sourceBadge("forecast", "Simulator ROI from actual demand")}</header>
      <div class="simulator-roi-grid">
        <div><span>Modelled value accrued</span><strong>${formatMoney(economics.simulatedValue)}</strong></div>
        <div><span>Observed evidence</span><strong>${formatNumber(economics.operatingDays, "days", 0)}</strong></div>
        <div><span>Evidence annualised</span><strong>${formatMoney(economics.simulatorEvidenceAnnualValue)}</strong></div>
        <div><span>Evidence-based ROI</span><strong>${formatPercent(economics.simulatorEvidenceAnnualRoi, 2)}</strong></div>
        <div><span>Evidence payback</span><strong>${formatDurationYears(economics.simulatorEvidencePaybackYears)}</strong></div>
        <div><span>KEMS annual forecast</span><strong>${formatMoney(economics.predictedAnnualSaving)}</strong></div>
        <div><span>KEMS forecast ROI</span><strong>${formatPercent(economics.simulatorAnnualRoi, 2)}</strong></div>
        <div><span>Proposal benchmark</span><strong>${formatMoney(economics.proposalAnnualSavingBenchmark)}</strong></div>
      </div>
      <p>The evidence run-rate annualises KEMS modelled value over days actually observed. The KEMS forecast and proposal benchmark remain separate, so an early alpha estimate cannot be mistaken for actual ROI.</p>
    </section>
  </div>`;
}

function performanceSeriesChart(data) {
  if (data.range === "day") return currentPowerChart("live");
  return groupedBarChart(data.series || [], [
    { label: "Home usage", colour: COLOURS.home, value: (point) => point.home },
    { label: "Grid import", colour: COLOURS.negative, value: (point) => point.gridImport },
    { label: "Grid export", colour: COLOURS.positive, value: (point) => point.gridExport }
  ], { unit: "kWh", range: data.range, maxBars: data.range === "month" ? 15 : data.range === "year" || data.range === "all" ? 12 : 8, label: "Energy performance over time" });
}

function costSeriesChart(data) {
  if (data.range === "day") return chartEmpty("Daily cost totals are shown in the cards above.");
  return groupedBarChart(data.series || [], [
    { label: "Import cost", colour: COLOURS.negative, value: (point) => point.importCost },
    { label: "Export income", colour: COLOURS.positive, value: (point) => point.exportIncome },
    { label: "System value", colour: COLOURS.simulated, value: (point) => point.systemValue }
  ], { unit: "£", range: data.range, maxBars: data.range === "month" ? 15 : data.range === "year" || data.range === "all" ? 12 : 8, label: "Energy cost and value over time" });
}

function performanceView() {
  const data = state.performance?.range === state.range ? state.performance : state.range === "day" ? state.today : state.performance;
  const action = rangeControls();
  if (!data || data.loading) {
    return `${pageHeader("Performance & ROI", "Energy, cost and return across the period that matters to you.", action)}<div class="loading-panel">Loading ${escapeHtml(state.range)} performance…</div>`;
  }
  if (!data.available) {
    return `${pageHeader("Performance & ROI", "Energy, cost and return across the period that matters to you.", action)}<div class="error-panel">${escapeHtml(data.error || "Performance data is unavailable.")}</div>`;
  }
  const totals = data.actual?.totals || {};
  const breakdowns = data.actual?.breakdowns || {};
  const netCost = Number.isFinite(totals.netCost) ? totals.netCost : Number.isFinite(totals.importCost) ? totals.importCost - (totals.exportIncome || 0) : null;
  const selfSufficiency = Number.isFinite(totals.home) && totals.home > 0 && Number.isFinite(totals.gridImport)
    ? clamp((1 - totals.gridImport / totals.home) * 100, 0, 100) : null;
  const native = data.nativePeriod;
  return `${pageHeader("Performance & ROI", `${data.label || "Selected period"}. Alpha5 native period totals are authoritative; recorder statistics provide chart detail when available.`, action)}
    <div class="metric-grid six">
      ${metricCard("Home usage", formatNumber(totals.home, "kWh", 2), data.label || "Selected period", "observed", "⌂")}
      ${metricCard("Grid import", formatNumber(totals.gridImport, "kWh", 2), "Total imported energy", "observed", "↓")}
      ${metricCard("Grid export", formatNumber(totals.gridExport, "kWh", 2), "Total exported energy", "observed", "↑")}
      ${metricCard("Net energy cost", formatMoney(netCost), "Import cost minus export income", "observed", "£")}
      ${metricCard("Self-sufficiency", formatPercent(selfSufficiency, 1), "Calculated from home and grid totals", "calculated", "%")}
      ${metricCard("System value", formatMoney(totals.systemValue ?? data.economics?.actualValue), "Actual KEMS value", "positive", "＋")}
    </div>
    ${native ? `<div class="data-note ${native.dataComplete ? "" : "warning"}"><strong>Alpha5 period ledger:</strong> ${escapeHtml(String(native.daysIncluded ?? 0))} day(s) included; ${escapeHtml(String(native.completeDays ?? 0))} complete, ${escapeHtml(String(native.incompleteDays ?? 0))} incomplete. ${native.dataComplete ? "Period marked complete." : "Current/incomplete days are included and remain provisional."}</div>` : ""}
    ${data.warning ? `<div class="data-note warning"><strong>Chart history note:</strong> ${escapeHtml(data.warning)}</div>` : ""}
    <div class="dashboard-grid two-charts">
      ${card("Energy over time", performanceSeriesChart(data), { subtitle: "Home use, import and export for each recorder bucket.", className: "chart-panel" })}
      ${card("Cost and value over time", costSeriesChart(data), { subtitle: "Import cost, export income and realised system value.", className: "chart-panel" })}
    </div>
    <div class="breakdown-grid">
      ${breakdownCard("Grid import allocation", totals.gridImport, [
        { label: "Home usage", value: breakdowns.gridImport?.home, colour: COLOURS.home },
        { label: "EV charging", value: breakdowns.gridImport?.ev, colour: COLOURS.ev },
        { label: "Battery charging", value: breakdowns.gridImport?.battery, colour: COLOURS.battery },
        { label: "Unallocated", value: breakdowns.gridImport?.unallocated, colour: COLOURS.muted }
      ], "calculated", "Period totals are proportionally allocated when direct flow sensors are unavailable.")}
      ${breakdownCard("Grid export allocation", totals.gridExport, [
        { label: "Solar export", value: breakdowns.gridExport?.solar, colour: COLOURS.solar },
        { label: "Battery export", value: breakdowns.gridExport?.battery, colour: COLOURS.battery },
        { label: "Unallocated", value: breakdowns.gridExport?.unallocated, colour: COLOURS.muted }
      ], "calculated", "Uses KEMS solar generation and battery discharge evidence.")}
      ${costBreakdown("Period costs", { ...totals, netCost }, "observed")}
    </div>
    ${card("System cost, actual ROI and simulator ROI", economicsPanel(data.economics || {}), { subtitle: "Actual realised value and modelled future return are always shown separately.", className: "economics-panel" })}
    <div class="data-note"><strong>Coverage:</strong> ${escapeHtml(String(data.coverage || 0))} long-term statistic points. Source: ${escapeHtml(data.source || "KEMS")}. Allocations are estimates unless KEMS exposes a direct source-to-destination total.</div>`;
}

function footer() {
  return `<footer class="site-footer"><div><strong>KEMS alpha5</strong><span>Read-only Home Assistant companion · ${escapeHtml(state.config?.project?.version || "web")}</span></div><div><span>${escapeHtml(state.snapshot?.discovery?.totalKemsEntities || 0)} KEMS entities</span><span>Updated ${escapeHtml(formatTime(state.snapshot?.updatedAt))}</span></div></footer>`;
}

function bindViewEvents() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", async () => {
      const range = button.dataset.range;
      if (!RANGES.has(range)) return;
      state.range = range;
      if (range === "day") state.performance = state.today;
      else await ensurePerformance(range);
      render();
    });
  });
}

function renderConnectionPage() {
  setConnectionPill();
  app.innerHTML = `<section class="connection-layout">
    <div class="connection-intro">
      <img src="logo.svg" alt="" />
      <p class="eyebrow">KEMS alpha5 web dashboard</p>
      <h1>Your existing KEMS data, presented clearly.</h1>
      <p>Enter your Home Assistant address and long-lived access token. The website discovers the existing KEMS entities and remains completely read-only.</p>
      <div class="connection-points"><div><strong>4 focused views</strong><span>No duplicated dashboards</span></div><div><strong>Secure backend</strong><span>Token never enters chart code</span></div><div><strong>No HA changes</strong><span>Nothing to install in Home Assistant</span></div></div>
    </div>
    <form class="connection-form" id="connection-form">
      <h2>Connect Home Assistant</h2>
      <label><span>Home Assistant address</span><input id="ha-url" class="input" type="url" required placeholder="http://homeassistant.local:8123" autocomplete="url" value="${escapeHtml(state.setup?.homeAssistantUrl || "")}" /><small>Use the address this computer can reach.</small></label>
      <label><span>Long-lived access token</span><div class="token-field"><input id="ha-token" class="input" type="password" required autocomplete="off" placeholder="Paste token" /><button id="show-token" type="button">Show</button></div><small>Create it from your Home Assistant user profile.</small></label>
      <label class="remember-row"><input id="remember-connection" type="checkbox" checked /><span>Remember this connection on this computer</span></label>
      <div id="connection-result" class="form-result" aria-live="polite"></div>
      <div class="form-actions"><button class="button secondary" id="test-connection" type="button">Test connection</button><button class="button primary" type="submit">Connect to KEMS</button></div>
    </form>
  </section>`;
  bindConnectionForm();
}

function bindConnectionForm() {
  const form = document.querySelector("#connection-form");
  const result = document.querySelector("#connection-result");
  const token = document.querySelector("#ha-token");
  document.querySelector("#show-token")?.addEventListener("click", (event) => {
    token.type = token.type === "password" ? "text" : "password";
    event.currentTarget.textContent = token.type === "password" ? "Show" : "Hide";
  });
  const payload = () => ({
    url: document.querySelector("#ha-url").value.trim(),
    token: token.value.trim(),
    remember: document.querySelector("#remember-connection").checked
  });
  document.querySelector("#test-connection")?.addEventListener("click", async () => {
    result.className = "form-result";
    result.textContent = "Testing Home Assistant and KEMS discovery…";
    try {
      const response = await getJson("/api/setup/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      result.className = "form-result good";
      result.textContent = `Connected to ${response.locationName}. Found ${response.kemsEntityCount} KEMS entities.`;
    } catch (error) {
      result.className = "form-result danger";
      result.textContent = error.message;
    }
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.className = "form-result";
    result.textContent = "Saving connection and loading KEMS…";
    try {
      await getJson("/api/setup/connection", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      state.setup = await getJson("/api/setup/status");
      await refreshAll(false);
      connectStream();
      location.hash = "#live";
    } catch (error) {
      result.className = "form-result danger";
      result.textContent = error.message;
    }
  });
}

async function openSettingsDrawer() {
  try {
    const requests = [];
    if (!state.catalog.length && state.setup?.configured) requests.push(getJson("/api/entity-catalog").then((response) => { state.catalog = response.entities || []; }));
    requests.push(getJson("/api/history-diagnostics").then((response) => { state.diagnostics = response; }));
    await Promise.allSettled(requests);
  } catch {}
  renderSettingsDrawer();
}

function renderSettingsDrawer() {
  const query = state.catalogQuery.toLowerCase();
  const items = state.catalog.filter((item) => !query || item.entityId.toLowerCase().includes(query) || String(item.attributes?.friendly_name || "").toLowerCase().includes(query)).slice(0, 100);
  drawerRoot.innerHTML = `<div class="drawer-backdrop"><aside class="drawer" aria-label="KEMS settings">
    <header><div><p class="eyebrow">Dashboard settings</p><h2>Connection &amp; entities</h2></div><button id="close-drawer" class="icon-button" type="button" aria-label="Close settings">×</button></header>
    <div class="drawer-content">
      <section class="drawer-section"><h3>Home Assistant connection</h3><div class="connection-summary"><span>Address</span><strong>${escapeHtml(state.setup?.homeAssistantUrl || "Not configured")}</strong><span>Status</span><strong>${state.snapshot?.connected ? "Connected" : "Offline"}</strong><span>KEMS entities</span><strong>${escapeHtml(String(state.snapshot?.discovery?.totalKemsEntities || 0))}</strong></div><div class="drawer-actions"><button class="button secondary" id="change-connection" type="button">Change connection</button><button class="button danger" id="remove-connection" type="button">Remove saved connection</button></div></section>
      <section class="drawer-section"><h3>Data classification</h3><div class="badge-guide">${sourceBadge("live")}${sourceBadge("observed")}${sourceBadge("simulated")}${sourceBadge("calculated")}${sourceBadge("forecast")}</div></section>
      <section class="drawer-section"><h3>KEMS app</h3><div class="connection-summary"><span>Status</span><strong>${escapeHtml(pwaStatus().label)}</strong><span>Mode</span><strong>${isStandaloneApp() ? "Installed app" : "Website"}</strong></div><p class="drawer-note">${escapeHtml(pwaStatus().detail)}</p>${deferredInstallPrompt ? `<div class="drawer-actions"><button class="button primary" id="install-pwa" type="button">Install KEMS app</button></div>` : ""}</section>
      <section class="drawer-section"><h3>History diagnostics</h3><div class="connection-summary"><span>Current-day source</span><strong>${escapeHtml(state.diagnostics?.currentDay?.source || "Not checked")}</strong><span>Current-day points</span><strong>${escapeHtml(String(state.diagnostics?.currentDay?.points || 0))}</strong><span>Energy history source</span><strong>${escapeHtml(state.diagnostics?.energyDashboard?.source || state.diagnostics?.fallback?.source || state.diagnostics?.statistics?.source || "Not checked")}</strong><span>Energy statistic changes</span><strong>${escapeHtml(String(state.diagnostics?.energyDashboard?.points || 0))}</strong><span>KEMS lifetime points</span><strong>${escapeHtml(String(state.diagnostics?.statistics?.points || 0))}</strong><span>Local ledger days</span><strong>${escapeHtml(String(state.diagnostics?.localLedgerDays || 0))}</strong></div>${state.diagnostics?.energyDashboard?.warning ? `<p class="drawer-note">${escapeHtml(state.diagnostics.energyDashboard.warning)}</p>` : state.diagnostics?.statistics?.warning ? `<p class="drawer-note">${escapeHtml(state.diagnostics.statistics.warning)}</p>` : ""}</section>
      <section class="drawer-section entity-explorer"><h3>KEMS entity explorer</h3><input id="entity-search" class="input" type="search" placeholder="Search entity or friendly name" value="${escapeHtml(state.catalogQuery)}" /><div class="entity-list">${items.map((item) => `<button type="button" data-entity-id="${escapeHtml(item.entityId)}"><span><strong>${escapeHtml(item.attributes?.friendly_name || item.entityId)}</strong><small>${escapeHtml(item.entityId)}</small></span><b>${escapeHtml(formatEntityValue(item))}</b></button>`).join("") || `<p>No matching entities.</p>`}</div></section>
    </div>
  </aside></div>`;
  document.querySelector("#close-drawer")?.addEventListener("click", () => drawerRoot.innerHTML = "");
  document.querySelector(".drawer-backdrop")?.addEventListener("click", (event) => { if (event.target.classList.contains("drawer-backdrop")) drawerRoot.innerHTML = ""; });
  document.querySelector("#entity-search")?.addEventListener("input", (event) => { state.catalogQuery = event.target.value; renderSettingsDrawer(); document.querySelector("#entity-search")?.focus(); });
  document.querySelectorAll("[data-entity-id]").forEach((button) => button.addEventListener("click", () => showEntity(button.dataset.entityId)));
  document.querySelector("#change-connection")?.addEventListener("click", () => {
    drawerRoot.innerHTML = "";
    renderChangeConnectionModal();
  });
  document.querySelector("#remove-connection")?.addEventListener("click", removeConnection);
  document.querySelector("#install-pwa")?.addEventListener("click", installPwa);
}

function showEntity(entityId) {
  const item = state.catalog.find((entityItem) => entityItem.entityId === entityId);
  if (!item) return;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><header><div><p class="eyebrow">KEMS entity</p><h2>${escapeHtml(item.attributes?.friendly_name || item.entityId)}</h2></div><button id="close-modal" class="icon-button" type="button">×</button></header><div class="modal-body"><dl class="entity-details"><div><dt>Entity ID</dt><dd>${escapeHtml(item.entityId)}</dd></div><div><dt>State</dt><dd>${escapeHtml(item.state)}</dd></div><div><dt>Unit</dt><dd>${escapeHtml(item.attributes?.unit_of_measurement || "None")}</dd></div><div><dt>Available</dt><dd>${item.available ? "Yes" : "No"}</dd></div></dl><pre>${escapeHtml(JSON.stringify(item.attributes || {}, null, 2))}</pre></div></section></div>`;
  document.querySelector("#close-modal")?.addEventListener("click", () => modalRoot.innerHTML = "");
}

function renderChangeConnectionModal() {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal connection-modal"><header><div><p class="eyebrow">Connection</p><h2>Change Home Assistant</h2></div><button id="close-modal" class="icon-button" type="button">×</button></header><div class="modal-body"><form id="change-connection-form"><label><span>Home Assistant address</span><input id="change-ha-url" class="input" type="url" value="${escapeHtml(state.setup?.homeAssistantUrl || "")}" required /></label><label><span>New long-lived access token</span><input id="change-ha-token" class="input" type="password" required /></label><label class="remember-row"><input id="change-remember" type="checkbox" checked /><span>Remember this connection</span></label><div id="change-result" class="form-result"></div><button class="button primary" type="submit">Save and reconnect</button></form></div></section></div>`;
  document.querySelector("#close-modal")?.addEventListener("click", () => modalRoot.innerHTML = "");
  document.querySelector("#change-connection-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = document.querySelector("#change-result");
    result.textContent = "Testing and reconnecting…";
    try {
      await getJson("/api/setup/connection", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          url: document.querySelector("#change-ha-url").value.trim(),
          token: document.querySelector("#change-ha-token").value.trim(),
          remember: document.querySelector("#change-remember").checked
        })
      });
      modalRoot.innerHTML = "";
      state.catalog = [];
      await refreshAll(true);
      connectStream();
    } catch (error) {
      result.className = "form-result danger";
      result.textContent = error.message;
    }
  });
}

async function removeConnection() {
  if (!window.confirm("Remove the saved Home Assistant connection from this computer? Home Assistant itself will not be changed.")) return;
  try {
    await getJson("/api/setup/connection", { method: "DELETE" });
    state.stream?.close();
    state.snapshot = null;
    state.today = null;
    state.performance = null;
    state.catalog = [];
    state.setup = await getJson("/api/setup/status");
    drawerRoot.innerHTML = "";
    renderConnectionPage();
  } catch (error) {
    toast(error.message, "danger");
  }
}

function toast(message, tone = "neutral") {
  const element = document.createElement("div");
  element.className = `toast ${tone}`;
  element.textContent = message;
  toastRoot.append(element);
  setTimeout(() => element.remove(), 4000);
}

function renderFatal(error) {
  connectionPill.querySelector("span").textContent = "Error";
  connectionPill.classList.add("error");
  app.innerHTML = `<section class="fatal"><img src="logo.svg" alt="" /><h1>KEMS could not start</h1><p>${escapeHtml(error.message || String(error))}</p><button class="button primary" id="retry-button" type="button">Try again</button></section>`;
  document.querySelector("#retry-button")?.addEventListener("click", () => location.reload());
}

initialise();
