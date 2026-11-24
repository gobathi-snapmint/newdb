// Auto-generated storyboard: for a scope (e.g. "MKP · NU") explain how the period moved and why,
// using rule-based checks on volume, targeting mix, like-for-like segments, channels and the funnel.
import { METRIC, aggregate, attribute, delta, drivers, fmt, fmtDelta, fmtPct, groupBy, value } from './metrics';
import { DIM } from './filters';

export const KPI_KEYS = ['campaigns', 'sent', 'deliveryRate', 'ctr', 'cvr', 'orders', 'cost', 'cpc', 'cpo', 'revenue', 'cir'];
export const FOCUS_METRICS = ['cpo', 'cir', 'ctr', 'cvr', 'cpc'];

// A change smaller than this (in %) is treated as "flat" in the text
const FLAT = 3;
// Thresholds for raising a check as a likely issue
const T = { sentPct: 5, ratePct: 5, deliveryPp: 3, cpsPct: 5, minShare: 5, expPp: 5 };

const pct = (c, p) => (p ? ((c - p) / Math.abs(p)) * 100 : null);
const pp = (v) => `${v.toFixed(1)}%`;
const move = (p) => (p == null ? 'changed' : Math.abs(p) < FLAT ? 'was flat' : p > 0 ? `rose ${Math.abs(p).toFixed(1)}%` : `fell ${Math.abs(p).toFixed(1)}%`);
// 'bad' / 'good' for a change of metric k
const toneOf = (k, d) => {
  const g = METRIC[k]?.good ?? (k === 'costPerSent' ? -1 : 1);
  if (!d || Math.abs(d) < 1e-9) return 'info';
  return d * g > 0 ? 'good' : 'bad';
};
const v = (a, k) => value(a, k);

/** Build the chapter list: Overall, Overall × audience, then each product with its audiences. */
export function chapterScopes({ products, audiences, levels }) {
  const out = [];
  if (levels.overall) out.push({ id: 'overall', title: 'Overall', crumbs: ['All products', 'All audiences'], depth: 0 });
  if (levels.overallAudience) audiences.forEach((a) => out.push({ id: `overall-${a}`, title: `Overall · ${a}`, audience: a, depth: 1 }));
  products.forEach((p) => {
    if (levels.product) out.push({ id: `${p}`, title: `${p} · Overall`, product: p, depth: 0 });
    if (levels.productAudience) audiences.forEach((a) => out.push({ id: `${p}-${a}`, title: `${p} · ${a}`, product: p, audience: a, depth: 1 }));
  });
  return out;
}

export const inScope = (s) => (r) => (!s.product || r.product === s.product) && (!s.audience || r.audience === s.audience);

