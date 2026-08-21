const root = document.querySelector('#demo-root');
const statusPill = document.querySelector('#demo-status');
const refreshButton = document.querySelector('#refresh-button');
const view = document.body.dataset.demoView || 'agile';
const LIVE_DEMO_URL = 'https://demo-api.kems.uk/api/public-demo';
const PRODUCTS = [
  ['actual', 'Live Data'],
  ['batterySolar', 'Battery & Solar'],
  ['fullKems', 'Full KEMS'],
  ['fullKemsAgile', 'Full KEMS Agile']
];

let payload = null;
let mode = 'fullKemsAgile';
let period = view === 'agile' ? 'day' : 'week';

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function money(value) {
  const parsed = number(value);
  return parsed === null ? '—' : new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', maximumFractionDigits: 2
  }).format(parsed);
}

function energy(value) {
  const parsed = number(value);
  return parsed === null ? 'Unavailable' : `${parsed.toFixed(2)} kWh`;
}

function percent(value) {
  const parsed = number(value);
  return parsed === null ? 'Unavailable' : `${parsed.toFixed(1)}%`;
}

function dateLabel(value) {
  if (!value) return 'Unavailable';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

function latestAllowedDate(delayDays) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - delayDays);
  return date.toISOString().slice(0, 10);
}

function validate(input) {
  if (!input || input.schema !== 1) throw new Error('Unsupported demo data format.');
  if (!input.delayed || !Number.isInteger(input.delayDays) || input.delayDays < 7) {
    throw new Error('The public demo feed does not satisfy the seven-day privacy delay.');
  }
  const cutoff = latestAllowedDate(input.delayDays);
  if (input.dataThrough && input.dataThrough > cutoff) throw new Error('The public demo feed contains data that is too recent.');
  if (!Array.isArray(input.days)) throw new Error('The public demo feed has no day list.');
  for (const day of input.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day?.date || '')) || day.date > cutoff) {
      throw new Error('The public demo feed contains an invalid or too-recent day.');
    }
  }
  return input;
}

function aggregate(days) {
  const output = Object.fromEntries(PRODUCTS.map(([key]) => [key, {}]));
  for (const day of days) {
    for (const [key] of PRODUCTS) {
      for (const [metric, value] of Object.entries(day[key] || {})) {
        const parsed = number(value);
        if (parsed === null) continue;
        if (metric === 'endSocPercent') output[key][metric] = parsed;
        else output[key][metric] = (output[key][metric] || 0) + parsed;
      }
    }
  }
  return output;
}

function selectedPeriod() {
  const days = payload?.days || [];
  if (!days.length) return { days: [], label: 'No published evidence', complete: false };
  if (period === 'previous') return { days: days.slice(-2, -1), label: 'Previous delayed day', complete: days.length >= 2 };
  if (period === 'published') return { days, label: 'Published evidence', complete: true };
  const counts = { day: 1, week: 7, month: 30, year: 365 };
  const labels = { day: 'Latest delayed day', week: 'Last 7 published days', month: 'Last 30 published days', year: 'Last 365 published days' };
  const count = counts[period] || 1;
  return { days: days.slice(-count), label: labels[period] || 'Delayed evidence', complete: days.length >= count };
}

function setStatus(kind, text) {
  statusPill?.classList.remove('error', 'fallback');
  if (kind === 'error') statusPill?.classList.add('error');
  if (kind === 'fallback') statusPill?.classList.add('fallback');
  const label = statusPill?.querySelector('span');
  if (label) label.textContent = text;
}

function card(label, value, detail = '', tone = '') {
  return `<article class="demo-card ${tone}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}</article>`;
}

