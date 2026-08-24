const root = document.querySelector('#demo-root');
const statusPill = document.querySelector('#demo-status');
const refreshButton = document.querySelector('#refresh-button');
const view = document.body.dataset.demoView || 'agile';
const LIVE_DEMO_URL = 'https://demo-api.kems.uk/api/public-demo';
const PRODUCTS = [
  ['actual', 'Live Data'],
  ['kems', 'KEMS']
];

let payload = null;
let mode = 'kems';
let period = 'day';

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

function money(value, absolute = false) {
  const parsed = number(value);
  if (parsed === null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(absolute ? Math.abs(parsed) : parsed);
}

function economicResult(value) {
  const parsed = number(value);
  if (parsed === null) return { value: 'Unavailable', label: 'Total energy cost', className: '' };
  if (parsed < -0.005) return { value: `${money(parsed, true)} credit`, label: 'Total energy cost', className: 'profit' };
  if (Math.abs(parsed) <= 0.005) return { value: '£0.00', label: 'Total energy cost', className: 'profit' };
  return { value: money(parsed), label: 'Total energy cost', className: '' };
}

function energy(value) {
  const parsed = number(value);
  return parsed === null ? 'Unavailable' : `${parsed.toFixed(2)} kWh`;
}

function compactEnergy(value) {
  const parsed = number(value);
  return parsed === null ? '—' : `${parsed.toFixed(2)} kWh`;
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

function shortDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function latestAllowedDate(delayDays) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - delayDays);
  return date.toISOString().slice(0, 10);
}

function normaliseDay(day) {
  const legacyKems = day?.kems || day?.fullKemsAgile || day?.fullKems || day?.batterySolar || null;
  const strategyLabel = day?.strategyLabel
    || (day?.fullKemsAgile ? 'Agile export optimisation' : null)
    || (day?.fullKems ? 'Fixed export optimisation' : null)
    || (day?.batterySolar ? 'Self-use / no paid export' : null)
    || 'Adaptive KEMS';
  return {
    date: day?.date,
    actual: day?.actual || null,
    kems: legacyKems,
    strategyLabel
  };
}

function validate(input) {
  if (!input || ![1, 2].includes(input.schema)) throw new Error('Unsupported demo data format.');
  if (!input.delayed || !Number.isInteger(input.delayDays) || input.delayDays < 7) {
    throw new Error('The public demo feed does not satisfy the seven-day privacy delay.');
  }
  const cutoff = latestAllowedDate(input.delayDays);
  if (input.dataThrough && input.dataThrough > cutoff) throw new Error('The public demo feed contains data that is too recent.');
  if (!Array.isArray(input.days)) throw new Error('The public demo feed has no day list.');
  const days = input.days.map(normaliseDay);
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day?.date || '')) || day.date > cutoff) {
      throw new Error('The public demo feed contains an invalid or too recent day.');
    }
  }
  return {
    ...input,
    schema: 2,
    products: ['actual', 'kems'],
    billBasis: input.billBasis || 'Total energy cost includes electricity and gas usage, both standing charges, export income and genuine supplier/account credits. Battery wear is excluded.',
    days
  };
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

function periodSlice(value = period) {
  const days = payload?.days || [];
  if (!days.length) return { days: [], label: 'No published evidence', complete: false, required: 1 };
  if (value === 'previous') return { days: days.slice(-2, -1), label: 'Previous delayed day', complete: days.length >= 2, required: 1 };
  if (value === 'published') return { days, label: 'Published evidence', complete: days.length > 0, required: days.length };
  const counts = { day: 1, week: 7, month: 30, year: 365 };
  const labels = { day: 'Latest delayed day', week: 'Last 7 delayed days', month: 'Last 30 delayed days', year: 'Last 365 delayed days' };
  const count = counts[value] || 1;
  return { days: days.slice(-count), label: labels[value] || 'Delayed evidence', complete: days.length >= count, required: count };
}

function hasProductEvidence(day, key) {
  const row = day?.[key];
  return row && typeof row === 'object' && Object.keys(row).length > 0;
}

function hasBillEvidence(day, key) {
  return hasProductEvidence(day, key) && number(day[key].totalEnergyCostGbp) !== null;
}

