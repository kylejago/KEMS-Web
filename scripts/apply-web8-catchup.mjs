import fs from "node:fs";

const OLD_VERSION = "0.8.0-alpha8-web.7";
const NEW_VERSION = "0.8.0-alpha8-web.8";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceRequired(file, from, to) {
  const source = read(file);
  if (!source.includes(from)) {
    throw new Error(`${file}: required source fragment not found: ${from.slice(0, 120)}`);
  }
  write(file, source.replace(from, to));
}

function replaceRegexRequired(file, pattern, replacement) {
  const source = read(file);
  if (!pattern.test(source)) {
    throw new Error(`${file}: required pattern not found: ${pattern}`);
  }
  write(file, source.replace(pattern, replacement));
}

function replaceAllIfPresent(file, from, to) {
  const source = read(file);
  if (source.includes(from)) write(file, source.replaceAll(from, to));
}

function appendOnce(file, marker, content) {
  const source = read(file);
  if (!source.includes(marker)) write(file, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

const versionFiles = [
  "config/project.json",
  "package.json",
  "public/kems.html",
  "scripts/alpha8-consolidation-test.mjs",
  "scripts/ev-policy-web-test.mjs",
  "scripts/kems-alpha7-agile-web-test.mjs",
  "scripts/product-identity-test.mjs",
  "scripts/web19-demo-login-brand-test.mjs",
  "scripts/web20-agile-primary-test.mjs",
  "scripts/web21-property-ui-test.mjs",
  "scripts/web31-mobile-pwa-test.mjs",
  "scripts/web32-pwa-install-test.mjs",
  "scripts/web33-cloudflare-manifest-test.mjs",
  "scripts/web4-unified-energy-bill-test.mjs",
  "scripts/web6-kems-runtime-test.mjs",
  "scripts/web7-flow-presentation-test.mjs",
];
for (const file of versionFiles) replaceAllIfPresent(file, OLD_VERSION, NEW_VERSION);

replaceRequired(
  "package.json",
  "node --check scripts/web7-flow-presentation-test.mjs && node --check image/kems-setup-status.mjs",
  "node --check scripts/web7-flow-presentation-test.mjs && node --check scripts/web8-ha-parity-test.mjs && node --check image/kems-setup-status.mjs",
);
replaceRequired(
  "package.json",
  "node scripts/web7-flow-presentation-test.mjs && node scripts/pi-deployment-test.mjs",
  "node scripts/web7-flow-presentation-test.mjs && node scripts/web8-ha-parity-test.mjs && node scripts/pi-deployment-test.mjs",
);

replaceRequired(
  "config/project.json",
  "KEMS Web/PWA flow presentation · canonical /kems.html route · reconciled Grid/Solar/Battery slot ledger · live solar Today accounting · controlled planning refresh · no Home Assistant control writes",
  "KEMS Web/PWA HA-parity catch-up · full-day canonical Agile flow ledger · rebased SOC · truthful runtime gaps · delayed public Agile evidence · no Home Assistant control writes",
);
replaceRequired(
  "config/project.json",
  '    "The KEMS slot table renders canonical Home Assistant flow fields for Grid, Solar and Battery rather than recalculating the optimiser plan in the browser.",',
  '    "The KEMS slot table renders canonical Home Assistant flow fields for Grid, Solar and Battery rather than recalculating the optimiser plan in the browser.",\n    "Canonical compact flow tokens are expanded only by exact route token, so mixed routes such as HOME/EXPO and HOME/BATT display as HOME/EXPORT and HOME/BATTERY without corrupting EXPORT.",\n    "Historical settled/replayed slots with only the retained future-slot placeholder display NO DATA rather than false IDLE zero-flow evidence; genuine recorded idle and future planned slots remain distinct.",\n    "The Pi KEMS view presents Today and Tomorrow as full-day 00:00–23:30 flow tables using canonical rebased estimated SOC.",',
);
replaceRequired(
  "config/project.json",
  '    "Delayed public product evidence is recovered only from historical KEMS Recorder states that are already at least seven days old and is cached as sanitised daily totals.",',
  '    "Delayed public product evidence is recovered only from historical KEMS Recorder states that are already at least seven days old and is cached as sanitised daily totals plus allow-listed half-hour KEMS routing presentation evidence.",',
);

replaceRequired(
  "public/agile-page.js",
  'const app = document.querySelector("#agile-app");',
  'import { displayFlowAction, isHistoricalRuntimeGap } from "./flow-presentation-model.js?v=build3";\n\nconst app = document.querySelector("#agile-app");',
);
replaceRegexRequired(
  "public/agile-page.js",
  /function displayFlowAction\(action, kind\) \{[\s\S]*?\n\}\nfunction fallbackRoutes/,
  "function fallbackRoutes",
);
replaceRegexRequired(
  "public/agile-page.js",
  /function flowCell\(slot, prefix\) \{[\s\S]*?\n\}\nfunction slotRows/,
  `function flowCell(slot, prefix) {
  if (isHistoricalRuntimeGap(slot)) {
    return '<span title="No retained KEMS sample"><b>NO DATA</b> · —</span>';
  }
  const action = flowAction(slot, prefix);
  const value = flowValue(slot, prefix);
  const scope = String(slot[FLOW_SCOPE_FIELD] || "full slot");
  const scopeText = scope === "remaining slot" ? " <small>remaining</small>" : "";
  const basis = escapeHtml(slot[FLOW_BASIS_FIELD] || "legacy KEMS slot fields");
  return \`<span title="\${basis}"><b>\${escapeHtml(action)}</b> · \${fmt(value, "kWh", 2)}\${scopeText}</span>\`;
}
function slotRows`,
);
replaceRegexRequired(
  "public/agile-page.js",
  /function slotTable\(title, slots, start, end, emptyText\) \{[\s\S]*?\n\}\nfunction slotPlan\(day, slots\) \{[\s\S]*?\n\}\nfunction tomorrowSummary/,
  `function slotTable(title, slots, start, end, emptyText) {
  const rows = slotRows(slots, start, end);
  return \`<section class="agile-card agile-slot-block"><h3>\${escapeHtml(title)}</h3>\${rows.length ? \`<div class="agile-table-wrap"><table class="agile-table agile-slot-table agile-flow-table"><thead><tr><th>Time</th><th>Price</th><th>Est. SOC</th><th>Grid</th><th>Solar</th><th>Battery</th></tr></thead><tbody>\${rows.map((slot) => {
    const soc = isHistoricalRuntimeGap(slot)
      ? "—"
      : fmt(slot[FLOW_SOC_FIELD] ?? slot.ending_soc_percent, "%", 1);
    return \`<tr><td>\${escapeHtml(slot.label || "—")}</td><td>\${fmt(slot.rate_pence, "p/kWh", 2)}</td><td>\${soc}</td><td>\${flowCell(slot, "grid")}</td><td>\${flowCell(slot, "solar")}</td><td>\${flowCell(slot, "battery")}</td></tr>\`;
  }).join("")}</tbody></table></div>\` : \`<div class="empty">\${escapeHtml(emptyText)}</div>\`}</section>\`;
}
function slotPlan(day, slots) {
  const prefix = day === "Today" ? "Today" : "Tomorrow";
  return \`<div class="agile-slot-grid agile-slot-grid-full">\${slotTable(\`\${prefix} — 00:00 to 23:30\`, slots, 0, 48, \`\${prefix}'s plan is not available yet.\`)}</div>\`;
}
function tomorrowSummary`,
);
appendOnce(
  "public/agile.css",
  ".agile-slot-grid-full",
  `.agile-slot-grid-full { grid-template-columns: minmax(0, 1fr); }
.agile-slot-grid-full .agile-slot-block { grid-column: 1 / -1; }
.agile-flow-table th,
.agile-flow-table td { white-space: nowrap; }
.agile-flow-table small { opacity: .72; margin-left: .25rem; }`,
);

for (const file of ["public/kems-page.js", "public/service-worker.js", "scripts/web7-flow-presentation-test.mjs"]) {
  replaceAllIfPresent(file, "build2", "build3");
}
replaceRequired(
  "public/service-worker.js",
  '  "/agile-page.js?v=build3",',
  '  "/agile-page.js?v=build3",\n  "/flow-presentation-model.js?v=build3",',
);

replaceRequired(
  "gateway.mjs",
  'import { fileURLToPath } from "node:url";',
  'import { fileURLToPath } from "node:url";\n\nimport { displayFlowAction, isHistoricalRuntimeGap } from "./public/flow-presentation-model.js";',
);
replaceRequired(
  "gateway.mjs",
  'const PUBLIC_EVIDENCE_VERSION = 3;',
  'const PUBLIC_EVIDENCE_VERSION = 4;',
);
replaceRequired(
  "gateway.mjs",
  '  "sensor.kems_agile_smart_export_plan",',
  '  "sensor.kems_agile_smart_export_plan",\n  "sensor.kems_agile_slots",',
);
replaceRequired(
  "gateway.mjs",
  'function scenarioByKey(state, dateKey, keys) {',
  `function nullableRound(value, digits = 3) {
  if (value === null || value === undefined || value === "") return null;
  return round(value, digits);
}

function sanitisePublicAgileSlots(state, dateKey) {
  const rows = state?.attributes?.today_slots;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((slot) => String(slot?.local_from || "").slice(0, 10) === dateKey)
    .slice(0, 48)
    .map((slot) => {
      const noData = isHistoricalRuntimeGap(slot);
      return {
        time: String(slot?.label || "").slice(0, 5),
        pricePence: nullableRound(slot?.rate_pence, 2),
        estimatedSocPercent: noData
          ? null
          : nullableRound(slot?.flow_estimated_soc_percent ?? slot?.ending_soc_percent, 1),
        gridAction: noData ? "NO DATA" : displayFlowAction(slot?.flow_grid_action, "grid"),
        gridKwh: noData ? null : nullableRound(slot?.flow_grid_kwh, 3),
        solarAction: noData ? "NO DATA" : displayFlowAction(slot?.flow_solar_action, "solar"),
        solarKwh: noData ? null : nullableRound(slot?.flow_solar_kwh, 3),
        batteryAction: noData ? "NO DATA" : displayFlowAction(slot?.flow_battery_action, "battery"),
        batteryKwh: noData ? null : nullableRound(slot?.flow_battery_kwh, 3),
        noData,
      };
    })
    .filter((slot) => /^\\d{2}:\\d{2}$/.test(slot.time));
}

function scenarioByKey(state, dateKey, keys) {`,
);
replaceRequired(
  "gateway.mjs",
  '  const evKwh = evEnergyFromHistory(history, dateKey);',
  `  const slotState = matchingLatestState(history, "sensor.kems_agile_slots", (attrs) =>
    Array.isArray(attrs?.today_slots)
      && attrs.today_slots.some((slot) => String(slot?.local_from || "").slice(0, 10) === dateKey));
  const agileSlots = sanitisePublicAgileSlots(slotState, dateKey);
  const evKwh = evEnergyFromHistory(history, dateKey);`,
);
replaceRequired(
  "gateway.mjs",
  '    legacyKems,\n    capturedAt:',
  '    legacyKems,\n    agileSlots,\n    capturedAt:',
);
replaceRequired(
  "gateway.mjs",
  '    if (!cache.days || typeof cache.days !== "object") cache.days = {};\n    cache.version = PUBLIC_EVIDENCE_VERSION;',
  '    if (!cache.days || typeof cache.days !== "object") cache.days = {};\n    if (Number(cache.version) !== PUBLIC_EVIDENCE_VERSION) {\n      cache.days = {};\n      cache.economics = null;\n    }\n    cache.version = PUBLIC_EVIDENCE_VERSION;',
);
replaceRequired(
  "gateway.mjs",
  '    if (recovered.strategyLabel) day.strategyLabel = recovered.strategyLabel;\n    return day;',
  '    if (recovered.strategyLabel) day.strategyLabel = recovered.strategyLabel;\n    if (Array.isArray(recovered.agileSlots) && recovered.agileSlots.length) day.agileSlots = recovered.agileSlots;\n    return day;',
);
replaceRequired(
  "gateway.mjs",
  '    schema: 2,\n    property: "Demo property",',
  '    schema: 3,\n    property: "Demo property",',
);
replaceRequired(
  "gateway.mjs",
  '    privacy: "Sanitised daily totals only. Aggregate EV energy is included after the privacy delay; no live power, EV state/SOC, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints are published.",',
  '    privacy: "Sanitised daily totals and allow-listed half-hour KEMS routing evidence only after the privacy delay. Aggregate EV energy may be included; no live power, EV state/SOC, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints are published.",',
);
replaceRequired(
  "gateway.mjs",
  '      ev: "aggregate daily EV energy only, delayed by at least seven days"',
  '      ev: "aggregate daily EV energy only, delayed by at least seven days",\n      agilePlan: "allow-listed half-hour KEMS route, energy, price and estimated SOC presentation only, delayed by at least seven days"',
);
replaceAllIfPresent("gateway.mjs", "KEMS Web.4 gateway", "KEMS Web.8 gateway");

replaceRequired(
  "scripts/build-public-demo.mjs",
  "export const PUBLIC_DEMO_SCHEMA = 2;",
  "export const PUBLIC_DEMO_SCHEMA = 3;",
);
replaceRequired(
  "scripts/build-public-demo.mjs",
  '  "strategyLabel",',
  '  "strategyLabel",\n  "agileSlots",',
);
replaceRequired(
  "scripts/build-public-demo.mjs",
  'function dateKey(value) {',
  `function sanitiseAgileSlots(source) {
  if (!Array.isArray(source)) return [];
  return source.slice(0, 48).map((slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return null;
    const noData = slot.noData === true;
    const safe = {
      time: String(slot.time || "").slice(0, 5),
      pricePence: slot.pricePence === null ? null : round(slot.pricePence, 2),
      estimatedSocPercent: noData || slot.estimatedSocPercent === null ? null : round(slot.estimatedSocPercent, 1),
      gridAction: String(slot.gridAction || (noData ? "NO DATA" : "IDLE")).slice(0, 40),
      gridKwh: noData || slot.gridKwh === null ? null : round(slot.gridKwh, 3),
      solarAction: String(slot.solarAction || (noData ? "NO DATA" : "IDLE")).slice(0, 40),
      solarKwh: noData || slot.solarKwh === null ? null : round(slot.solarKwh, 3),
      batteryAction: String(slot.batteryAction || (noData ? "NO DATA" : "IDLE")).slice(0, 40),
      batteryKwh: noData || slot.batteryKwh === null ? null : round(slot.batteryKwh, 3),
      noData,
    };
    return /^\\d{2}:\\d{2}$/.test(safe.time) ? safe : null;
  }).filter(Boolean);
}

function dateKey(value) {`,
);
replaceRequired(
  "scripts/build-public-demo.mjs",
  '    if (strategyLabel) safe.strategyLabel = String(strategyLabel).slice(0, 80);\n    days.push(safe);',
  '    if (strategyLabel) safe.strategyLabel = String(strategyLabel).slice(0, 80);\n    const agileSlots = sanitiseAgileSlots(candidate.agileSlots);\n    if (agileSlots.length) safe.agileSlots = agileSlots;\n    days.push(safe);',
);
replaceRequired(
  "scripts/build-public-demo.mjs",
  '    privacy: "Sanitised daily totals only. No live power, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints.",',
  '    privacy: "Sanitised daily totals and allow-listed half-hour KEMS routing evidence only after the privacy delay. No live power, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints.",',
);

replaceRequired(
  "public-site/demo.js",
  "if (!input || ![1, 2].includes(input.schema))",
  "if (!input || ![1, 2, 3].includes(input.schema))",
);
replaceRequired(
  "public-site/demo.js",
  "function normaliseDay(day) {",
  `function normaliseAgileSlots(source) {
  if (!Array.isArray(source)) return [];
  return source.slice(0, 48).map((slot) => ({
    time: String(slot?.time || "").slice(0, 5),
    pricePence: number(slot?.pricePence),
    estimatedSocPercent: number(slot?.estimatedSocPercent),
    gridAction: String(slot?.gridAction || (slot?.noData ? "NO DATA" : "IDLE")),
    gridKwh: number(slot?.gridKwh),
    solarAction: String(slot?.solarAction || (slot?.noData ? "NO DATA" : "IDLE")),
    solarKwh: number(slot?.solarKwh),
    batteryAction: String(slot?.batteryAction || (slot?.noData ? "NO DATA" : "IDLE")),
    batteryKwh: number(slot?.batteryKwh),
    noData: slot?.noData === true,
  })).filter((slot) => /^\\d{2}:\\d{2}$/.test(slot.time));
}

function normaliseDay(day) {`,
);
replaceRequired(
  "public-site/demo.js",
  "    strategyLabel\n  };",
  "    strategyLabel,\n    agileSlots: normaliseAgileSlots(day?.agileSlots)\n  };",
);
replaceRequired(
  "public-site/demo.js",
  "    schema: 2,\n    products: ['actual', 'kems'],",
  "    schema: 3,\n    products: ['actual', 'kems'],",
);
replaceRequired(
  "public-site/demo.js",
  "function routing(metrics) {",
  `function delayedFlowCell(action, value, noData) {
  if (noData) return '<strong>NO DATA</strong> · —';
  const amount = number(value);
  return \`<strong>\${escapeHtml(action || "IDLE")}</strong> · \${amount === null ? "—" : \`\${amount.toFixed(2)} kWh\`}\`;
}

function delayedAgilePlan(day) {
  if (!day) return '';
  const slots = Array.isArray(day.agileSlots) ? day.agileSlots : [];
  if (!slots.length) {
    return '<section class="routing-section"><div class="section-title"><div><h2>Delayed Agile Plan</h2><p>Half-hour routing evidence is published only when a complete privacy-delayed KEMS slot snapshot was retained for this day.</p></div></div><div class="empty-state"><strong>Building delayed slot evidence.</strong><span>No current household power is exposed.</span></div></section>';
  }
  const rows = slots.map((slot) => {
    const noData = slot.noData === true;
    const soc = noData || number(slot.estimatedSocPercent) === null ? '—' : \`\${number(slot.estimatedSocPercent).toFixed(1)}%\`;
    const price = number(slot.pricePence) === null ? '—' : \`\${number(slot.pricePence).toFixed(2)}p\`;
    return \`<tr><td>\${escapeHtml(slot.time)}</td><td>\${price}</td><td>\${soc}</td><td>\${delayedFlowCell(slot.gridAction, slot.gridKwh, noData)}</td><td>\${delayedFlowCell(slot.solarAction, slot.solarKwh, noData)}</td><td>\${delayedFlowCell(slot.batteryAction, slot.batteryKwh, noData)}</td></tr>\`;
  }).join('');
  return \`<section class="routing-section"><div class="section-title"><div><h2>Delayed Agile Plan</h2><p>Sanitised KEMS half-hour routing evidence for \${escapeHtml(dateLabel(day.date))}. Every row is at least \${escapeHtml(String(payload.delayDays))} days old; NO DATA means no retained KEMS runtime sample, not deliberate zero flow.</p></div></div><div class="demo-table-wrap"><table class="demo-table agile-plan-table"><thead><tr><th>Time</th><th>Price</th><th>Est. SOC</th><th>Grid</th><th>Solar</th><th>Battery</th></tr></thead><tbody>\${rows}</tbody></table></div></section>\`;
}

function routing(metrics) {`,
);
replaceRequired(
  "public-site/demo.js",
  "    + panel(metrics, selected) + trendChart(chartDays, mode) + routing(metrics) + billBreakdown(metrics) + privacyNote();",
  "    + delayedAgilePlan(selected.days.length === 1 ? selected.days[0] : null) + panel(metrics, selected) + trendChart(chartDays, mode) + routing(metrics) + billBreakdown(metrics) + privacyNote();",
);
appendOnce(
  "public-site/demo.css",
  ".agile-plan-table",
  `.agile-plan-table th,
.agile-plan-table td { white-space: nowrap; }
.agile-plan-table strong { font-weight: 800; }
.agile-plan-table td:first-child { font-variant-numeric: tabular-nums; }`,
);

for (const file of ["public-site/demo.html", "public-site/demo-compare.html", "public-site/privacy.html"]) {
  replaceAllIfPresent(file, "site1", "site2");
}
replaceRequired(
  "public-site/privacy.html",
  "The public demo receives only a deliberately small, sanitised set of daily totals that are old enough to satisfy the privacy delay.",
  "The public demo receives only a deliberately small, sanitised set of delayed daily totals and allow-listed half-hour KEMS routing evidence that are old enough to satisfy the privacy delay.",
);
replaceRequired(
  "public-site/privacy.html",
  "The demo reads sanitised daily totals delayed by at least seven days. Precise live power, entity IDs and device identifiers are excluded.",
  "The demo reads sanitised daily totals and half-hour KEMS routing evidence delayed by at least seven days. Precise live power, entity IDs and device identifiers are excluded.",
);

replaceRequired(
  "docs/PUBLIC-DEMO.md",
  "It allow-lists daily aggregate energy/cost fields only. It does not return:",
  "It allow-lists daily aggregate energy/cost fields plus sanitised half-hour KEMS routing presentation fields only after the same minimum delay. Half-hour rows are limited to time, tariff price, estimated SOC, Grid/Solar/Battery route labels and their slot kWh. It does not return:",
);
replaceRequired(
  "docs/PUBLIC-DEMO.md",
  "- live or sub-daily power;",
  "- live power or any sub-seven-day KEMS slot evidence;",
);
replaceRequired(
  "docs/PUBLIC-DEMO.md",
  "The current ledger already retains measured daily totals plus the existing KEMS simulation.",
  "The current ledger retains measured daily totals, while privacy-delayed Recorder evidence supplies the canonical KEMS bill contract and, when retained, the sanitised half-hour Agile flow presentation. Historical runtime gaps remain explicit NO DATA rather than being rewritten as zero activity.\n\nThe current ledger already retains measured daily totals plus the existing KEMS simulation.",
);

const changelog = read("CHANGELOG.md");
if (!changelog.includes("## 0.8.0-alpha8-web.8")) {
  const entry = `## 0.8.0-alpha8-web.8\n\n- Catch Pi Web up with the HA Alpha8.48–Alpha8.54 presentation contract: one full-day Agile table, canonical rebased estimated SOC, exact mixed-route labels, and truthful NO DATA runtime gaps.\n- Keep Today export accounting on canonical elapsed-solar plus completed-settled-battery evidence.\n- Extend the public demo with privacy-delayed, allow-listed half-hour KEMS routing evidence while keeping live power, device/entity identifiers, credentials and control endpoints private.\n- Share exact route-label and runtime-gap presentation rules between Pi Web and the delayed public feed.\n- Read-only presentation/data-publication release; no Home Assistant service calls or hardware control writes.\n\n`;
  write("CHANGELOG.md", changelog.replace(/^#([^\n]*)\n+/, (match) => `${match}${entry}`));
}

console.log(`Applied ${NEW_VERSION} Pi/Public HA-parity catch-up.`);