function toolbar(showMode = false) {
  const options = [
    ['day', 'Latest delayed day'], ['previous', 'Previous delayed day'], ['week', 'Last 7 days'],
    ['month', 'Last 30 days'], ['year', 'Year'], ['published', 'Published evidence']
  ].map(([value, label]) => `<option value="${value}"${period === value ? ' selected' : ''}>${label}</option>`).join('');
  return `<section class="demo-toolbar"><div class="toolbar-group"><span class="toolbar-label">Evidence window</span><select id="demo-period">${options}</select></div>${showMode ? `<div class="toolbar-group"><span class="toolbar-label">Panel view</span><div class="mode-toggle"><button type="button" data-mode="actual" class="${mode === 'actual' ? 'active' : ''}">Live</button><button type="button" data-mode="fullKemsAgile" class="${mode === 'fullKemsAgile' ? 'active' : ''}">Simulated</button></div></div>` : ''}</section>`;
}

function hero(title, description) {
  return `<section class="demo-hero"><div><p class="eyebrow">Demo property · delayed public evidence</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><span class="demo-badge"><i></i>${payload.delayDays}+ day delay</span></section>`;
}

function panel(metrics, selected) {
  const imported = number(metrics.gridImportKwh);
  const exported = number(metrics.gridExportKwh);
  const grid = imported === null && exported === null ? 'Unavailable' : exported !== null && (imported === null || exported > imported) ? `${energy(exported)} export` : `${energy(imported)} import`;
  const battery = number(metrics.batteryDischargeKwh) !== null ? `${energy(metrics.batteryDischargeKwh)} out` : number(metrics.batteryChargeKwh) !== null ? `${energy(metrics.batteryChargeKwh)} in` : 'Unavailable';
  const detail = selected.days.length === 1 ? dateLabel(selected.days[0].date) : selected.label;
  const node = (area, label, value, small) => `<article class="panel-node panel-${area}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(small)}</small>${area === 'home' ? '<i class="panel-flow"></i>' : ''}</article>`;
  return `<section class="panel-section"><div class="section-title"><div><h2>KEMS Panel View</h2><p>The same Live / Simulated separation as the property Pi, using delayed daily totals rather than current household power.</p></div><span class="demo-badge"><i></i>${mode === 'actual' ? 'Delayed live' : 'Delayed simulation'}</span></div><div class="panel-view">${node('solar', 'Solar', energy(metrics.solarKwh), detail)}${node('grid', 'Grid', grid, detail)}${node('home', 'Home', energy(metrics.homeKwh), detail)}${node('battery', 'Battery', battery, number(metrics.endSocPercent) === null ? 'SOC not published' : `End SOC ${percent(metrics.endSocPercent)}`)}${node('ev', 'EV', 'Not published', 'Public demo excludes device-level detail')}</div></section>`;
}

function routing(metrics) {
  const rows = [
    ['Home usage', energy(metrics.homeKwh)], ['Solar generation', energy(metrics.solarKwh)],
    ['Grid import', energy(metrics.gridImportKwh)], ['Grid export', energy(metrics.gridExportKwh)],
    ['Battery charge', energy(metrics.batteryChargeKwh)], ['Battery → home / discharge', energy(metrics.batteryDischargeKwh)],
    ['Battery export', energy(metrics.batteryExportKwh)], ['End battery SOC', percent(metrics.endSocPercent)]
  ];
  const importCost = number(metrics.netCostGbp) !== null && number(metrics.exportIncomeGbp) !== null ? number(metrics.netCostGbp) + number(metrics.exportIncomeGbp) : null;
  return `<section class="routing-section"><div class="section-title"><div><h2>Energy routing summary</h2><p>Daily retained evidence only. Instantaneous routes and per-device entity details are not published to kems.uk.</p></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Route / evidence</th><th>Delayed value</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table></div><div class="demo-grid" style="margin-top:14px">${card('Import cost', money(importCost), 'Derived where net cost + export income are published')}${card('Export income', money(metrics.exportIncomeGbp), 'Retained delayed evidence')}${card('Net electricity cost', money(metrics.netCostGbp), 'Common comparison basis', 'good')}${card('Modelled saving', mode === 'actual' ? 'Measured reality' : money(metrics.savingGbp), mode === 'actual' ? 'No simulated saving applied to measured data' : 'Versus delayed measured reality')}</div></section>`;
}