function completeCompareDay(day) {
  return PRODUCTS.every(([key]) => hasBillEvidence(day, key));
}

function periodReady(value = period, forView = view) {
  const selected = periodSlice(value);
  if (!selected.complete || !selected.days.length) return false;
  if (forView === 'compare') return selected.days.every(completeCompareDay);
  return selected.days.every((day) => hasProductEvidence(day, mode));
}

function selectedPeriod() {
  const selected = periodSlice(period);
  return { ...selected, complete: periodReady(period) };
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
  ].map(([value, label]) => {
    const ready = periodReady(value, view);
    return `<option value="${value}"${period === value ? ' selected' : ''}${ready ? '' : ' disabled'}>${label}${ready ? '' : ' · building evidence'}</option>`;
  }).join('');
  return `<section class="demo-toolbar"><div class="toolbar-group"><span class="toolbar-label">Evidence window</span><select id="demo-period">${options}</select></div>${showMode ? `<div class="toolbar-group"><span class="toolbar-label">Panel view</span><div class="mode-toggle"><button type="button" data-mode="actual" class="${mode === 'actual' ? 'active' : ''}">Delayed live</button><button type="button" data-mode="kems" class="${mode === 'kems' ? 'active' : ''}">Delayed KEMS</button></div></div>` : ''}</section>`;
}

function hero(title, description) {
  const through = payload?.dataThrough ? ` · through ${dateLabel(payload.dataThrough)}` : '';
  return `<section class="demo-hero"><div><p class="eyebrow">Demo property · delayed public evidence${escapeHtml(through)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><span class="demo-badge"><i></i>${payload.delayDays}+ day delay</span></section>`;
}

function statusTile(label, good, onText, offText) {
  return `<div class="panel-status-tile"><span>${escapeHtml(label)}</span><b class="${good ? 'on' : 'off'}">${escapeHtml(good ? onText : offText)}</b></div>`;
}

function panelNode(kind, label, value, detail, symbol, extra = '') {
  return `<article class="kems-panel-node node-${kind}"><div class="node-icon" aria-hidden="true">${symbol}</div><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>${extra}</article>`;
}

function panel(metrics, selected) {
  const imported = number(metrics.gridImportKwh) || 0;
  const exported = number(metrics.gridExportKwh) || 0;
  const solar = number(metrics.solarKwh) || 0;
  const batteryOut = number(metrics.batteryDischargeKwh) || 0;
  const batteryIn = number(metrics.batteryChargeKwh) || 0;
  const ev = number(metrics.evKwh);
  const soc = number(metrics.endSocPercent);
  const result = economicResult(metrics.totalEnergyCostGbp);
  const detail = selected.days.length === 1 ? dateLabel(selected.days[0].date) : selected.label;
  const gridValue = exported > imported && exported > 0 ? `${exported.toFixed(2)} kWh export` : imported > 0 ? `${imported.toFixed(2)} kWh import` : 'No grid energy';
  const batteryValue = batteryOut > 0 ? `${batteryOut.toFixed(2)} kWh out` : batteryIn > 0 ? `${batteryIn.toFixed(2)} kWh in` : 'No battery flow';
  const batteryGauge = Number.isFinite(soc) ? `<div class="battery-gauge"><i style="width:${Math.max(0, Math.min(100, soc))}%"></i></div>` : '';
  const status = `${statusTile('GRID', imported > 0 || exported > 0, 'FLOW', 'IDLE')}${statusTile('COST', number(metrics.totalEnergyCostGbp) !== null && number(metrics.totalEnergyCostGbp) <= 0, 'CREDIT', 'COST')}${statusTile('IMPORT', imported > 0.001, 'ON', 'OFF')}${statusTile('EXPORT', exported > 0.001, 'ON', 'OFF')}`;
  return `<section class="panel-section"><div class="section-title"><div><h2>KEMS Panel View</h2><p>Pi-style energy-flow graphic using selected delayed evidence. Values are daily/period energy, never current household power.</p></div><span class="demo-badge"><i></i>${mode === 'actual' ? 'Delayed live' : 'Delayed KEMS'}</span></div><div class="panel-status-grid">${status}</div><div class="kems-panel-stage">
    <div class="flow-line flow-solar ${solar > 0 ? 'active' : ''}"><i></i></div>
    <div class="flow-line flow-grid ${imported > 0 || exported > 0 ? 'active' : ''}"><i></i></div>
    <div class="flow-line flow-battery ${batteryIn > 0 || batteryOut > 0 ? 'active' : ''}"><i></i></div>
    <div class="flow-line flow-ev ${Number.isFinite(ev) && ev > 0 ? 'active' : ''}"><i></i></div>
    ${panelNode('solar', 'Solar', energy(metrics.solarKwh), detail, '☀')}
    ${panelNode('grid', 'Grid', gridValue, detail, '⌁')}
    ${panelNode('home', 'Home', energy(metrics.homeKwh), result.value, '⌂')}
    ${panelNode('battery', 'Battery', batteryValue, Number.isFinite(soc) ? `End SoC ${soc.toFixed(1)}%` : 'End SoC unavailable', '▣', batteryGauge)}
    ${panelNode('ev', 'EV', energy(metrics.evKwh), Number.isFinite(ev) ? 'Aggregate delayed charging energy' : 'EV history unavailable', '▰')}
  </div></section>`;
}

