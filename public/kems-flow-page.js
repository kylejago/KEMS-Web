const SLOT_ENTITY = "sensor.kems_agile_slots";

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function fmt(value, unit = "", digits = 2) {
  const parsed = number(value);
  if (parsed === null) return "—";
  const text = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(parsed);
  return `${text}${unit ? ` ${unit}` : ""}`;
}

function entity(snapshot, entityId) {
  return snapshot?.entities?.find((item) => item.entityId === entityId) || null;
}

function displayAction(action, kind) {
  const raw = String(action || "IDLE").toUpperCase();
  if (raw === "EXPO") return "EXPORT";
  if (kind === "solar" && raw === "BATT") return "BATTERY";
  return raw;
}

function fallbackAction(primary, secondary, primaryLabel, secondaryLabel) {
  const first = (number(primary) || 0) > 0.0005;
  const second = (number(secondary) || 0) > 0.0005;
  if (first && second) return `${primaryLabel}/${secondaryLabel}`;
  if (first) return primaryLabel === "EXPO" ? "EXPORT" : primaryLabel;
  if (second) return secondaryLabel === "EXPO" ? "EXPORT" : secondaryLabel;
  return "IDLE";
}

function flowValue(slot, prefix) {
  const value = number(slot[`flow_${prefix}_kwh`]);
  if (value !== null) return value;
  if (prefix === "grid") {
    return (number(slot.grid_import_kwh) || 0) + (number(slot.grid_export_kwh) || 0);
  }
  if (prefix === "solar") {
    const generation = number(slot.solar_generation_kwh);
    if (generation !== null) return generation;
    return (number(slot.solar_to_battery_kwh) || 0) + (number(slot.solar_export_kwh) || 0);
  }
  return (number(slot.battery_to_home_kwh) || 0) + (number(slot.battery_export_kwh) || 0);
}

function flowAction(slot, prefix) {
  const canonical = slot[`flow_${prefix}_action`];
  if (canonical) return displayAction(canonical, prefix);
  if (prefix === "grid") {
    return fallbackAction(slot.grid_import_kwh, slot.grid_export_kwh, "IMPORT", "EXPO");
  }
  if (prefix === "solar") {
    return fallbackAction(slot.solar_to_battery_kwh, slot.solar_export_kwh, "BATT", "EXPO");
  }
  return fallbackAction(slot.battery_to_home_kwh, slot.battery_export_kwh, "HOME", "EXPO");
}

function flowCell(slot, prefix) {
  const action = flowAction(slot, prefix);
  const value = flowValue(slot, prefix);
  const scope = String(slot.flow_scope || "full slot");
  const scopeText = scope === "remaining slot" ? "<br><small>remaining</small>" : "";
  const basis = escapeHtml(slot.flow_basis || "legacy KEMS slot fields");
  return `<span title="${basis}"><b>${escapeHtml(action)}</b><br>${fmt(value, "kWh", 2)}${scopeText}</span>`;
}

function slotRow(slot) {
  const soc = slot.flow_estimated_soc_percent ?? slot.ending_soc_percent;
  return `<tr>
    <td>${escapeHtml(slot.label || "—")}</td>
    <td>${fmt(slot.rate_pence, "p/kWh", 2)}</td>
    <td>${fmt(soc, "%", 1)}</td>
    <td>${flowCell(slot, "grid")}</td>
    <td>${flowCell(slot, "solar")}</td>
    <td>${flowCell(slot, "battery")}</td>
  </tr>`;
}

function replaceSlotTable(block, rows) {
  const wrapper = block.querySelector(".agile-table-wrap");
  if (!wrapper || !rows.length) return;
  wrapper.innerHTML = `<table class="agile-table agile-slot-table agile-flow-table">
    <thead><tr><th>Time</th><th>Price</th><th>Est SOC</th><th>Grid</th><th>Solar</th><th>Battery</th></tr></thead>
    <tbody>${rows.map(slotRow).join("")}</tbody>
  </table>`;
}

function splitRows(slots, title) {
  if (title.includes("00:00 to 07:30")) return slots.slice(0, 16);
  if (title.includes("08:00 to 15:30")) return slots.slice(16, 32);
  if (title.includes("16:00 to 23:30")) return slots.slice(32, 48);
  return [];
}

function applySlotTables(slotsState) {
  const today = Array.isArray(slotsState.today_slots) ? slotsState.today_slots : [];
  const tomorrow = Array.isArray(slotsState.tomorrow_slots) ? slotsState.tomorrow_slots : [];
  for (const block of document.querySelectorAll(".agile-slot-block")) {
    const title = block.querySelector("h3")?.textContent || "";
    const source = title.startsWith("Today") ? today : title.startsWith("Tomorrow") ? tomorrow : [];
    replaceSlotTable(block, splitRows(source, title));
  }
}

function energyCard(label, value, detail) {
  return `<article class="agile-card" data-kems-flow-card="${escapeHtml(label)}"><small>${escapeHtml(label)}</small><strong>${fmt(value, "kWh", 2)}</strong><p>${escapeHtml(detail)}</p></article>`;
}

function applyEnergyToday(slotsState) {
  const today = slotsState.today_agile || {};
  const section = [...document.querySelectorAll(".agile-section")].find(
    (item) => item.querySelector("h2")?.textContent?.trim() === "Energy today",
  );
  const grid = section?.querySelector(".agile-grid");
  if (!grid) return;

  grid.querySelector('[data-kems-flow-card="Solar export"]')?.remove();
  const solarGenerationCard = [...grid.querySelectorAll("article.agile-card")].find(
    (card) => card.querySelector("small")?.textContent?.trim() === "Solar generation",
  );
  const holder = document.createElement("div");
  holder.innerHTML = energyCard(
    "Solar export",
    today.solar_export_kwh,
    "Replay through latest recorder sample",
  );
  const card = holder.firstElementChild;
  if (card) {
    if (solarGenerationCard?.nextSibling) grid.insertBefore(card, solarGenerationCard.nextSibling);
    else grid.appendChild(card);
  }

  const gridExportCard = [...grid.querySelectorAll("article.agile-card")].find(
    (item) => item.querySelector("small")?.textContent?.trim() === "Grid export",
  );
  if (gridExportCard && number(today.grid_export_kwh) !== null) {
    const strong = gridExportCard.querySelector("strong");
    const detail = gridExportCard.querySelector("p");
    if (strong) strong.textContent = fmt(today.grid_export_kwh, "kWh", 2);
    if (detail) detail.textContent = "Live solar + settled battery export";
  }
}

let syncing = false;
async function syncFlowPresentation() {
  if (syncing || document.hidden) return;
  syncing = true;
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) return;
    const snapshot = await response.json();
    const slotsEntity = entity(snapshot, SLOT_ENTITY);
    if (!slotsEntity?.available || !slotsEntity.attributes) return;
    applySlotTables(slotsEntity.attributes);
    applyEnergyToday(slotsEntity.attributes);
  } catch {
    // The underlying KEMS renderer owns connection/error presentation.
  } finally {
    syncing = false;
  }
}

await syncFlowPresentation();

const refreshButton = document.querySelector("#refresh-button");
refreshButton?.addEventListener("click", () => {
  window.setTimeout(syncFlowPresentation, 250);
});
window.setInterval(syncFlowPresentation, 30_000);
