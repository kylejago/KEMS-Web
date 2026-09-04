import { deriveControlSafety } from "./control-safety-model.js?v=build1";

const root = document.querySelector("#settings-status");
let lastSnapshot = null;
let loading = false;

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function row(label, value) {
  return `<div class="status-row"><span>${esc(label)}</span><strong>${esc(value ?? "—")}</strong></div>`;
}

function render() {
  if (!root || !lastSnapshot || document.querySelector("#kems-control-safety-card")) return;
  const safety = deriveControlSafety(lastSnapshot);
  const detail = safety.blockedReason
    || (safety.commandsPermitted
      ? "KEMS currently reports that backend commands are permitted. This website remains display-only and has no Home Assistant service-write path."
      : "KEMS has not permitted backend commands. The website remains display-only.");

  const section = document.createElement("section");
  section.id = "kems-control-safety-card";
  section.className = "web21-section";
  section.innerHTML = `
    <div class="web21-kicker">KEMS safety boundary</div>
    <h2>${esc(safety.status)}</h2>
    <div class="status-list">
      ${row("Commissioning", safety.commissioning || "Unavailable")}
      ${row("Maximum stage", safety.maximumStage || "Not published")}
      ${row("System commissioned", yesNo(safety.commissioned))}
      ${row("Real backend available", yesNo(safety.realBackend))}
      ${row("KEMS commands permitted", yesNo(safety.commandsPermitted))}
      ${row("Control enabled", yesNo(safety.controlEnabled))}
      ${row("Current plan safe", yesNo(safety.planSafe))}
      ${row("Preflight", safety.preflight || "Unavailable")}
      ${row("Website control", "None — display only")}
    </div>
    <p class="web21-muted">${esc(detail)}</p>
    ${safety.phase ? `<p class="web21-muted">Development phase: ${esc(safety.phase)}. Phase is informational only and is not used to infer whether hardware writes are allowed.</p>` : ""}
  `;
  root.prepend(section);
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    lastSnapshot = await response.json();
    document.querySelector("#kems-control-safety-card")?.remove();
    render();
  } catch {
    // Settings remains usable if KEMS live telemetry is temporarily unavailable.
  } finally {
    loading = false;
  }
}

if (root) {
  const observer = new MutationObserver(() => render());
  observer.observe(root, { childList: true });
  refresh();
  window.setInterval(() => {
    if (!document.hidden) refresh();
  }, 15_000);
}