function billBreakdown(metrics) {
  const rows = [
    ['Electricity import', metrics.electricityImportCostGbp, false],
    ['Electricity standing charge', metrics.electricityStandingChargeGbp, false],
    ['Electricity export income', metrics.electricityExportIncomeGbp, true],
    ['Supplier/account credits', metrics.supplierEnergyCreditGbp, true],
    ['Electricity total', metrics.electricityTotalCostGbp, false],
    ['Gas usage', metrics.gasUsageCostGbp, false],
    ['Gas standing charge', metrics.gasStandingChargeGbp, false],
    ['Gas total', metrics.gasTotalCostGbp, false],
    ['TOTAL ENERGY COST', metrics.totalEnergyCostGbp, false]
  ];
  return `<section class="routing-section"><div class="section-title"><div><h2>Total energy cost breakdown</h2><p>${escapeHtml(payload.billBasis || '')}</p></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Bill component</th><th>Delayed value</th></tr></thead><tbody>${rows.map(([label, value, credit]) => `<tr><th>${escapeHtml(label)}</th><td>${value === null || value === undefined ? '—' : `${credit ? '−' : ''}${escapeHtml(money(Math.abs(number(value) || 0)))}`}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function routing(metrics) {
  const rows = [
    ['Home usage', energy(metrics.homeKwh)], ['EV charging', energy(metrics.evKwh)], ['Solar generation', energy(metrics.solarKwh)],
    ['Grid import', energy(metrics.gridImportKwh)], ['Grid export', energy(metrics.gridExportKwh)],
    ['Battery charge', energy(metrics.batteryChargeKwh)], ['Battery → home / discharge', energy(metrics.batteryDischargeKwh)],
    ['Battery export', energy(metrics.batteryExportKwh)], ['End battery SoC', percent(metrics.endSocPercent)]
  ];
  return `<section class="routing-section"><div class="section-title"><div><h2>Energy routing summary</h2><p>Sanitised delayed daily evidence. EV identity, state, SoC and charge times are not published.</p></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Route / evidence</th><th>Delayed value</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function chartPoints(days, key) {
  return days.map((day) => ({ date: day.date, ...(day[key] || {}) })).filter((row) => row.date);
}

function trendChart(days, productKey) {
  const rows = chartPoints(days.slice(-14), productKey);
  if (rows.length < 2) return `<section class="chart-section"><div class="section-title"><div><h2>Delayed energy history</h2><p>The Pi graph appears here once at least two delayed days are published.</p></div></div><div class="empty-state"><strong>Building delayed chart evidence.</strong><span>No shorter period is scaled up.</span></div></section>`;
  const width = 900, height = 300, left = 52, right = 48, top = 24, bottom = 46;
  const energyKeys = ['homeKwh', 'solarKwh', 'batteryDischargeKwh', 'evKwh'];
  const maxEnergy = Math.max(1, ...rows.flatMap((row) => energyKeys.map((key) => number(row[key]) || 0)));
  const x = (index) => left + (rows.length === 1 ? 0 : index * (width - left - right) / (rows.length - 1));
  const y = (value) => top + (height - top - bottom) * (1 - Math.max(0, number(value) || 0) / maxEnergy);
  const ySoc = (value) => top + (height - top - bottom) * (1 - Math.max(0, Math.min(100, number(value) || 0)) / 100);
  const pathFor = (key, mapper = y) => rows.map((row, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${mapper(row[key]).toFixed(1)}`).join(' ');
  const grid = [0, .25, .5, .75, 1].map((fraction) => {
    const yy = top + (height - top - bottom) * fraction;
    const label = (maxEnergy * (1 - fraction)).toFixed(maxEnergy >= 10 ? 0 : 1);
    return `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" class="chart-grid"/><text x="${left - 10}" y="${yy + 4}" text-anchor="end">${label}</text>`;
  }).join('');
  const labels = rows.map((row, index) => `<text x="${x(index)}" y="${height - 15}" text-anchor="middle">${escapeHtml(shortDate(row.date))}</text>`).join('');
  return `<section class="chart-section"><div class="section-title"><div><h2>Delayed energy history</h2><p>Home, Solar, Battery → home, EV and end battery SoC. No intra-day household profile is exposed.</p></div></div><div class="chart-wrap"><svg class="demo-chart pi-history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Delayed energy history chart">${grid}${labels}<text x="14" y="${top + 5}">kWh</text><text x="${width - 6}" y="${top + 5}" text-anchor="end">SoC %</text><path d="${pathFor('homeKwh')}" class="series-home"/><path d="${pathFor('solarKwh')}" class="series-solar"/><path d="${pathFor('batteryDischargeKwh')}" class="series-battery"/><path d="${pathFor('evKwh')}" class="series-ev"/><path d="${pathFor('endSocPercent', ySoc)}" class="series-soc"/></svg></div><div class="chart-legend pi-legend"><span class="home">Home</span><span class="solar">Solar</span><span class="battery">Battery → home</span><span class="ev">EV</span><span class="soc">Battery SoC</span></div></section>`;
}