function privacyNote() {
  return `<section class="privacy-section"><div class="privacy-note"><div class="privacy-icon">✓</div><p><strong>Public-demo boundary:</strong> ${escapeHtml(payload.privacy || 'Sanitised daily totals only.')} The detailed Agile price horizon, instantaneous shadow command and hardware-control surfaces remain on the property Pi and are not reproduced here.</p></div></section>`;
}

function unavailable(selected) {
  return `<section class="empty-state"><strong>${escapeHtml(selected.label)} is not available yet.</strong><span>KEMS shows this period only when native retained evidence exists. Nothing is multiplied or invented.</span></section>`;
}

function renderAgile() {
  const selected = selectedPeriod();
  if (!selected.days.length || !selected.complete) {
    root.innerHTML = hero('Full KEMS Agile', 'A delayed public version of the flagship property page, with Live and Simulated views kept clearly separate.') + toolbar(true) + unavailable(selected) + privacyNote();
    return bindControls();
  }
  const metrics = aggregate(selected.days)[mode] || {};
  root.innerHTML = hero('Full KEMS Agile', 'A delayed public version of the flagship property page, with Live and Simulated views kept clearly separate.') + toolbar(true) + `<section class="demo-grid">${card('Home energy', energy(metrics.homeKwh), selected.label)}${card('Grid import', energy(metrics.gridImportKwh), selected.label)}${card('Grid export', energy(metrics.gridExportKwh), selected.label)}${card('Net electricity cost', money(metrics.netCostGbp), selected.label, 'good')}${card('Solar generation', energy(metrics.solarKwh), mode === 'actual' ? 'Measured if published' : 'Full KEMS Agile replay')}${card('Battery discharge', energy(metrics.batteryDischargeKwh), mode === 'actual' ? 'Measured if available' : 'Digital-twin route')}${card('Battery export', energy(metrics.batteryExportKwh), mode === 'actual' ? 'Measured if available' : 'Agile replay')}${card('End battery SOC', percent(metrics.endSocPercent), selected.days.length === 1 ? dateLabel(selected.days.at(-1).date) : 'Latest day in period')}</section>` + panel(metrics, selected) + routing(metrics) + `<section class="routing-section"><div class="section-title"><div><h2>Agile optimiser detail</h2><p>The property Pi shows price horizon, selected half-hour export slots, latest-safe protection, economic guard and shadow proof.</p></div></div><div class="empty-state"><strong>Not published to the public demo.</strong><span>The public feed proves delayed daily outcomes without exposing a time-resolved household profile or any control surface.</span></div></section>` + privacyNote();
  bindControls();
}

function currentLeader(products) {
  return PRODUCTS.filter(([key]) => key !== 'actual').map(([key, label]) => [number(products[key]?.netCostGbp), key, label]).filter(([cost]) => cost !== null).sort((a, b) => a[0] - b[0])[0] || null;
}