/** Analyse one scope. Returns KPIs, a headline, findings and contribution tables. */
export function analyseScope(curr, prev, focus) {
  const cA = aggregate(curr), pA = aggregate(prev);
  const fm = METRIC[focus];
  const kpis = KPI_KEYS.map((k) => ({ key: k, curr: v(cA, k), prev: v(pA, k), ...delta(v(cA, k), v(pA, k)) }));
  const K = Object.fromEntries(kpis.map((x) => [x.key, x]));
  const findings = [];
  const add = (area, tone, text, check) => findings.push({ area, tone, text, check });

  if (!curr.length && !prev.length) return { empty: true, kpis, findings, headline: 'No data in either period.' };
  if (!curr.length) return { empty: true, kpis, findings, headline: 'Nothing was sent in the current period (it ran only in the previous period).' };
  if (!prev.length) return { empty: true, kpis, findings, headline: 'New in the current period — nothing to compare against.' };

  const by = (dim, rows) => groupBy(rows, DIM[dim].get);
  const ch = { c: by('channel', curr), p: by('channel', prev) };
  const sg = { c: by('segment', curr), p: by('segment', prev) };

  // ---- headline ----
  const drv = drivers(focus, cA, pA);
  const topDrv = drv ? [...drv.factors].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))[0] : null;
  const sentP = K.sent.pct, ordP = K.orders.pct;
  let verdict;
  if (sentP != null && ordP != null) {
    const yieldPct = ((1 + ordP / 100) / (1 + sentP / 100) - 1) * 100;
    if (Math.abs(sentP) < FLAT && Math.abs(ordP) >= FLAT) verdict = `Volume was steady, so the move in orders came from funnel efficiency (orders per message ${move(yieldPct)}).`;
    else if (Math.abs(yieldPct) < FLAT) verdict = 'Orders moved in line with sent volume — orders per message held.';
    else verdict = `Orders per message ${move(yieldPct)} — each message produced ${yieldPct < 0 ? 'fewer' : 'more'} orders, so efficiency, not just volume, is behind the ${ordP < 0 ? 'drop' : 'change'}.`;
  }
  const headline = [
    `${fm.label} ${move(K[focus].pct)} (${fmt(focus, K[focus].prev)} → ${fmt(focus, K[focus].curr)}, ${fmtDelta(focus, K[focus].abs)}).`,
    `Orders ${move(ordP)} (${fmt('orders', K.orders.prev)} → ${fmt('orders', K.orders.curr)}) on sent volume that ${move(sentP)}; cost ${move(K.cost.pct)}.`,
    verdict,
    topDrv && `Main funnel driver of ${fm.label}: ${topDrv.label} ${move(topDrv.pct)} (${fmt(topDrv.factor, topDrv.prev)} → ${fmt(topDrv.factor, topDrv.curr)}), worth ${fmtDelta(focus, topDrv.contrib)}${topDrv.factor === 'costPerSent' ? ' — so this is mainly about what we paid per message, not about conversion' : ''}.`,
  ].filter(Boolean).join(' ');

  // ---- 1. volume ----
  const sentByCh = attribute('sent', ch.c, ch.p).rows[0];
  const sentBySeg = attribute('sent', sg.c, sg.p).rows[0];
  if (sentP != null) {
    const parts = [`Sent ${move(sentP)} (${fmt('sent', K.sent.prev, { short: true })} → ${fmt('sent', K.sent.curr, { short: true })}).`];
    if (sentByCh && Math.abs(sentByCh.contrib) > 0) parts.push(`Biggest volume swing by channel: ${sentByCh.group} (${fmtDelta('sent', sentByCh.contrib, { short: true })}); by segment: ${sentBySeg.group} (${fmtDelta('sent', sentBySeg.contrib, { short: true })}).`);
    const fpc = v(cA, 'sent') / (K.campaigns.curr || 1), fpp = v(pA, 'sent') / (K.campaigns.prev || 1);
    parts.push(`Campaigns ${K.campaigns.prev} → ${K.campaigns.curr}; sent per campaign ${move(pct(fpc, fpp))}.`);
    const fatigue = sentP > T.sentPct && K.ctr.pct != null && K.ctr.pct < -T.ratePct;
    if (fatigue) parts.push(`Sends went up while CTR dropped ${Math.abs(K.ctr.pct).toFixed(1)}% — a sign of over-messaging / audience fatigue or of the extra volume going to colder users.`);
    add('Sent volume', fatigue ? 'bad' : Math.abs(sentP) < T.sentPct ? 'info' : toneOf('orders', ordP), parts.join(' '),
      fatigue ? 'Check frequency caps and how many messages each user got; compare CTR of the incremental volume.' : null);
  }

  // ---- 2. targeting mix (who/where we sent) ----
  const mixDims = [['segment', sg], ['channel', ch]];
  const firstRow = curr[0];
  if (curr.some((r) => r.audience !== firstRow.audience)) mixDims.unshift(['audience', { c: by('audience', curr), p: by('audience', prev) }]);
  if (curr.some((r) => r.product !== firstRow.product)) mixDims.unshift(['product', { c: by('product', curr), p: by('product', prev) }]);
  const mixSummary = mixDims.map(([dim, g]) => {
    const att = attribute(focus, g.c, g.p);
    const mix = att.rows.reduce((s, r) => s + (r.mix || 0), 0);
    const top = [...att.rows].sort((a, b) => Math.abs(b.mix || 0) - Math.abs(a.mix || 0))[0];
    return { dim, att, mix, top };
  });
  const bigMix = [...mixSummary].sort((a, b) => Math.abs(b.mix) - Math.abs(a.mix))[0];
  if (bigMix && K[focus].abs) {
    const share = (bigMix.mix / K[focus].abs) * 100;
    const t = bigMix.top;
    const text = `Targeting mix: shifting the ${DIM[bigMix.dim].label.toLowerCase()} mix accounts for ${fmtDelta(focus, bigMix.mix)} (${Math.round(share)}% of the ${fm.label} change). ` +
      (t && Math.abs(t.mix) > 1e-9 ? `Largest shift: ${t.group} went from ${pp(t.sharePrev)} to ${pp(t.shareCurr)} of ${bigMix.att.denLabel} at ${fm.label} ${fmt(focus, t.curr ?? t.prev)} vs ${fmt(focus, K[focus].curr)} overall (${fmtDelta(focus, t.mix)}).` : '') +
      ` The rest (${fmtDelta(focus, K[focus].abs - bigMix.mix)}) is performance within the same groups.`;
    add('Targeting mix', Math.abs(share) < 25 ? 'info' : toneOf(focus, bigMix.mix), text,
      Math.abs(share) >= 25 && toneOf(focus, bigMix.mix) === 'bad' ? `Review the targeting change for ${t?.group}: was more volume pushed to a weaker ${DIM[bigMix.dim].label.toLowerCase()} on purpose?` : null);
  }

  // ---- 3. same segment (like-for-like) ----
  const seg = DIM.segment.get;
  const lflC = curr.filter((r) => sg.p.has(seg(r))), lflP = prev.filter((r) => sg.c.has(seg(r)));
  const newRows = curr.filter((r) => !sg.p.has(seg(r))), goneRows = prev.filter((r) => !sg.c.has(seg(r)));
  const lflA = { c: aggregate(lflC), p: aggregate(lflP) };
  const lc = v(lflA.c, focus), lp = v(lflA.p, focus), lPct = pct(lc, lp);
  const nShare = (newRows.reduce((s, r) => s + r.sent, 0) / (v(cA, 'sent') || 1)) * 100;
  const gShare = (goneRows.reduce((s, r) => s + r.sent, 0) / (v(pA, 'sent') || 1)) * 100;
  const nSeg = new Set(newRows.map(seg)), gSeg = new Set(goneRows.map(seg));
  {
    const parts = [`Like-for-like (${[...sg.c.keys()].filter((k) => sg.p.has(k)).length} segments run in both periods): ${fm.label} ${fmt(focus, lp)} → ${fmt(focus, lc)} (${fmtPct(lPct)}).`];
    if (nSeg.size) parts.push(`New segments (${[...nSeg].slice(0, 4).join(', ')}${nSeg.size > 4 ? '…' : ''}) took ${pp(nShare)} of sent at ${fm.label} ${fmt(focus, v(aggregate(newRows), focus))}.`);
    if (!nSeg.size && !gSeg.size) parts.push('Every segment ran in both periods, so the segment list itself did not change.');
    if (gSeg.size) parts.push(`Dropped segments (${[...gSeg].slice(0, 4).join(', ')}${gSeg.size > 4 ? '…' : ''}) were ${pp(gShare)} of sent at ${fm.label} ${fmt(focus, v(aggregate(goneRows), focus))}.`);
    const overallPct = K[focus].pct;
    let tone = 'info', check = null;
    if (overallPct != null && Math.abs(overallPct) >= FLAT) {
      if (lPct != null && Math.abs(lPct) < Math.abs(overallPct) / 2) {
        parts.push('The same segments performed about the same, so most of the change came from targeting different segments.');
        tone = toneOf(focus, K[focus].abs);
        if (tone === 'bad') check = 'Compare the new segments’ performance before scaling them; consider restoring the dropped segments.';
      } else {
        parts.push('The same segments performed differently, so the change is not just who was targeted — look at creative, offer, channel or timing.');
        tone = toneOf(focus, lc - lp);
        const worst = attribute(focus, groupBy(lflC, seg), groupBy(lflP, seg)).rows
          .filter((r) => r.rate != null && toneOf(focus, r.rate) === 'bad').sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))[0];
        if (worst && tone === 'bad') check = `Start with segment ${worst.group}: its own ${fm.label} went ${fmt(focus, worst.prev)} → ${fmt(focus, worst.curr)} (${fmtDelta(focus, worst.rate)} on the total).`;
      }
    }
    add('Same segment', tone, parts.join(' '), check);
  }

  // ---- 4. channel ----
  const chAtt = attribute(focus, ch.c, ch.p);
  const topCh = chAtt.rows[0];
  if (topCh && Math.abs(topCh.contrib) > 1e-9) {
    const own = Math.abs(topCh.rate ?? topCh.contrib) >= Math.abs(topCh.mix ?? 0);
    const text = `${topCh.group} is the largest channel contributor (${fmtDelta(focus, topCh.contrib)}${topCh.share != null ? `, ${Math.round(topCh.share)}% of the change` : ''}) — ` +
      (own ? `its own ${fm.label} went ${fmt(focus, topCh.prev)} → ${fmt(focus, topCh.curr)}.` : `mostly because its share of ${chAtt.denLabel} moved ${pp(topCh.sharePrev)} → ${pp(topCh.shareCurr)}.`);
    const tone = toneOf(focus, topCh.contrib);
    add('Channel', tone, text, tone === 'bad' && own ? `Dig into ${topCh.group}: template / creative changes, send times, cost per message and vendor issues.` : null);
  }
  // delivery problems per channel
  for (const [name, a] of ch.c) {
    const p = ch.p.get(name);
    if (!p) continue;
    const dc = v(a, 'deliveryRate'), dp = v(p, 'deliveryRate');
    const share = (a.sent / (cA.sent || 1)) * 100;
    if (dc != null && dp != null && share >= T.minShare && Math.abs(dc - dp) >= T.deliveryPp) {
      const bad = dc < dp;
      add('Delivery', bad ? 'bad' : 'good', `${name} delivery ${bad ? 'fell' : 'improved'} ${Math.abs(dc - dp).toFixed(1)} pp (${pp(dp)} → ${pp(dc)}) on ${pp(share)} of sent.`,
        bad ? `Check ${name} delivery: invalid / stale contacts, DND, template approvals, vendor routing or throttling.` : null);
    }
  }

  // ---- 5. engagement and conversion ----
  const rateCheck = (k, area, why) => {
    const x = K[k];
    if (x.pct == null || Math.abs(x.pct) < T.ratePct) return;
    const att = attribute(k, ch.c, ch.p);
    const satt = attribute(k, sg.c, sg.p);
    const bad = toneOf(k, x.abs) === 'bad';
    const pick = (rows) => rows.filter((r) => (r.rate != null) && toneOf(k, r.rate) === toneOf(k, x.abs)).sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))[0];
    const c1 = pick(att.rows), s1 = pick(satt.rows);
    add(area, bad ? 'bad' : 'good',
      `${METRIC[k].label} ${move(x.pct)} (${fmt(k, x.prev)} → ${fmt(k, x.curr)}).` +
      (c1 ? ` Led by ${c1.group} (${fmt(k, c1.prev)} → ${fmt(k, c1.curr)})` : '') + (s1 ? ` and segment ${s1.group} (${fmt(k, s1.prev)} → ${fmt(k, s1.curr)}).` : '.'),
      bad ? why : null);
  };
  rateCheck('ctr', 'Engagement (CTR)', 'Possible creative / content fatigue, weaker offer in the message, a bad send time, or broader (colder) targeting.');
  rateCheck('cvr', 'Conversion (CVR)', 'Post-click problem: landing page, offer / pricing, product availability, eligibility or payment drop-offs.');

  // ---- 6. unit cost ----
  const cpsC = v(cA, 'costPerSent'), cpsP = v(pA, 'costPerSent'), cpsPct = pct(cpsC, cpsP);
  if (cpsPct != null && Math.abs(cpsPct) >= T.cpsPct) {
    // Counterfactual: current channel shares at previous per-channel unit cost isolates the channel-mix part
    let mixCps = 0;
    for (const [name, a] of ch.c) {
      const p = ch.p.get(name);
      mixCps += (a.sent / (cA.sent || 1)) * (p ? v(p, 'costPerSent') : v(a, 'costPerSent'));
    }
    const mixPart = mixCps - cpsP, ratePart = cpsC - mixCps;
    const bad = cpsC > cpsP;
    add('Unit cost', bad ? 'bad' : 'good',
      `Cost per sent ${move(cpsPct)} (${fmt('costPerSent', cpsP)} → ${fmt('costPerSent', cpsC)}): ${fmtDelta('costPerSent', mixPart)} from channel mix and ${fmtDelta('costPerSent', ratePart)} from per-channel prices.`,
      bad ? (Math.abs(mixPart) > Math.abs(ratePart) ? 'Volume moved to costlier channels — check if the expensive channel earned its extra share.' : 'Per-message prices went up — check vendor rates / message length / template category.') : null);
  }

  // ---- 7. revenue per order (drives CIR) ----
  if (focus === 'cir') {
    const rc = v(cA, 'revPerOrder'), rp = v(pA, 'revPerOrder'), rPct = pct(rc, rp);
    if (rPct != null && Math.abs(rPct) >= T.ratePct) add('Revenue per order', rPct > 0 ? 'good' : 'bad', `Revenue per order ${move(rPct)} (${fmt('revPerOrder', rp)} → ${fmt('revPerOrder', rc)}).`, rPct < 0 ? 'Smaller baskets or a cheaper product mix — check the product / offer mix behind the orders.' : null);
  }

  // ---- 8. experiments ----
  const expShare = (a, rows) => (rows.filter((r) => r.isExp).reduce((s, r) => s + r.sent, 0) / (a.sent || 1)) * 100;
  const ec = expShare(cA, curr), ep = expShare(pA, prev);
  if (Math.abs(ec - ep) >= T.expPp) {
    const ex = aggregate(curr.filter((r) => r.isExp)), bau = aggregate(curr.filter((r) => !r.isExp));
    add('Experiments', 'info', `Experimental share of sent moved ${pp(ep)} → ${pp(ec)}. Current ${fm.label}: experiments ${fmt(focus, v(ex, focus))} vs BAU ${fmt(focus, v(bau, focus))}.`);
  }

  return {
    kpis, K, headline, findings, drv, topDrv,
    contrib: { channel: chAtt, segment: attribute(focus, sg.c, sg.p) },
    issues: findings.filter((f) => f.tone === 'bad').length,
  };
}

/** Markdown version of the storyboard for sharing. */
export function storyboardMarkdown(chapters, { focus, periodLabel }) {
  const lines = [`# CRM storyboard — ${METRIC[focus].label}`, '', periodLabel, ''];
  chapters.forEach((c) => {
    const a = c.analysis;
    lines.push(`${c.depth ? '###' : '##'} ${c.num} ${c.title}`, '', a.headline, '');
    if (!a.empty) {
      lines.push(`| Metric | Previous | Current | Δ | Δ % |`, '| --- | ---: | ---: | ---: | ---: |');
      a.kpis.forEach((k) => lines.push(`| ${METRIC[k.key].label} | ${fmt(k.key, k.prev)} | ${fmt(k.key, k.curr)} | ${fmtDelta(k.key, k.abs)} | ${fmtPct(k.pct)} |`));
      lines.push('');
      a.findings.forEach((f) => lines.push(`- **${f.area}**${f.tone === 'bad' ? ' ⚠' : ''}: ${f.text}${f.check ? ` _Check: ${f.check}_` : ''}`));
      lines.push('');
    }
  });
  return lines.join('\n');
}