function privacyNote() {
  return `<section class="privacy-section"><div class="privacy-note"><div class="privacy-icon">✓</div><p><strong>Public-demo boundary:</strong> ${escapeHtml(payload.privacy || 'Sanitised daily totals only.')} Detailed current power, EV state/SoC, entity identifiers, tariff-control commands and hardware-control surfaces stay private to the property.</p></div></section>`;
}

function unavailable(selected, comparison = false) {
  const detail = comparison
    ? 'KEMS enables a financial comparison only when both delayed products contain canonical Total energy cost evidence. Legacy electricity-only cost is never promoted into the bill headline.'
    : 'KEMS enables a period only when its native delayed evidence exists. Nothing is multiplied, scaled or invented.';
  return `<section class="empty-state"><strong>${escapeHtml(selected.label)} is still building complete delayed evidence.</strong><span>${escapeHtml(detail)}</span></section>`;
}

function selectedStrategy(days) {
  const labels = days.map((day) => day.strategyLabel).filter(Boolean);
  return labels.at(-1) || 'Adaptive KEMS';
}

function renderAgile() {
  const selected = selectedPeriod();
  if (!selected.days.length || !selected.complete) {
    root.innerHTML = hero('KEMS', 'The adaptive KEMS property view reproduced with sanitised evidence that is at least seven days old.') + toolbar(true) + unavailable(selected) + privacyNote();
    return bindControls();
  }
  const metrics = aggregate(selected.days)[mode] || {};
  const result = economicResult(metrics.totalEnergyCostGbp);
  const chartDays = period === 'day' || period === 'previous' ? (payload.days || []).slice(-14) : selected.days;
  const strategy = selectedStrategy(selected.days);
  root.innerHTML = hero('KEMS', 'One adaptive product. The internal strategy follows the configured system and export tariff.') + toolbar(true)
    + `<section class="demo-grid">${card('KEMS strategy', strategy, selected.label)}${card('Home energy', energy(metrics.homeKwh), selected.label)}${card('EV charging', energy(metrics.evKwh), 'Aggregate delayed energy only')}${card('Grid import', energy(metrics.gridImportKwh), selected.label)}${card('Grid export', energy(metrics.gridExportKwh), selected.label)}${card(result.label, result.value, 'Bill-equivalent; battery wear excluded', result.className)}${card('Solar generation', energy(metrics.solarKwh), mode === 'actual' ? 'Delayed measured evidence' : 'Delayed KEMS replay')}${card('End battery SoC', percent(metrics.endSocPercent), selected.days.length === 1 ? dateLabel(selected.days.at(-1).date) : 'Latest day in period')}</section>`
    + panel(metrics, selected) + trendChart(chartDays, mode) + routing(metrics) + billBreakdown(metrics) + privacyNote();
  bindControls();
}