function renderCompare() {
  const selected = selectedPeriod();
  if (!selected.days.length || !selected.complete) {
    root.innerHTML = hero('Compare', 'Live Data, Battery & Solar, Full KEMS and Full KEMS Agile on the same delayed evidence basis.') + toolbar() + unavailable(selected) + privacyNote();
    return bindControls();
  }
  const products = aggregate(selected.days);
  const leader = currentLeader(products);
  const strategyCards = PRODUCTS.map(([key, label]) => {
    const metrics = products[key] || {};
    const exists = Object.keys(metrics).length > 0;
    const isLeader = leader?.[1] === key;
    return `<article class="compare-card ${isLeader ? 'leader' : ''}"><div class="strategy-name"><span>${escapeHtml(label)}</span>${isLeader ? '<b class="leader-pill">Current leader</b>' : ''}</div><strong>${exists ? money(metrics.netCostGbp) : 'Unavailable'}</strong><small>Net electricity cost</small><div class="compare-metrics"><div><span>Grid import</span><b>${exists ? energy(metrics.gridImportKwh) : '—'}</b></div><div><span>Grid export</span><b>${exists ? energy(metrics.gridExportKwh) : '—'}</b></div><div><span>Solar</span><b>${exists ? energy(metrics.solarKwh) : '—'}</b></div><div><span>Saving</span><b>${key === 'actual' ? 'Measured' : exists ? money(metrics.savingGbp) : '—'}</b></div></div></article>`;
  }).join('');
  const rows = [
    ['Home usage', 'homeKwh', energy], ['Grid import', 'gridImportKwh', energy], ['Grid export', 'gridExportKwh', energy],
    ['Solar generation', 'solarKwh', energy], ['Battery → home', 'batteryDischargeKwh', energy], ['Battery export', 'batteryExportKwh', energy],
    ['Net electricity cost', 'netCostGbp', money]
  ];
  const table = `<section class="compare-section"><div class="section-title"><div><h2>Common evidence comparison</h2><p>Every column uses the same delayed period. Missing evidence remains unavailable.</p></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Metric</th>${PRODUCTS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, metric, formatter]) => `<tr><th>${escapeHtml(label)}</th>${PRODUCTS.map(([key]) => `<td>${escapeHtml(formatter(products[key]?.[metric]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  const roi = `<section class="roi-section"><div class="section-title"><div><h2>ROI</h2><p>The property Compare page can calculate ROI when genuine system-cost evidence exists. The public feed does not publish a property's purchase price.</p></div></div><div class="roi-grid">${PRODUCTS.map(([, label]) => `<article class="roi-card"><span>${escapeHtml(label)}</span><strong>Unavailable</strong><small>No public system-cost evidence — no ROI is invented.</small></article>`).join('')}</div></section>`;
  root.innerHTML = hero('Compare', 'Live Data, Battery & Solar, Full KEMS and Full KEMS Agile on the same delayed evidence basis.') + toolbar() + `<section class="demo-grid">${card('Evidence window', selected.days.length === 1 ? dateLabel(selected.days[0].date) : `${dateLabel(selected.days[0].date)} → ${dateLabel(selected.days.at(-1).date)}`, `${selected.days.length} native published day${selected.days.length === 1 ? '' : 's'}`)}${card('Current leader', leader?.[2] || 'Building evidence', leader ? money(leader[0]) : 'No comparable simulated cost yet', 'good')}${card('Data through', dateLabel(payload.dataThrough), `${payload.delayDays}+ day privacy delay`)}${card('Feed', payload.feedSource === 'live' ? 'Delayed Pi feed' : 'Static fallback', 'Retained delayed evidence')}</section><section class="compare-cards">${strategyCards}</section>${table}${roi}${privacyNote()}`;
  bindControls();
}

function bindControls() {
  document.querySelector('#demo-period')?.addEventListener('change', (event) => { period = event.target.value; render(); });
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { mode = button.dataset.mode; render(); }));
}

function render() {
  if (view === 'compare') renderCompare();
  else renderAgile();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if (!response.ok) throw new Error(`Demo feed returned HTTP ${response.status}.`);
  return response.json();
}

async function load() {
  let liveError = null;
  setStatus('ready', 'Loading delayed demo');
  try {
    payload = validate(await fetchJson(LIVE_DEMO_URL));
    payload.feedSource = 'live';
    setStatus('ready', `${payload.delayDays}+ days delayed`);
  } catch (error) {
    liveError = error;
    try {
      payload = validate(await fetchJson('demo-data.json'));
      payload.feedSource = 'fallback';
      setStatus('fallback', 'Static delayed fallback');
    } catch (fallbackError) {
      setStatus('error', 'Demo unavailable');
      root.innerHTML = `<section class="empty-state"><strong>Delayed demo unavailable.</strong><span>${escapeHtml(liveError?.message || 'Live feed unavailable')} ${escapeHtml(fallbackError.message)}</span></section>`;
      return;
    }
  }
  render();
}

refreshButton?.addEventListener('click', load);
load();
