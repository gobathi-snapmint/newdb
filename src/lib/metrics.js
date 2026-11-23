// Metric definitions, aggregation and delta attribution.
// All ratio metrics are recomputed from summed totals (never averaged row ratios).

export const BASE_FIELDS = ['sent', 'delivered', 'clicks', 'orders', 'cost', 'gtv', 'revenue'];

// good: +1 higher is better, -1 lower is better, 0 neutral
// kind: 'count' (additive), 'pct' (ratio x100, delta shown in pp), 'ratio' (₹ per unit)
export const METRICS = [
  { key: 'campaigns', label: 'Campaigns', short: 'Camps', kind: 'count', unit: 'n', good: 0, desc: 'Distinct campaign IDs with activity in the period' },
  { key: 'sent', label: 'Sent', kind: 'count', unit: 'n', good: 1, desc: 'Sum of Sent' },
  { key: 'delivered', label: 'Delivered', kind: 'count', unit: 'n', good: 1, desc: 'Sum of Delivered' },
  { key: 'clicks', label: 'Clicks', kind: 'count', unit: 'n', good: 1, desc: 'Sum of clicks' },
  { key: 'orders', label: 'Orders', kind: 'count', unit: 'n', good: 1, desc: 'Sum of OrderSuccess' },
  { key: 'deliveryRate', label: 'Delivery %', short: 'Del %', kind: 'pct', num: 'delivered', den: 'sent', good: 1, desc: 'Delivered ÷ Sent' },
  { key: 'ctr', label: 'CTR %', kind: 'pct', num: 'clicks', den: 'delivered', good: 1, desc: 'Clicks ÷ Delivered' },
  { key: 'cvr', label: 'CVR %', kind: 'pct', num: 'orders', den: 'clicks', good: 1, desc: 'Orders ÷ Clicks' },
  { key: 'cost', label: 'Cost', kind: 'count', unit: '₹', good: -1, desc: 'Sum of Cost' },
  { key: 'cpc', label: 'CPC', kind: 'ratio', num: 'cost', den: 'clicks', good: -1, desc: 'Cost ÷ Clicks' },
  { key: 'cpo', label: 'CPO', kind: 'ratio', num: 'cost', den: 'orders', good: -1, desc: 'Cost ÷ Orders' },
  { key: 'gtv', label: 'GTV', kind: 'count', unit: '₹', good: 1, desc: 'Sum of gtv_click_attr (click-attributed)' },
  { key: 'revenue', label: 'Revenue', kind: 'count', unit: '₹', good: 1, desc: 'Sum of revenue_click_attr (click-attributed)' },
  { key: 'cir', label: 'CIR %', kind: 'pct', num: 'cost', den: 'revenue', good: -1, desc: 'Cost ÷ Revenue (cost-to-income ratio)' },
];
export const METRIC = Object.fromEntries(METRICS.map((m) => [m.key, m]));

// Helper ratios used by the driver (funnel) breakdown.
const HELPERS = {
  costPerSent: { label: 'Cost / Sent', num: 'cost', den: 'sent', unit: '₹' },
  aov: { label: 'GTV / Order', num: 'gtv', den: 'orders', unit: '₹' },
  revPerOrder: { label: 'Revenue / Order', num: 'revenue', den: 'orders', unit: '₹' },
};

export function emptyAgg() {
  return { sent: 0, delivered: 0, clicks: 0, orders: 0, cost: 0, gtv: 0, revenue: 0, ids: new Set() };
}

export function addRow(a, r) {
  a.sent += r.sent; a.delivered += r.delivered; a.clicks += r.clicks; a.orders += r.orders;
  a.cost += r.cost; a.gtv += r.gtv; a.revenue += r.revenue; a.ids.add(r.source + r.id);
  return a;
}

export function aggregate(rows) {
  const a = emptyAgg();
  for (const r of rows) addRow(a, r);
  return a;
}

export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, emptyAgg());
    addRow(m.get(k), r);
  }
  return m;
}

const div = (n, d) => (d ? n / d : null);

export function value(agg, key) {
  if (!agg) return null;
  if (key === 'campaigns') return agg.ids ? agg.ids.size : 0;
  const m = METRIC[key] || HELPERS[key];
  if (!m) return agg[key] ?? null;
  if (m.num) {
    const v = div(agg[m.num], agg[m.den]);
    return v == null ? null : m.kind === 'pct' ? v * 100 : v;
  }
  return agg[key];
}