function roiEvidenceDays() {
  return (payload?.days || []).filter(completeCompareDay).slice(-30);
}

function roiCards() {
  const days = roiEvidenceDays();
  const systemCostGbp = number(payload?.economics?.systemCostGbp);
  const products = aggregate(days);
  if (!Number.isFinite(systemCostGbp) || !days.length) {
    return `<section class="roi-section"><div class="section-title"><div><h2>Estimated ROI</h2><p>ROI appears when the delayed feed has both the configured KEMS investment and canonical bill-comparable evidence.</p></div></div><div class="roi-grid"><article class="roi-card"><span>KEMS</span><strong>Building evidence</strong><small>No values are invented.</small></article></div></section>`;
  }
  const actualCost = number(products.actual?.totalEnergyCostGbp);
  const kemsCost = number(products.kems?.totalEnergyCostGbp);
  const saving = Number.isFinite(actualCost) && Number.isFinite(kemsCost) ? actualCost - kemsCost : null;
  const annualSaving = Number.isFinite(saving) ? saving / days.length * 365 : null;
  const roi = Number.isFinite(annualSaving) && systemCostGbp > 0 ? annualSaving / systemCostGbp * 100 : null;
  const payback = Number.isFinite(annualSaving) && annualSaving > 0 ? systemCostGbp / annualSaving : null;
  return `<section class="roi-section"><div class="section-title"><div><h2>Estimated ROI</h2><p>Measured Total energy cost minus KEMS Total energy cost, annualised from native delayed evidence and divided by the configured system investment (${escapeHtml(money(systemCostGbp))}).</p></div></div><div class="roi-grid"><article class="roi-card"><span>Live Data</span><strong>Baseline</strong><small>${days.length} delayed day(s)</small></article><article class="roi-card"><span>KEMS</span><strong>${Number.isFinite(roi) ? `${roi.toFixed(1)}% ROI` : 'Unavailable'}</strong><small>${Number.isFinite(annualSaving) ? `${escapeHtml(money(annualSaving))} annualised saving · ${Number.isFinite(payback) ? `${payback.toFixed(1)} yr payback` : 'no positive payback yet'}` : 'Incomplete comparable evidence'}</small></article></div></section>`;
}

