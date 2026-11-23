// Loading and normalising the three CSV exports. Everything runs in the browser:
// files are read from public/data/ or from files the user drops on the Data page.
import Papa from 'papaparse';

export const SOURCES = {
  CO: { file: 'co_data.csv', label: 'One-time' },
  CR: { file: 'cr_data.csv', label: 'Recurring & Triggered' },
  CJ: { file: 'cj_data.csv', label: 'Journey' },
};

export const REQUIRED_COLUMNS = [
  'campaign_name', 'campaign_id', 'Sent', 'Delivered', 'clicks', 'OrderSuccess', 'Campaign_Start_Date',
  'Campaign_Type', 'Audience_Type', 'Product_Segment', 'Mode', 'Channel', 'Cost', 'gtv_click_attr',
  'revenue_click_attr', 'Segment_1', 'Segment_2', 'Segment_3', 'Segment_4', 'Variant',
];
export const JOURNEY_COLUMNS = ['journey_id', 'journey_name', 'Journey_Type'];

// Mode -> readable channel. Falls back to the first letter of the Channel code (P0, S0, W1 ...).
const MODE_NAMES = { PNS: 'Push', PS: 'Push (PS)', P: 'Push', S: 'SMS', W: 'WhatsApp', E: 'Email', RCS: 'RCS', R: 'RCS' };
const CHANNEL_PREFIX = { P: 'Push', S: 'SMS', W: 'WhatsApp', E: 'Email', R: 'RCS', A: 'App Inbox' };

export function channelName(mode, code) {
  const m = (mode || '').trim().toUpperCase();
  if (MODE_NAMES[m]) return MODE_NAMES[m];
  if (m) return m;
  const c = (code || '').trim().toUpperCase();
  return CHANNEL_PREFIX[c[0]] || c || 'Unknown';
}

const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Accepts 2026-11-03, 2026-11-03 10:00:00, 03/11/26, 03/11/2026, 03-11-2026, 03-Nov-26.
// Slash dates are read as day/month (as in the existing pipeline) unless that is impossible.
export function parseDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let d = +m[1], mo = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return new Date(y, mo - 1, d);
  }
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(y, MONTHS[m[2].toLowerCase()] - 1, +m[1]);
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const num = (v) => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Column names are matched case-insensitively so "Clicks" / "clicks" / "sent" all work.
function columnGetter(fields) {
  const map = {};
  fields.forEach((f) => { map[f.trim().toLowerCase()] = f; });
  return (row, ...names) => {
    for (const n of names) {
      const k = map[n.toLowerCase()];
      if (k !== undefined && row[k] !== undefined && row[k] !== '') return row[k];
    }
    return '';
  };
}

export function isExperimentalRow(segs, variant, explicit) {
  if (segs.some((s) => s.toUpperCase() === 'EXP')) return true;
  const e = String(explicit || '').toLowerCase();
  return e === 'yes' || e === 'true' || e === '1';
}

// Segment_1-Segment_2-Segment_3-Segment_4, skipping blanks and placeholder parts like Y00 / X00 / W00
// (any part containing a capital letter followed by "00").
export function segmentKey(segs) {
  const parts = segs.filter((s) => s && !/[A-Z]00/.test(s.toUpperCase()));
  return parts.length ? parts.join('-') : '(none)';
}

export function normalise(rows, fields, source) {
  const get = columnGetter(fields);
  const out = [];
  let badDates = 0;
  for (const r of rows) {
    const date = parseDate(get(r, 'Campaign_Start_Date', 'start_date', 'Day'));
    if (!date) { badDates++; continue; }
    const segs = [get(r, 'Segment_1'), get(r, 'Segment_2'), get(r, 'Segment_3'), get(r, 'Segment_4')].map((s) => String(s).trim());
    const mode = get(r, 'Mode');
    const code = get(r, 'Channel');
    const campaignType = String(get(r, 'Campaign_Type') || source).trim().toUpperCase();
    out.push({
      source,
      id: String(get(r, 'campaign_id') || get(r, 'campaign_name')).trim(),
      name: String(get(r, 'campaign_name', 'raw_campaign_name')).trim(),
      journeyId: String(get(r, 'journey_id')).trim(),
      journeyName: String(get(r, 'journey_name')).trim(),
      journeyType: String(get(r, 'Journey_Type')).trim() || (source === 'CJ' ? 'Unknown' : '—'),
      date: date.getTime(),
      dateKey: toKey(date),
      monthKey: monthKeyOf(date),
      campaignType: campaignType || source,
      audience: String(get(r, 'Audience_Type')).trim().toUpperCase() || 'Unknown',
      product: String(get(r, 'Product_Segment')).trim().toUpperCase() || 'Unknown',
      channel: channelName(mode, code),
      channelCode: String(code).trim().toUpperCase() || '—',
      segment: segmentKey(segs),
      isExp: isExperimentalRow(segs, get(r, 'Variant'), get(r, 'Experimental', 'Is_Experimental')),
      variant: String(get(r, 'Variant')).trim(),
      sent: num(get(r, 'Sent')),
      delivered: num(get(r, 'Delivered')),
      clicks: num(get(r, 'clicks')),
      orders: num(get(r, 'OrderSuccess', 'orders')),
      cost: num(get(r, 'Cost')),
      gtv: num(get(r, 'gtv_click_attr', 'GTV')),
      revenue: num(get(r, 'revenue_click_attr', 'Revenue')),
    });
  }
  return { rows: out, badDates };
}

function checkColumns(fields, source) {
  const have = new Set(fields.map((f) => f.trim().toLowerCase()));
  const need = source === 'CJ' ? [...REQUIRED_COLUMNS, ...JOURNEY_COLUMNS] : REQUIRED_COLUMNS;
  return need.filter((c) => !have.has(c.toLowerCase()));
}

export function parseCsv(input, source) {
  return new Promise((resolve, reject) => {
    Papa.parse(input, {
      header: true,
      skipEmptyLines: true,
      download: typeof input === 'string',
      worker: false,
      complete: (res) => {
        const fields = res.meta.fields || [];
        const { rows, badDates } = normalise(res.data, fields, source);
        resolve({ rows, info: { source, rawCount: res.data.length, count: rows.length, badDates, missing: checkColumns(fields, source) } });
      },
      error: reject,
    });
  });
}

export async function loadDefaultFiles() {
  const results = {};
  await Promise.all(Object.entries(SOURCES).map(async ([src, { file }]) => {
    try {
      const head = await fetch(`data/${file}`, { method: 'HEAD' });
      const type = head.headers.get('content-type') || '';
      if (!head.ok || type.includes('text/html')) throw new Error('not found');
      results[src] = await parseCsv(`data/${file}`, src);
      results[src].info.origin = `public/data/${file}`;
    } catch {
      results[src] = { rows: [], info: { source: src, count: 0, missing: [], error: `public/data/${file} not found` } };
    }
  }));
  return results;
}