export function metricsOf(agg) {
  const o = {};
  METRICS.forEach((m) => { o[m.key] = value(agg, m.key); });
  return o;
}

// ---------- formatting ----------
const inr = (v, digits = 0) => v.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function compact(v) {
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return inr(v, a < 10 && a % 1 ? 2 : 0);
}

export function fmt(key, v, { short = false } = {}) {
  if (v == null || Number.isNaN(v)) return '—';
  const m = METRIC[key] || HELPERS[key] || {};
  if (m.kind === 'pct') return `${v.toFixed(2)}%`;
  if (m.kind === 'ratio' || m.unit === '₹') {
    if (m.kind === 'ratio' || HELPERS[key]) return `₹${inr(v, key === 'costPerSent' ? 4 : 2)}`;
    return `₹${short ? compact(v) : inr(v)}`;
  }
  return short ? compact(v) : inr(v);
}

// Absolute delta, e.g. "+1,234", "+₹12.40", "+0.35 pp"
export function fmtDelta(key, d, opts = {}) {
  if (d == null || Number.isNaN(d)) return '—';
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  const m = METRIC[key] || HELPERS[key] || {};
  if (m.kind === 'pct') return `${sign}${Math.abs(d).toFixed(2)} pp`;
  return sign + fmt(key, Math.abs(d), opts);
}

