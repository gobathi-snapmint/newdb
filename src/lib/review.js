// Data for the Review Report: one section per metric, each with the overall move,
// a day-by-day trend (current vs previous period, aligned by day) and breakdowns
// by product line, channel, audience and campaign type.
import { METRIC, aggregate, attribute, delta, emptyAgg, addRow, fmt, fmtDelta, fmtPct, groupBy, value } from './metrics';
import { DIM, dayLabel, monthLabel } from './filters';

export const REVIEW_METRICS = ['cost', 'sent', 'delivered', 'clicks', 'orders', 'gtv', 'deliveryRate', 'ctr', 'cvr', 'cir', 'cpo'];
export const EXTRA_METRICS = ['revenue', 'cpc', 'campaigns'];
export const REVIEW_DIMS = ['product', 'channel', 'audience', 'campaignType'];
export const DIM_TITLE = { product: 'Product line', channel: 'Channel', audience: 'Audience', campaignType: 'Type of campaign', segment: 'Segment' };

export const sectionTitle = (k) => (k === 'cost' ? 'Targeting – Cost' : METRIC[k].label);
export const overallTitle = (k) => (k === 'cost' ? 'Overall spends' : `Overall ${METRIC[k].label}`);

const DAY = 864e5;
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const offset = (from, k) => Math.round((parse(k) - parse(from)) / DAY);

function mergeAggs(list) {
  const a = emptyAgg();
  list.forEach((g) => {
    ['sent', 'delivered', 'clicks', 'orders', 'cost', 'gtv', 'revenue'].forEach((f) => { a[f] += g[f]; });
    g.ids.forEach((id) => a.ids.add(id));
    if (g.w) a.w = g.w;
  });
  return a;
}

