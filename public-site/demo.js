const root = document.querySelector('#demo-root');
const status = document.querySelector('#demo-status');
const periodSelect = document.querySelector('#demo-period');

const PRODUCT_KEYS = [
  ['actual', 'Live Data'],
  ['batterySolar', 'Battery & Solar'],
  ['fullKems', 'Full KEMS'],
  ['fullKemsAgile', 'Full KEMS Agile']
];

function money(value) {
  return Number.isFinite(Number(value)) ? `£${Number(value).toFixed(2)}` : '—';
}

function energy(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} kWh` : '—';
}

function latestAllowedDate(delayDays) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - delayDays);
  return date.toISOString().slice(0, 10);
}

function validate(payload) {
  if (!payload || payload.schema !== 1) throw new Error('Unsupported demo data format.');
  if (!payload.delayed || !Number.isInteger(payload.delayDays) || payload.delayDays < 7) {
    throw new Error('The public demo feed does not satisfy the seven-day privacy delay.');
  }
  const cutoff = latestAllowedDate(payload.delayDays);
  if (payload.dataThrough && payload.dataThrough > cutoff) {
    throw new Error('The public demo feed contains data that is too recent.');
  }
  if (!Array.isArray(payload.days)) throw new Error('The public demo feed has no day list.');
  for (const day of payload.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day?.date || '')) || day.date > cutoff) {
      throw new Error('The public demo feed contains an invalid or too-recent day.');
    }
  }
  return payload;
}

function aggregate(days) {
  const result = {};
  for (const [key] of PRODUCT_KEYS) result[key] = {};
  for (const day of days) {
    for (const [key] of PRODUCT_KEYS) {
      const source = day[key] || {};
      for (const [metric, value] of Object.entries(source)) {
        const number = Number(value);
        if (!Number.isFinite(number)) continue;
        if (metric === 'endSocPercent') result[key][metric] = number;
        else result[key][metric] = (result[key][metric] || 0) + number;
      }
    }
  }
  return result;
}

function periodDays(allDays, period) {
  const count = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : period === 'year' ? 365 : allDays.length;
  return allDays.slice(Math.max(0, allDays.length - count));
}

function winner(products) {
  return PRODUCT_KEYS
    .filter(([key]) => key !== 'actual')
    .map(([key, label]) => [Number(products[key]?.netCostGbp), label])
    .filter(([cost]) => Number.isFinite(cost))
    .sort((a, b) => a[0] - b[0])[0]?.[1] || 'Building evidence';
}

function row(label, values) {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.scope = 'row';
  th.textContent = label;
  tr.append(th);
  for (const value of values) {
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(td);
  }
  return tr;
}

function render(payload) {
  const selected = periodDays(payload.days, periodSelect.value);
  root.replaceChildren();

  if (!selected.length) {
    const empty = document.createElement('div');
    empty.className = 'demo-empty';
    empty.innerHTML = '<strong>Demo publishing is ready.</strong><p>No delayed property days have been published yet. The public feed remains intentionally empty until a sanitised seven-day-old export is supplied.</p>';
    root.append(empty);
    status.textContent = `Privacy delay: ${payload.delayDays} days · no property data published yet`;
    return;
  }

  const products = aggregate(selected);
  const table = document.createElement('table');
  table.className = 'demo-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const blank = document.createElement('th');
  blank.textContent = selected.length === 1 ? selected[0].date : `${selected[0].date} → ${selected.at(-1).date}`;
  headRow.append(blank);
  for (const [, label] of PRODUCT_KEYS) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  tbody.append(
    row('Net electricity cost', PRODUCT_KEYS.map(([key]) => money(products[key]?.netCostGbp))),
    row('Grid import', PRODUCT_KEYS.map(([key]) => energy(products[key]?.gridImportKwh))),
    row('Grid export', PRODUCT_KEYS.map(([key]) => energy(products[key]?.gridExportKwh))),
    row('Solar generation', PRODUCT_KEYS.map(([key]) => energy(products[key]?.solarKwh))),
    row('Battery export', PRODUCT_KEYS.map(([key]) => energy(products[key]?.batteryExportKwh))),
    row('Modelled saving', PRODUCT_KEYS.map(([key]) => key === 'actual' ? 'Measured reality' : money(products[key]?.savingGbp)))
  );
  table.append(thead, tbody);

  const winnerCard = document.createElement('div');
  winnerCard.className = 'demo-winner';
  winnerCard.innerHTML = `<span>Best simulated strategy</span><strong>${winner(products)}</strong><small>Compared on delayed net electricity cost for the selected evidence window.</small>`;

  root.append(winnerCard, table);
  status.textContent = `Demo property · data through ${payload.dataThrough || selected.at(-1).date} · delayed ${payload.delayDays} days`;
}

let payload;

async function load() {
  try {
    const response = await fetch('demo-data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Demo feed returned HTTP ${response.status}.`);
    payload = validate(await response.json());
    render(payload);
  } catch (error) {
    status.textContent = 'Demo unavailable';
    root.textContent = error.message;
  }
}

periodSelect?.addEventListener('change', () => payload && render(payload));
load();
