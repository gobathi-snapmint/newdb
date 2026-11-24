import { SOURCES, toKey, parseKey } from './data';

export const DIMENSIONS = [
  { key: 'source', label: 'Source', get: (r) => SOURCES[r.source]?.label || r.source },
  { key: 'channel', label: 'Channel', get: (r) => r.channel },
  { key: 'audience', label: 'Audience Type', get: (r) => r.audience },
  { key: 'campaignType', label: 'Campaign Type', get: (r) => r.campaignType },
  { key: 'product', label: 'Product Segment', get: (r) => r.product },
  { key: 'segment', label: 'Segment', get: (r) => r.segment },
  { key: 'exp', label: 'Experimental', get: (r) => (r.isExp ? 'Experimental' : 'BAU') },
  { key: 'journeyType', label: 'Journey Type', get: (r) => r.journeyType, journeyOnly: true },
  { key: 'journeyName', label: 'Journey', get: (r) => r.journeyName || '—', journeyOnly: true },
  { key: 'channelCode', label: 'Channel Code', get: (r) => r.channelCode },
  { key: 'campaign', label: 'Campaign', get: (r) => r.name || r.id },
];
export const DIM = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d]));

// Filters shown in the top bar (multi-selects); empty array = all.
export const FILTER_DIMS = ['source', 'campaignType', 'audience', 'channel', 'product', 'segment'];

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();

export function shiftMonth(key, n) {
  const d = parseKey(key);
  const y = d.getFullYear(), m = d.getMonth() + n;
  const isLast = d.getDate() === lastDay(y, d.getMonth());
  const target = new Date(y, m, 1);
  const day = isLast ? lastDay(target.getFullYear(), target.getMonth()) : Math.min(d.getDate(), lastDay(target.getFullYear(), target.getMonth()));
  return toKey(new Date(target.getFullYear(), target.getMonth(), day));
}

export const monthLabel = (mk) => parseKey(`${mk}-01`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
export const dayLabel = (k) => parseKey(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

// Time buckets for trend charts (weeks start on Monday)
export const weekStart = (k) => { const d = parseKey(k); const off = (d.getDay() + 6) % 7; return toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - off)); };
export const BUCKET = { day: (r) => r.dateKey, week: (r) => weekStart(r.dateKey), month: (r) => r.monthKey };
export const bucketLabel = (g, k) => (g === 'month' ? monthLabel(k) : g === 'week' ? `Wk ${dayLabel(k)}` : dayLabel(k));
const rangeLabel = (a, b) => (a === b ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`);

export const AVG_MONTHS = [3, 6, 12];

// Baseline = the average of the same dates (or the whole month) over the last n months.
// `ranges[0]` is the most recent month; its dates are the frame the averaged rows are mapped onto.
function averagePrev(curr, n, wholeMonths) {
  const ranges = Array.from({ length: n }, (_, i) => ({ from: shiftMonth(curr.from, -(i + 1)), to: shiftMonth(curr.to, -(i + 1)), shift: i }));
  const first = ranges[n - 1], last = ranges[0];
  const span = wholeMonths ? `${monthLabel(first.from.slice(0, 7))} – ${monthLabel(last.from.slice(0, 7))}` : `same dates, ${dayLabel(first.from)} – ${dayLabel(last.to)}`;
  return { from: last.from, to: last.to, ranges, avg: n, label: `Avg of last ${n} months (${span})` };
}

export function computePeriods(p) {
  const avg = Number((/^avg(\d+)$/.exec(p.mode === 'mom' ? p.compareMonth : p.compare) || [])[1]) || 0;
  if (p.mode === 'mom') {
    const [cy, cm] = p.month.split('-').map(Number);
    if (avg) {
      const curr = { from: `${p.month}-01`, to: toKey(new Date(cy, cm - 1, lastDay(cy, cm - 1))), label: monthLabel(p.month) };
      return { curr, prev: averagePrev(curr, avg, true) };
    }
    const [py, pm] = p.compareMonth.split('-').map(Number);
    return {
      curr: { from: `${p.month}-01`, to: toKey(new Date(cy, cm - 1, lastDay(cy, cm - 1))), label: monthLabel(p.month) },
      prev: { from: `${p.compareMonth}-01`, to: toKey(new Date(py, pm - 1, lastDay(py, pm - 1))), label: monthLabel(p.compareMonth) },
    };
  }
  const curr = { from: p.from, to: p.to };
  let prev;
  if (avg) {
    curr.label = rangeLabel(curr.from, curr.to);
    return { curr, prev: averagePrev(curr, avg, false) };
  }
  if (p.compare === 'custom') prev = { from: p.cFrom, to: p.cTo };
  else if (p.compare === 'prevPeriod') {
    const days = Math.round((parseKey(p.to) - parseKey(p.from)) / 864e5) + 1;
    prev = { from: toKey(addDays(parseKey(p.from), -days)), to: toKey(addDays(parseKey(p.from), -1)) };
  } else prev = { from: shiftMonth(p.from, -1), to: shiftMonth(p.to, -1) };
  curr.label = rangeLabel(curr.from, curr.to);
  prev.label = rangeLabel(prev.from, prev.to);
  return { curr, prev };
}

export function applyFilters(rows, f) {
  const sets = {};
  FILTER_DIMS.forEach((k) => { if (f[k]?.length) sets[k] = new Set(f[k]); });
  return rows.filter((r) => {
    for (const k in sets) if (!sets[k].has(k === 'source' ? r.source : DIM[k].get(r))) return false;
    if (f.exp === 'Yes' && !r.isExp) return false;
    if (f.exp === 'No' && r.isExp) return false;
    return true;
  });
}

export const inRange = (rows, { from, to }) => rows.filter((r) => r.dateKey >= from && r.dateKey <= to);

export function defaultPeriod(rows) {
  let max = '';
  for (const r of rows) if (r.dateKey > max) max = r.dateKey;
  const end = max ? parseKey(max) : new Date();
  const mk = toKey(end).slice(0, 7);
  const prevMk = toKey(new Date(end.getFullYear(), end.getMonth() - 1, 1)).slice(0, 7);
  return {
    mode: 'mtd', from: `${mk}-01`, to: toKey(end), compare: 'prevMonth',
    cFrom: `${prevMk}-01`, cTo: shiftMonth(toKey(end), -1),
    month: mk, compareMonth: prevMk,
  };
}