// Trend buckets: day N of the current period vs day N of the previous one (weekly when the period is long).
function trendOf(curr, prev, periods) {
  const days = offset(periods.curr.from, periods.curr.to) + 1;
  const step = days > 62 ? 7 : 1;
  const n = Math.ceil(days / step);
  const c = Array.from({ length: n }, emptyAgg), p = Array.from({ length: n }, emptyAgg);
  curr.forEach((r) => { const i = Math.floor(offset(periods.curr.from, r.dateKey) / step); if (c[i]) addRow(c[i], r); });
  prev.forEach((r) => { const i = Math.floor(offset(periods.prev.from, r.dateKey) / step); if (p[i]) addRow(p[i], r); });
  const label = (i) => {
    if (step === 7) return `Wk ${i + 1}`;
    const d = new Date(parse(periods.curr.from).getTime() + i * DAY);
    return dayLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`).replace(/ \d\d$/, '');
  };
  return { step, buckets: c.map((agg, i) => ({ label: label(i), c: agg, p: p[i] })) };
}

/**
 * Builds the whole report. Each breakdown keeps the top `topN` groups by volume
 * (sent for rate metrics, the metric itself for counts) and folds the rest into "Others".
 */
export function buildReport(curr, prev, periods, { metrics = REVIEW_METRICS, dims = REVIEW_DIMS, topN = 8 } = {}) {
  const cA = aggregate(curr), pA = aggregate(prev);
  const trend = trendOf(curr, prev, periods);
  const groups = Object.fromEntries(dims.map((d) => [d, { c: groupBy(curr, DIM[d].get), p: groupBy(prev, DIM[d].get) }]));

  const sections = metrics.map((key) => {
    const m = METRIC[key];
    const isCount = m.kind === 'count';
    const overall = { curr: value(cA, key), prev: value(pA, key), ...delta(value(cA, key), value(pA, key)) };
    const breakdowns = dims.map((dim) => {
      const { c, p } = groups[dim];
      const att = attribute(key, c, p);
      const sizeKey = isCount ? key : 'sent';
      const size = (r) => (r.currAgg ? value(r.currAgg, sizeKey) || 0 : 0) + (r.prevAgg ? value(r.prevAgg, sizeKey) || 0 : 0) * 0.001;
      const sorted = [...att.rows].sort((a, b) => size(b) - size(a));
      let rows = sorted.slice(0, topN);
      const rest = sorted.slice(topN);
      if (rest.length) {
        const ca = mergeAggs(rest.filter((r) => r.currAgg).map((r) => r.currAgg));
        const pa = mergeAggs(rest.filter((r) => r.prevAgg).map((r) => r.prevAgg));
        const vc = value(ca, key), vp = value(pa, key);
        rows.push({ group: `Others (${rest.length})`, curr: vc, prev: vp, ...delta(vc, vp), contrib: rest.reduce((s, r) => s + r.contrib, 0), currAgg: ca, prevAgg: pa, others: true });
      }
      const totSentC = cA.sent || 1, totSentP = pA.sent || 1;
      rows = rows.map((r) => ({
        group: r.group, curr: r.curr, prev: r.prev, abs: r.abs, pct: r.pct, isNew: r.isNew, contrib: r.contrib, others: r.others,
        shareCurr: isCount ? (overall.curr ? ((r.curr || 0) / overall.curr) * 100 : null) : ((r.currAgg?.sent || 0) / totSentC) * 100,
        sharePrev: isCount ? (overall.prev ? ((r.prev || 0) / overall.prev) * 100 : null) : ((r.prevAgg?.sent || 0) / totSentP) * 100,
      }));
      return { dim, title: DIM_TITLE[dim], rows, summary: summarise(key, att.rows, dim) };
    });
    const points = trend.buckets.map((b) => ({ label: b.label, curr: value(b.c, key), prev: value(b.p, key) }));
    return { key, title: sectionTitle(key), overallTitle: overallTitle(key), overall, trend: points, trendStep: trend.step, breakdowns, isCount };
  });
  return { sections, periodLabel: `${periods.curr.label} vs ${periods.prev.label}`, curr: periods.curr.label, prev: periods.prev.label };
}

// One auto line per breakdown: which group moved the metric most each way.
function summarise(key, rows, dim) {
  const real = rows.filter((r) => Math.abs(r.contrib) > 1e-9);
  if (!real.length) return '';
  const up = [...real].sort((a, b) => b.contrib - a.contrib)[0];
  const down = [...real].sort((a, b) => a.contrib - b.contrib)[0];
  const opt = { short: true };
  const bit = (r) => `${r.group} (${fmtDelta(key, r.contrib, opt)}${r.pct != null ? `, own ${fmtPct(r.pct)}` : r.isNew ? ', new' : ''})`;
  const parts = [];
  if (up.contrib > 0) parts.push(`biggest push up: ${bit(up)}`);
  if (down.contrib < 0) parts.push(`biggest pull down: ${bit(down)}`);
  return parts.length ? `By ${DIM_TITLE[dim].toLowerCase()} — ${parts.join('; ')}.` : '';
}

// Draft text for a metric's insight box, built from the numbers (the user edits it).
export function draftSection(s, prevLabel, currLabel) {
  const o = s.overall;
  const lines = [`${s.overallTitle}: ${fmt(s.key, o.prev)} (${prevLabel}) → ${fmt(s.key, o.curr)} (${currLabel}), ${fmtDelta(s.key, o.abs)} (${fmtPct(o.pct)}).`];
  s.breakdowns.forEach((b) => { if (b.summary) lines.push(`• ${b.summary}`); });
  return lines.join('\n');
}

export const SCOPE_KPIS = ['sent', 'orders', 'cost', 'cpo', 'ctr', 'cvr', 'cir'];
export function scopeKpis(curr, prev) {
  const cA = aggregate(curr), pA = aggregate(prev);
  return SCOPE_KPIS.map((k) => ({ key: k, label: METRIC[k].label, curr: value(cA, k), prev: value(pA, k), ...delta(value(cA, k), value(pA, k)) }));
}

export const scopeTitle = (s) => (s.product ? `${s.product}${s.audience ? ` ${s.audience}` : ''}` : s.audience ? `Overall ${s.audience}` : 'Overall');
export const scopeFilter = (s) => (r) => (!s.product || r.product === s.product) && (!s.audience || r.audience === s.audience);

// ---------- Month-on-month (trend) report ----------
const pad2 = (n) => String(n).padStart(2, '0');
const lastDayOf = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };

/**
 * Month windows from `from` to `to` (month keys).
 * sameDates: every month uses day 1..D, where D is the last day with data in the final month (MTD-style, like for like).
 * Otherwise full months; a month that is still running is cut at the latest data date and marked MTD.
 */
export function monthRanges(months, from, to, sameDates, maxDate) {
  const sel = months.filter((m) => m >= from && m <= to);
  if (!sel.length) return [];
  const latest = maxDate.slice(0, 7), dataDay = +maxDate.slice(8);
  const endMonth = sel[sel.length - 1];
  const D = endMonth === latest ? dataDay : lastDayOf(endMonth);
  return sel.map((mk) => {
    const last = lastDayOf(mk);
    let end = last, tag = '';
    if (sameDates && D < lastDayOf(endMonth)) { end = Math.min(D, last); tag = ` (1–${end})`; }
    else if (mk === latest && dataDay < last) { end = dataDay; tag = ' (MTD)'; }
    return { key: mk, label: `${monthLabel(mk)}${tag}`, short: monthLabel(mk), from: `${mk}-01`, to: `${mk}-${pad2(end)}` };
  });
}

function bucketByMonth(rows, ranges) {
  const idx = new Map(ranges.map((r, i) => [r.key, i]));
  const out = ranges.map(() => []);
  rows.forEach((r) => {
    const i = idx.get(r.dateKey.slice(0, 7));
    if (i != null && r.dateKey <= ranges[i].to) out[i].push(r);
  });
  return out;
}

const pctChange = (a, b) => (a == null || b == null || !b ? null : ((a - b) / Math.abs(b)) * 100);

export function buildTrendReport(rows, ranges, { metrics = REVIEW_METRICS, dims = REVIEW_DIMS, topN = 8 } = {}) {
  const byMonth = bucketByMonth(rows, ranges);
  const aggs = byMonth.map(aggregate);
  const groups = Object.fromEntries(dims.map((d) => [d, byMonth.map((rs) => groupBy(rs, DIM[d].get))]));
  const first = 0, last = ranges.length - 1;

  const sections = metrics.map((key) => {
    const m = METRIC[key];
    const isCount = m.kind === 'count';
    const values = aggs.map((a) => (a.sent || a.cost ? value(a, key) : null));
    const breakdowns = dims.map((dim) => {
      const maps = groups[dim];
      const names = new Set(maps.flatMap((g) => [...g.keys()]));
      const sizeKey = isCount ? key : 'sent';
      const size = (g) => maps.reduce((s, mp) => s + (mp.has(g) ? value(mp.get(g), sizeKey) || 0 : 0), 0);
      const sorted = [...names].sort((a, b) => size(b) - size(a));
      const top = sorted.slice(0, topN), rest = sorted.slice(topN);
      const series = top.map((g) => ({ group: g, values: maps.map((mp) => (mp.has(g) ? value(mp.get(g), key) : null)) }));
      if (rest.length) {
        series.push({ group: `Others (${rest.length})`, others: true, values: maps.map((mp) => {
          const list = rest.filter((g) => mp.has(g)).map((g) => mp.get(g));
          return list.length ? value(mergeAggs(list), key) : null;
        }) });
      }
      series.forEach((s) => { s.change = pctChange(s.values[last], s.values[first]); s.mom = last > 0 ? pctChange(s.values[last], s.values[last - 1]) : null; });
      let summary = '';
      if (last > 0) {
        const att = attribute(key, maps[last], maps[first]).rows.filter((r) => Math.abs(r.contrib) > 1e-9);
        const up = [...att].sort((a, b) => b.contrib - a.contrib)[0], down = [...att].sort((a, b) => a.contrib - b.contrib)[0];
        const bit = (r) => `${r.group} (${fmtDelta(key, r.contrib, { short: true })})`;
        const parts = [];
        if (up?.contrib > 0) parts.push(`biggest push up ${bit(up)}`);
        if (down?.contrib < 0) parts.push(`biggest pull down ${bit(down)}`);
        if (parts.length) summary = `By ${DIM_TITLE[dim].toLowerCase()}, ${ranges[first].short} → ${ranges[last].short}: ${parts.join('; ')}.`;
      }
      return { dim, title: DIM_TITLE[dim], series, summary };
    });
    return { key, title: sectionTitle(key), overallTitle: overallTitle(key), isCount, values, breakdowns };
  });
  return {
    mode: 'trend', ranges, sections,
    periodLabel: `${ranges[0]?.label} → ${ranges[last]?.label}, month on month`,
  };
}

// Draft for a trend section's insight box.
export function draftTrendSection(s, ranges) {
  const v = s.values, n = v.length - 1;
  const lines = [];
  const ok = v.map((x, i) => [x, i]).filter(([x]) => x != null);
  if (ok.length) {
    const hi = ok.reduce((a, b) => (b[0] > a[0] ? b : a)), lo = ok.reduce((a, b) => (b[0] < a[0] ? b : a));
    lines.push(`${s.overallTitle}: ${fmt(s.key, v[0])} in ${ranges[0].short} → ${fmt(s.key, v[n])} in ${ranges[n].short} (${fmtPct(pctChange(v[n], v[0]))}). Highest in ${ranges[hi[1]].short} (${fmt(s.key, hi[0])}), lowest in ${ranges[lo[1]].short} (${fmt(s.key, lo[0])}).`);
    if (n > 0) lines.push(`Latest month vs the one before: ${fmtPct(pctChange(v[n], v[n - 1]))}.`);
  }
  s.breakdowns.forEach((b) => { if (b.summary) lines.push(`• ${b.summary}`); });
  return lines.join('\n');
}

export function scopeTrend(rows, ranges) {
  const aggs = bucketByMonth(rows, ranges).map(aggregate);
  return SCOPE_KPIS.map((k) => ({ key: k, label: METRIC[k].label, values: aggs.map((a) => (a.sent || a.cost ? value(a, k) : null)) }));
}

export function draftScopeTrend(kpis, ranges) {
  const n = ranges.length - 1;
  return kpis.map((k) => `• ${k.label}: ${fmt(k.key, k.values[0], { short: true })} (${ranges[0].short}) → ${fmt(k.key, k.values[n], { short: true })} (${ranges[n].short}), ${fmtPct(pctChange(k.values[n], k.values[0]))}${n > 0 ? `; last month ${fmtPct(pctChange(k.values[n], k.values[n - 1]))}` : ''}`).join('\n');
}

export { pctChange };
