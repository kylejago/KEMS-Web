import { deriveEvPolicyView } from "./ev-policy-model.js?v=build1";

const EV_ALLOWED = "binary_sensor.kems_ev_charging_allowed_by_control";
const EV_POLICY = "select.kems_ev_charging_policy";
let latest = null;
let busy = false;

function entity(id) {
  return latest?.entities?.find((item) => item.entityId === id) || null;
}

function isOn(value) {
  return ["on", "true", "yes", "active", "charging", "connected"].includes(
    String(value || "").toLowerCase(),
  );
}

function allowedDecision() {
  const item = entity(EV_ALLOWED);
  if (!item?.available) return null;
  return isOn(item.state);
}

function policyLabel() {
  const item = entity(EV_POLICY);
  return item?.available ? String(item.state) : "EV policy unavailable";
}

function currentMode() {
  return localStorage.getItem("kems-agile-view-mode") || "simulated";
}

function ensurePolicyNote(panel, view) {
  const section = panel?.closest(".web21-section");
  if (!section) return;
  let note = section.querySelector("[data-ev-policy-note]");
  if (!note) {
    note = document.createElement("div");
    note.dataset.evPolicyNote = "true";
    note.style.cssText = "margin:.75rem auto 0;max-width:760px;padding:.7rem .85rem;border:1px solid rgba(135,191,209,.18);border-radius:12px;font-size:.78rem;line-height:1.45;background:rgba(255,255,255,.02)";
    section.append(note);
  }
  const decision = view.unavailable
    ? "Decision unavailable"
    : view.blocked
      ? "BLOCKED"
      : view.connected
        ? "ALLOWED"
        : "No EV connected";
  note.innerHTML = `<b>EV shadow policy: ${decision}</b> · ${view.policy}. KEMS Web is display-only and does not issue an Ohme control write.`;
}

function apply() {
  const panel = document.querySelector("#web29-agile-panel .kems-web-panel");
  if (!panel || !latest) return;
  const mode = currentMode();
  if (mode === "live") return;

  const metrics = latest.metrics || {};
  const view = deriveEvPolicyView({
    mode,
    connected: Boolean(metrics.evConnected),
    charging: Boolean(metrics.evCharging),
    power: metrics.evPower,
    allowed: allowedDecision(),
    policy: policyLabel(),
  });

  const node = panel.querySelector(".kems-web-node.ev");
  const link = panel.querySelector(".ev-link");
  const icon = node?.querySelector(".kems-web-icon");
  const strong = node?.querySelector("strong");
  const small = node?.querySelector("small");
  if (!node || !link || !strong || !small) return;

  node.dataset.evPolicyState = view.unavailable
    ? "unavailable"
    : view.blocked
      ? "blocked"
      : view.charging
        ? "charging"
        : view.connected
          ? "allowed"
          : "idle";
  strong.textContent = `${view.power.toFixed(2)} kW`;
  small.textContent = view.detail;

  node.style.borderColor = view.blocked
    ? "rgba(255,66,86,.78)"
    : view.unavailable
      ? "rgba(244,212,122,.62)"
      : "";
  if (icon) {
    icon.style.color = view.blocked
      ? "#ff4256"
      : view.unavailable
        ? "#f4d47a"
        : "";
  }

  if (view.blocked || view.unavailable || !view.charging) {
    link.classList.remove("active");
  }
  link.style.setProperty(
    "--flow-colour",
    view.blocked ? "#ff4256" : view.unavailable ? "#f4d47a" : "#ff22cb",
  );
  link.style.opacity = view.blocked || view.unavailable ? ".6" : "";

  ensurePolicyNote(panel, view);

  const historyNote = document.querySelector(
    "#web21-agile-history p.web21-muted:last-of-type",
  );
  if (historyNote) {
    historyNote.textContent =
      "Solar, battery, home and SoC are Full KEMS Agile digital-twin series. The EV history line remains retained real EV demand for comparison; Alpha8.5 applies KEMS Allow/Block to the current simulated panel and does not fabricate shifted overnight EV energy.";
  }
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    latest = await response.json();
    apply();
  } catch {
    // Existing Agile page owns connection-error presentation.
  } finally {
    busy = false;
  }
}

const observer = new MutationObserver(() => queueMicrotask(apply));
const app = document.querySelector("#agile-app");
if (app) observer.observe(app, { childList: true, subtree: true });
document.addEventListener("click", (event) => {
  if (event.target?.closest?.("[data-agile-mode]")) queueMicrotask(apply);
});
refresh();
setInterval(() => document.visibilityState === "visible" && refresh(), 8000);
