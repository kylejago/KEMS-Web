import { derivePanelState } from "./panel-state.js?v=build1";

const app = document.querySelector("#live-app");
let latest = null;
let busy = false;

function kw(value, digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)} kW` : "—";
}

function pct(value) {
  return Number.isFinite(value) ? `${Math.max(0, Math.min(100, value)).toFixed(0)}%` : "—";
}

function statusTone(active, available = true) {
  if (!available) return "unknown";
  return active ? "good" : "idle";
}

function statusTile(label, value, tone, detail) {
  return `<div class="kems-status-tile ${tone}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}

function flowClass(active, reverse = false) {
  return `kems-web-flow${active ? " active" : ""}${reverse ? " reverse" : ""}`;
}

function batteryContent(v) {
  if (!Number.isFinite(v.batterySoc)) {
    return `<div class="kems-web-icon">▰</div><span>BATTERY</span><strong>—</strong><small>Physical battery unavailable</small>`;
  }
  const soc = Math.max(0, Math.min(100, v.batterySoc));
  const state = v.batteryCharging ? "Charging" : v.batteryDischarging ? "Discharging" : "Idle";
  return `<div class="kems-battery-gauge" aria-hidden="true"><i style="--soc:${soc}%"></i></div><span>BATTERY</span><strong>${pct(soc)}</strong><small>${state}${Number.isFinite(v.battery) ? ` · ${kw(Math.abs(v.battery))}` : ""}</small>`;
}

function ensurePanel() {
  const shell = app?.querySelector(".kems-panel-shell");
  if (!shell) return null;
  const section = shell.closest(".web21-section");
  const kicker = section?.querySelector(".web21-kicker");
  const heading = section?.querySelector("h2");
  const intro = section?.querySelector("p.web21-muted");
  if (kicker) kicker.textContent = "Panel-inspired live view";
  if (heading) heading.textContent = "KEMS Panel View";
  if (intro) intro.textContent = "A web-friendly version of the physical panel with the same live functions: source status, cost, import/export state, live power flow, battery SoC and EV state.";

  let panel = shell.querySelector(".kems-web-panel");
  if (!panel) {
    shell.innerHTML = `<div class="kems-web-panel" role="img" aria-label="KEMS live energy panel"><div class="kems-web-status" data-panel-status></div><div class="kems-web-stage"><div class="kems-web-connector solar-link"><i></i></div><div class="kems-web-connector grid-link"><i></i></div><div class="kems-web-connector battery-link"><i></i></div><div class="kems-web-connector ev-link"><i></i></div><div class="kems-web-node solar" data-node="solar"></div><div class="kems-web-node grid" data-node="grid"></div><div class="kems-web-node home" data-node="home"></div><div class="kems-web-node battery" data-node="battery"></div><div class="kems-web-node ev" data-node="ev"></div></div></div>`;
    panel = shell.querySelector(".kems-web-panel");
  }
  return panel;
}