export function fmtPct(p) {
  if (p == null || !Number.isFinite(p)) return '—';
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`;
}

export function delta(curr, prev) {
  if (curr == null && prev == null) return { abs: null, pct: null };
  const c = curr ?? 0, p = prev ?? 0;
  return { abs: c - p, pct: p ? ((c - p) / Math.abs(p)) * 100 : null, isNew: !p && !!c };
}

// 'good' | 'bad' | 'flat' for colouring
export function tone(key, d) {
  const g = METRIC[key]?.good ?? 0;
  if (!d || !g || Math.abs(d) < 1e-9) return 'flat';
  return d * g > 0 ? 'good' : 'bad';
}

// ---------- attribution: where did the delta come from? ----------
/**
 * Splits the total change of `key` between groups so the contributions add up exactly.
 * - additive metrics: contribution = group's own change
 * - ratio metrics (R = N/D): contribution_i = N_i(curr)/D(curr) - N_i(prev)/D(prev)
 *   further split into
 *     rate effect = change in the group's own ratio, weighted by its average share of D
 *     mix effect  = change in the group's share of D, valued at its average ratio
 */
export function attribute(key, currGroups, prevGroups) {
  const m = METRIC[key];
  const keys = new Set([...currGroups.keys(), ...prevGroups.keys()]);
  const totC = sumGroups(currGroups), totP = sumGroups(prevGroups);
  const totalDelta = (value(totC, key) ?? 0) - (value(totP, key) ?? 0);
  const scale = m.kind === 'pct' ? 100 : 1;
  const rows = [];
  for (const g of keys) {
    const c = currGroups.get(g), p = prevGroups.get(g);
    const vc = c ? value(c, key) : null, vp = p ? value(p, key) : null;
    const row = { group: g, curr: vc, prev: vp, ...delta(vc, vp), currAgg: c, prevAgg: p };
    if (m.kind === 'count') {
      row.contrib = (vc ?? 0) - (vp ?? 0);
    } else {
      const Nc = c?.[m.num] ?? 0, Np = p?.[m.num] ?? 0, Dc = c?.[m.den] ?? 0, Dp = p?.[m.den] ?? 0;
      const TDc = totC[m.den], TDp = totP[m.den];
      row.contrib = scale * ((TDc ? Nc / TDc : 0) - (TDp ? Np / TDp : 0));
      const wc = TDc ? Dc / TDc : 0, wp = TDp ? Dp / TDp : 0;
      let rc = Dc ? Nc / Dc : null, rp = Dp ? Np / Dp : null;
      if (rc == null) rc = rp; if (rp == null) rp = rc;
      row.mix = rc == null ? 0 : scale * (wc - wp) * ((rc + rp) / 2);
      row.rate = row.contrib - row.mix;
      row.shareCurr = wc * 100; row.sharePrev = wp * 100;
    }
    row.share = totalDelta ? (row.contrib / totalDelta) * 100 : null;
    rows.push(row);
  }
  rows.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  return { rows, totalDelta, curr: value(totC, key), prev: value(totP, key), isRatio: m.kind !== 'count', denLabel: m.den ? METRIC[m.den]?.label || m.den : null };
}

function sumGroups(groups) {
  const a = emptyAgg();
  for (const g of groups.values()) {
    BASE_FIELDS.forEach((f) => { a[f] += g[f]; });
    g.ids.forEach((id) => a.ids.add(id));
  }
  return a;
}

// Funnel drivers: metric = product of factors (sign +1 multiplies, -1 divides).
const DRIVERS = {
  sent: null,
  delivered: [['sent', 1], ['deliveryRate', 1]],
  clicks: [['sent', 1], ['deliveryRate', 1], ['ctr', 1]],
  orders: [['sent', 1], ['deliveryRate', 1], ['ctr', 1], ['cvr', 1]],
  cost: [['sent', 1], ['costPerSent', 1]],
  gtv: [['orders', 1], ['aov', 1]],
  revenue: [['orders', 1], ['revPerOrder', 1]],
  ctr: null,
  cpc: [['costPerSent', 1], ['deliveryRate', -1], ['ctr', -1]],
  cpo: [['costPerSent', 1], ['deliveryRate', -1], ['ctr', -1], ['cvr', -1]],
  cir: [['costPerSent', 1], ['deliveryRate', -1], ['ctr', -1], ['cvr', -1], ['revPerOrder', -1]],
};

export const driverLabel = (k) => METRIC[k]?.label || HELPERS[k]?.label || k;

/**
 * Log-mean (LMDI) split of a multiplicative metric's change across its funnel factors.
 * Contributions add up exactly to the total change.
 */
export function drivers(key, currAgg, prevAgg) {
  const spec = DRIVERS[key];
  if (!spec) return null;
  const mc = value(currAgg, key), mp = value(prevAgg, key);
  if (!mc || !mp || mc === mp) return null;
  const L = (mc - mp) / Math.log(mc / mp);
  const out = [];
  for (const [f, sign] of spec) {
    const fc = value(currAgg, f), fp = value(prevAgg, f);
    if (!fc || !fp) return null;
    out.push({ factor: f, label: driverLabel(f), curr: fc, prev: fp, pct: ((fc - fp) / fp) * 100, sign, contrib: L * sign * Math.log(fc / fp) });
  }
  return { total: mc - mp, factors: out };
}

// Plain-English summary of a metric change.
export function narrative(key, att, drv, dimLabel) {
  const m = METRIC[key];
  if (att.curr == null && att.prev == null) return 'No data in either period.';
  const d = delta(att.curr, att.prev);
  const dir = d.abs > 0 ? 'increased' : d.abs < 0 ? 'decreased' : 'did not change';
  const parts = [`${m.label} ${dir} from ${fmt(key, att.prev)} to ${fmt(key, att.curr)} (${fmtDelta(key, d.abs)}${d.pct != null ? `, ${fmtPct(d.pct)}` : ''}).`];
  if (drv && drv.factors.length) {
    const top = [...drv.factors].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))[0];
    const moved = top.pct > 0 ? 'rose' : 'fell';
    parts.push(`Biggest funnel driver: ${top.label} ${moved} ${Math.abs(top.pct).toFixed(1)}% (${fmt(top.factor, top.prev)} → ${fmt(top.factor, top.curr)}), worth ${fmtDelta(key, top.contrib)} of the change.`);
  }
  const top = att.rows.filter((r) => Math.abs(r.contrib) > 1e-9).slice(0, 2);
  if (top.length && d.abs) {
    const txt = top.map((r) => {
      let s = `${r.group} (${fmtDelta(key, r.contrib)}${r.share != null ? `, ${Math.round(r.share)}% of the change` : ''}`;
      if (att.isRatio && r.rate != null) {
        const main = Math.abs(r.rate) >= Math.abs(r.mix) ? `mostly its own ${m.label} moving` : `mostly its share of ${att.denLabel} shifting`;
        s += ` — ${main}`;
      }
      return s + ')';
    });
    parts.push(`By ${dimLabel.toLowerCase()}, the largest contributors were ${txt.join(' and ')}.`);
  }
  return parts.join(' ');
}
