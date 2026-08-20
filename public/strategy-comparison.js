const app = document.querySelector("#compare-app");
let latest = null;
let loading = false;

function number(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(value)
    : "—";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function entity(id) {
  return latest?.entities?.find((item) => item.entityId === id) || null;
}

function attrs(id) {
  return entity(id)?.attributes || {};
}

function netCost(entry = {}) {
  const importCost = number(entry.import_cost_pence);
  const exportIncome = number(entry.export_income_pence) || 0;
  return Number.isFinite(importCost) ? (importCost - exportIncome) / 100 : null;
}

function standardScenario(periodKey, scenarioKey) {
  const periods = attrs("sensor.kems_scenario_comparison_today").periods || {};
  const scenarios = periods?.[periodKey]?.scenarios || [];
  return Array.isArray(scenarios) ? scenarios.find((row) => row?.key === scenarioKey) || {} : {};
}

function agileScenario(periodKey) {
  const periods = attrs("sensor.kems_agile_smart_export_plan").periods || {};
  return periods?.[periodKey]?.agile_smart_export || {};
}

function livePeriod(entityId) {
  const item = entity(entityId);
  if (!item) return null;
  const a = item.attributes || {};
  const importCost = number(a.import_cost_pence);
  const exportIncome = number(a.export_income_pence) || 0;
  return Number.isFinite(importCost) ? (importCost - exportIncome) / 100 : null;
}

function periodCosts(key) {
  return {
    batterySolar: netCost(standardScenario(key, "solar_battery")),
    fullKems: netCost(standardScenario(key, "kems_forecast")),
    agile: netCost(agileScenario(key))
  };
}

function leader(costs) {
  const candidates = [
    [costs.live, "Live Data"],
    [costs.batterySolar, "Battery & Solar"],
    [costs.fullKems, "Full KEMS"],
    [costs.agile, "Full KEMS Agile"]
  ].filter(([value]) => Number.isFinite(value));
  candidates.sort((a, b) => a[0] - b[0]);
  return candidates[0] || [null, "Building evidence"];
}

function modelLeader(costs) {
  return leader({ ...costs, live: null });
}

function evidenceSummary() {
  const today = periodCosts("today");
  today.live = livePeriod("sensor.kems_today_energy_summary");
  const seven = periodCosts("7_days");
  const thirty = periodCosts("30_days");
  const todayWinner = leader(today);
  const sevenWinner = modelLeader(seven);
  const thirtyWinner = modelLeader(thirty);
  const votes = [todayWinner[1], sevenWinner[1], thirtyWinner[1]].filter((name) => name !== "Building evidence");
  const counts = new Map();
  votes.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const recommendation = ranked.length && ranked[0][1] >= 2 ? ranked[0][0] : "Mixed evidence";
  return { today, seven, thirty, todayWinner, sevenWinner, thirtyWinner, recommendation };
}

function tableRow(label, costs, winnerName) {
  const live = Number.isFinite(costs.live) ? money(costs.live) : "—";
  const b = money(costs.batterySolar);
  const f = money(costs.fullKems);
  const a = money(costs.agile);
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(live)}</td><td>${escapeHtml(b)}</td><td>${escapeHtml(f)}</td><td>${escapeHtml(a)}</td><td><strong>${escapeHtml(winnerName)}</strong></td></tr>`;
}

function renderBlock() {
  if (!latest?.connected || !app) return;
  const existing = document.querySelector("#strategy-overview-web20");
  const summary = evidenceSummary();
  const liveSaving = Number.isFinite(summary.today.live) && Number.isFinite(summary.today.agile)
    ? summary.today.live - summary.today.agile
    : null;
  const html = `<section id="strategy-overview-web20" class="panel compare-why-panel">
    <header class="section-heading"><div><h2>Overall strategy comparison</h2><p>Current result plus retained historical evidence across all four user-facing KEMS products.</p></div></header>
    <div class="panel-body">
      <section class="compare-hero ${summary.recommendation === "Full KEMS Agile" ? "good" : "neutral"}">
        <div class="compare-hero-card simulated"><span>CURRENT RECOMMENDATION</span><strong>${escapeHtml(summary.recommendation)}</strong><small>A recommendation is made only when the same strategy leads at least two of Today, 7-day and 30-day evidence horizons.</small></div>
        <div class="compare-hero-card actual"><span>TODAY LEADER</span><strong>${escapeHtml(summary.todayWinner[1])}</strong><small>${money(summary.todayWinner[0])} on import cost − export income.</small></div>
        <div class="compare-hero-result ${Number.isFinite(liveSaving) && liveSaving > 0 ? "good" : "neutral"}"><span>FULL KEMS AGILE VS LIVE TODAY</span><strong>${Number.isFinite(liveSaving) ? money(liveSaving) : "Building evidence"}</strong><small>${Number.isFinite(liveSaving) ? (liveSaving >= 0 ? "Positive means Agile is cheaper than observed Live Data today." : "Negative means Live Data is currently cheaper today.") : "Waiting for comparable observed and Agile cost evidence."}</small></div>
      </section>
      <div class="table-scroll"><table class="comparison-table compare-master-table"><thead><tr><th>Evidence horizon</th><th>Live Data</th><th>Battery &amp; Solar</th><th>Full KEMS</th><th>Full KEMS Agile</th><th>Leader</th></tr></thead><tbody>
        ${tableRow("Today", summary.today, summary.todayWinner[1])}
        ${tableRow("Last 7 days", summary.seven, summary.sevenWinner[1])}
        ${tableRow("Last 30 days", summary.thirty, summary.thirtyWinner[1])}
      </tbody></table></div>
      <div class="data-note"><strong>How the recommendation works:</strong> KEMS does not force Agile to win. The current recommendation is the strategy that leads at least two of the three available evidence horizons. Live Data is included for Today; retained what-if replay supplies like-for-like 7-day and 30-day model evidence for Battery &amp; Solar, Full KEMS and Full KEMS Agile.</div>
    </div>
  </section>`;
  if (existing) existing.outerHTML = html;
  else {
    const heading = app.querySelector(".page-heading");
    heading?.insertAdjacentHTML("afterend", html);
  }
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) return;
    latest = await response.json();
    renderBlock();
  } finally {
    loading = false;
  }
}

const observer = new MutationObserver(() => {
  if (latest?.connected) renderBlock();
});
observer.observe(app, { childList: true, subtree: false });

refresh();
setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, 60_000);