function render(data) {
  latest = data;
  const panel = ensurePanel();
  if (!panel) return;
  const v = derivePanelState(data);

  const gridStatus = v.gridAvailable ? "✓" : "×";
  const costKnown = Number.isFinite(v.costToday);
  const costGood = costKnown && v.costToday <= 0;
  const costValue = !costKnown ? "—" : costGood ? "✓" : "×";
  const importValue = v.gridImporting ? "✓" : "×";
  const exportValue = v.gridExporting ? "✓" : "×";

  panel.querySelector("[data-panel-status]").innerHTML = [
    statusTile("GRID", gridStatus, v.gridAvailable ? "good" : "bad", v.gridAvailable ? "Connected" : "Unavailable"),
    statusTile("COST", costValue, !costKnown ? "unknown" : costGood ? "good" : "bad", !costKnown ? "No live cost yet" : costGood ? "Net saving / income" : "Net cost today"),
    statusTile("IMPORT", importValue, statusTone(v.gridImporting, v.gridAvailable), v.gridImporting ? kw(v.gridImport) : "Not importing"),
    statusTile("EXPORT", exportValue, statusTone(v.gridExporting, v.gridAvailable), v.gridExporting ? kw(v.gridExport) : "Not exporting")
  ].join("");

  panel.querySelector('[data-node="solar"]').innerHTML = `<div class="kems-web-icon">☀</div><span>SOLAR</span><strong>${kw(v.solar)}</strong><small>${Number.isFinite(v.solar) ? (v.solarProducing ? "Generating" : "Idle") : "Physical solar unavailable"}</small>`;
  panel.querySelector('[data-node="grid"]').innerHTML = `<div class="kems-web-icon">⌁</div><span>GRID</span><strong>${v.gridImporting ? kw(v.gridImport) : v.gridExporting ? kw(v.gridExport) : v.gridAvailable ? "0.00 kW" : "—"}</strong><small>${v.gridImporting ? "Importing" : v.gridExporting ? "Exporting" : v.gridAvailable ? "Balanced" : "Unavailable"}</small>`;
  panel.querySelector('[data-node="home"]').innerHTML = `<div class="kems-web-icon">⌂</div><span>HOME</span><strong>${kw(v.home)}</strong><small>Live house load</small>`;
  const batteryNode = panel.querySelector('[data-node="battery"]');
  batteryNode.className = `kems-web-node battery${Number.isFinite(v.batterySoc) ? (v.batterySoc < 10 ? " low" : "") : " unavailable"}`;
  batteryNode.innerHTML = batteryContent(v);
  panel.querySelector('[data-node="ev"]').innerHTML = `<div class="kems-web-icon">⚡</div><span>EV</span><strong>${kw(v.ev)}</strong><small>${v.evCharging ? `Charging${Number.isFinite(v.evSoc) ? ` · SoC ${pct(v.evSoc)}` : ""}` : v.evConnected ? `Connected${Number.isFinite(v.evSoc) ? ` · SoC ${pct(v.evSoc)}` : ""}` : "Not connected"}</small>`;

  const solarLink = panel.querySelector(".solar-link");
  const gridLink = panel.querySelector(".grid-link");
  const batteryLink = panel.querySelector(".battery-link");
  const evLink = panel.querySelector(".ev-link");
  solarLink.className = `${flowClass(v.solarProducing)} kems-web-connector solar-link solar-colour`;
  gridLink.className = `${flowClass(v.gridImporting || v.gridExporting, v.gridExporting)} kems-web-connector grid-link grid-colour`;
  batteryLink.className = `${flowClass(v.batteryCharging || v.batteryDischarging, v.batteryDischarging)} kems-web-connector battery-link battery-colour`;
  evLink.className = `${flowClass(v.evCharging)} kems-web-connector ev-link ev-colour`;

  const caption = panel.closest(".web21-section")?.querySelector(".kems-panel-caption");
  if (caption) {
    const gridText = v.gridImporting ? `Grid importing ${kw(v.gridImport)}` : v.gridExporting ? `Grid exporting ${kw(v.gridExport)}` : v.gridAvailable ? "Grid balanced" : "Grid unavailable";
    const batteryText = Number.isFinite(v.batterySoc) ? `Battery ${pct(v.batterySoc)}` : "Battery unavailable";
    caption.innerHTML = `<span class="kems-panel-state-dot"></span><b>Live Data mode</b><span>·</span><span>${gridText}</span><span>·</span><span>${batteryText}</span>`;
  }
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    render(await response.json());
  } catch {
    ensurePanel();
  } finally {
    busy = false;
  }
}

const observer = new MutationObserver(() => {
  if (latest) render(latest);
  else ensurePanel();
});
if (app) observer.observe(app, { childList: true });
refresh();
setInterval(() => document.visibilityState === "visible" && refresh(), 8000);