function renderCompare() {
  const selected = selectedPeriod();
  if (!selected.days.length || !selected.complete) {
    root.innerHTML = hero('Compare', 'Live Data and KEMS on the same delayed bill-equivalent Total energy cost basis.') + toolbar() + unavailable(selected, true) + roiCards() + privacyNote();
    return bindControls();
  }
  const products = aggregate(selected.days);
  const liveCost = number(products.actual?.totalEnergyCostGbp);
  const kemsCost = number(products.kems?.totalEnergyCostGbp);
  const saving = Number.isFinite(liveCost) && Number.isFinite(kemsCost) ? liveCost - kemsCost : null;
  const strategy = selectedStrategy(selected.days);
  const strategyCards = PRODUCTS.map(([key, label]) => {
    const metrics = products[key] || {};
    const result = economicResult(metrics.totalEnergyCostGbp);
    const isKems = key === 'kems';
    return `<article class="compare-card ${isKems && Number.isFinite(saving) && saving > 0 ? 'leader' : ''} ${result.className}"><div class="strategy-name"><span>${escapeHtml(label)}</span>${isKems ? `<b class="leader-pill">${escapeHtml(strategy)}</b>` : ''}</div><strong>${escapeHtml(result.value)}</strong><small>Total energy cost · battery wear excluded</small><div class="compare-metrics"><div><span>Grid import</span><b>${compactEnergy(metrics.gridImportKwh)}</b></div><div><span>Grid export</span><b>${compactEnergy(metrics.gridExportKwh)}</b></div><div><span>EV</span><b>${compactEnergy(metrics.evKwh)}</b></div><div><span>Solar</span><b>${compactEnergy(metrics.solarKwh)}</b></div><div><span>Saving</span><b>${key === 'actual' ? 'Measured' : Number.isFinite(saving) ? money(saving) : '—'}</b></div></div></article>`;
  }).join('');
  const billRows = [
    ['Electricity import', 'electricityImportCostGbp', false],
    ['Electricity standing charge', 'electricityStandingChargeGbp', false],
    ['Electricity export income', 'electricityExportIncomeGbp', true],
    ['Supplier/account credits', 'supplierEnergyCreditGbp', true],
    ['Electricity total', 'electricityTotalCostGbp', false],
    ['Gas usage', 'gasUsageCostGbp', false],
    ['Gas standing charge', 'gasStandingChargeGbp', false],
    ['Gas total', 'gasTotalCostGbp', false],
    ['TOTAL ENERGY COST', 'totalEnergyCostGbp', false]
  ];
  const table = `<section class="compare-section"><div class="section-title"><div><h2>Common bill comparison</h2><p>Every column uses the same delayed dates and canonical bill contract.</p></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Bill component</th>${PRODUCTS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${billRows.map(([label, metric, credit]) => `<tr><th>${escapeHtml(label)}</th>${PRODUCTS.map(([key]) => { const value = number(products[key]?.[metric]); return `<td>${value === null ? '—' : `${credit ? '−' : ''}${escapeHtml(money(Math.abs(value)))}`}</td>`; }).join('')}</tr>`).join('')}<tr><th>Saving</th><td>Measured baseline</td><td><strong>${Number.isFinite(saving) ? escapeHtml(money(saving)) : '—'}</strong></td></tr></tbody></table></div></section>`;
  root.innerHTML = hero('Compare', 'Live Data vs KEMS using the same Total energy cost that is intended to match the household energy account.') + toolbar() + `<section class="compare-cards">${strategyCards}</section>` + table + roiCards() + privacyNote();
  bindControls();
}

function bindControls() {
  const select = document.querySelector('#demo-period');
  select?.addEventListener('change', () => {
    period = select.value;
    render();
  });
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    if (!periodReady(period, 'agile')) {
      const fallback = ['day', 'previous', 'published'].find((candidate) => periodReady(candidate, 'agile'));
      if (fallback) period = fallback;
    }
    render();
  }));
}

function render() {
  if (!payload) return;
  if (view === 'compare') renderCompare();
  else renderAgile();
}

async function load() {
  root.innerHTML = '<section class="loading-screen"><img src="brand-lockup.svg?v=site1" alt="KEMS"><h1>Loading delayed evidence</h1><p>Checking the sanitised public feed…</p></section>';
  try {
    const response = await fetch(LIVE_DEMO_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Public demo API returned ${response.status}.`);
    payload = validate(await response.json());
    setStatus('ok', `${payload.delayDays}+ day delayed`);
  } catch (liveError) {
    try {
      const fallback = await fetch('demo-data.json', { cache: 'no-store' });
      if (!fallback.ok) throw new Error(`Fallback returned ${fallback.status}.`);
      payload = validate(await fallback.json());
      setStatus('fallback', 'Static delayed fallback');
    } catch (fallbackError) {
      setStatus('error', 'Demo unavailable');
      root.innerHTML = `<section class="empty-state"><strong>The delayed demo is unavailable.</strong><span>${escapeHtml(liveError.message)} ${escapeHtml(fallbackError.message)}</span></section>`;
      return;
    }
  }
  if (view === 'compare' && !periodReady('day', 'compare')) {
    period = ['previous', 'week', 'published'].find((candidate) => periodReady(candidate, 'compare')) || 'day';
  }
  if (view === 'agile' && !periodReady('day', 'agile')) {
    period = ['previous', 'week', 'published'].find((candidate) => periodReady(candidate, 'agile')) || 'day';
  }
  render();
}

refreshButton?.addEventListener('click', load);
load();
