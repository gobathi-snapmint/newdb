import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronRight } from 'lucide-react';
import { useApp, nextDim } from '../state';
import { METRICS, METRIC, aggregate, attribute, delta, drivers, fmt, fmtDelta, fmtPct, groupBy, metricsOf, narrative, tone } from '../lib/metrics';
import { DIM, DIMENSIONS } from '../lib/filters';
import { Card, DeltaText, PageHead, Seg } from '../components/ui';

const FORMULAS = {
  orders: 'Orders = Sent × Delivery % × CTR × CVR',
  clicks: 'Clicks = Sent × Delivery % × CTR',
  delivered: 'Delivered = Sent × Delivery %',
  cost: 'Cost = Sent × Cost per Sent',
  gtv: 'GTV = Orders × GTV per Order',
  revenue: 'Revenue = Orders × Revenue per Order',
  cpc: 'CPC = Cost per Sent ÷ (Delivery % × CTR)',
  cpo: 'CPO = Cost per Sent ÷ (Delivery % × CTR × CVR)',
  cir: 'CIR = Cost per Sent ÷ (Delivery % × CTR × CVR × Revenue per Order)',
};

const GOOD = 'var(--good)', BAD = 'var(--bad)', FLAT = 'var(--prev)';
const toneColor = (metric, v) => ({ good: GOOD, bad: BAD, flat: FLAT }[tone(metric, v)]);

export function DeltaExplorer() {
  const { currRows, prevRows, explorer, setExplorer, periods } = useApp();
  const { metric, dim, path } = explorer;
  const m = METRIC[metric];

  const scoped = useMemo(() => {
    const keep = (r) => path.every((p) => DIM[p.dim].get(r) === p.value);
    return { curr: currRows.filter(keep), prev: prevRows.filter(keep) };
  }, [currRows, prevRows, path]);

  const totals = useMemo(() => {
    const c = aggregate(scoped.curr), p = aggregate(scoped.prev);
    return { cAgg: c, pAgg: p, curr: metricsOf(c), prev: metricsOf(p) };
  }, [scoped]);

  const att = useMemo(() => attribute(metric, groupBy(scoped.curr, DIM[dim].get), groupBy(scoped.prev, DIM[dim].get)), [scoped, metric, dim]);
  const drv = useMemo(() => drivers(metric, totals.cAgg, totals.pAgg), [metric, totals]);
  const story = narrative(metric, att, drv, DIM[dim].label);
  const d = delta(att.curr, att.prev);

  const set = (patch) => setExplorer((e) => ({ ...e, ...patch }));
  const usedDims = path.map((p) => p.dim);
  const drill = (group) => {
    const newPath = [...path, { dim, value: group }];
    set({ path: newPath, dim: nextDim(dim, usedDims) });
  };
  // Always-visible splits under the main one: channel, audience, product line and segment (minus the main split and any drilled-into dimension)
  const fixedDims = ['channel', 'audience', 'product', 'segment'].filter((k) => k !== dim && !usedDims.includes(k));
  const dimOptions = DIMENSIONS.filter((x) => !usedDims.includes(x.key)).map((x) => [x.key, x.label]);

  return (
    <div>
      <PageHead title="Delta Explorer">
        Pick a metric to see how much it moved between the two periods and exactly where the change came from — by funnel step and by
        channel, audience, campaign type and more. Click a row to drill one level deeper.
      </PageHead>
      <div className="explorer">
        <div className="card mlist">
          {METRICS.map((x) => {
            const dd = delta(totals.curr[x.key], totals.prev[x.key]);
            return (
              <button key={x.key} className={`mitem ${x.key === metric ? 'on' : ''}`} onClick={() => set({ metric: x.key })}>
                <span className="n">{x.label}</span>
                <span className="v num">{fmt(x.key, totals.curr[x.key], { short: true })}</span>
                <span className="d num"><DeltaText metric={x.key} {...dd} short /></span>
              </button>
            );
          })}
        </div>

        <div className="stack">
          <div className="card">
            <div className="crumbs">
              <span className="hint">Scope:</span>
              <button className={`crumb ${path.length ? '' : 'last'}`} onClick={() => set({ path: [] })}>All filtered data</button>
              {path.map((p, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  <ChevronRight size={14} color="var(--dim)" />
                  <button className={`crumb ${i === path.length - 1 ? 'last' : ''}`} onClick={() => set({ path: path.slice(0, i + 1) })}>
                    {DIM[p.dim].label}: {p.value}
                  </button>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="hint" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{m.label} · {m.desc}</div>
                <div className="headline num">
                  {fmt(metric, att.curr)}
                  <span className="from">from {fmt(metric, att.prev)}</span>
                  <span style={{ fontSize: 17 }}><DeltaText metric={metric} {...d} /></span>
                </div>
                <div className="hint">{periods.curr.label} vs {periods.prev.label}</div>
              </div>
            </div>
            <div className="story">{story}</div>
          </div>

          {drv && <DriverCard metric={metric} drv={drv} prev={att.prev} curr={att.curr} />}

          <SplitCard metric={metric} dim={dim} att={att} onDrill={dim === 'campaign' ? null : drill}
            right={<Seg options={dimOptions.slice(0, 7)} value={dim} onChange={(v) => set({ dim: v })} />}>
            {dimOptions.length > 7 && (
              <div style={{ marginBottom: 10 }}>
                <span className="hint">More: </span>
                {dimOptions.slice(7).map(([k, l]) => <button key={k} className={`crumb ${k === dim ? 'last' : ''}`} style={{ marginRight: 6 }} onClick={() => set({ dim: k })}>{l}</button>)}
              </div>
            )}
          </SplitCard>

          {fixedDims.map((fd) => (
            <FixedSplit key={fd} metric={metric} dim={fd} scoped={scoped}
              onDrill={(group) => set({ path: [...path, { dim: fd, value: group }], dim: nextDim(fd, usedDims) })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SplitCard({ metric, dim, att, onDrill, right, children }) {
  const m = METRIC[metric];
  const top = att.rows.find((r) => Math.abs(r.contrib) > 1e-9);
  const topLine = top && att.totalDelta
    ? `Largest contributor: ${top.group} (${fmtDelta(metric, top.contrib)}${top.share != null ? `, ${top.share.toFixed(0)}% of the change` : ''}${att.isRatio ? (Math.abs(top.rate) >= Math.abs(top.mix) ? ` — mostly its own ${m.label} moving` : ` — mostly its share of ${att.denLabel} shifting`) : ''}).`
    : null;
  return (
    <Card
      title={`Where the ${m.label} change came from — by ${DIM[dim].label}`}
      sub={<>
        {att.isRatio
          ? `Each row's contribution adds up exactly to the total Δ. Rate effect = the group's own ${m.label} moved; mix effect = the group's share of ${att.denLabel} moved.`
          : 'Each row is the group\'s own change; together they add up to the total Δ.'}
        {topLine && <div style={{ marginTop: 4, color: 'var(--text)', fontWeight: 600 }}>{topLine}</div>}
      </>}
      right={right}
    >
      {children}
      <ContributionChart metric={metric} att={att} />
      <ContributionTable metric={metric} att={att} dim={dim} onDrill={onDrill} />
    </Card>
  );
}

function FixedSplit({ metric, dim, scoped, onDrill }) {
  const att = useMemo(() => attribute(metric, groupBy(scoped.curr, DIM[dim].get), groupBy(scoped.prev, DIM[dim].get)), [scoped, metric, dim]);
  return <SplitCard metric={metric} dim={dim} att={att} onDrill={onDrill} />;
}

function DriverCard({ metric, drv, prev, curr }) {
  // Waterfall: previous value -> each factor's contribution -> current value
  let run = prev;
  const data = [{ name: 'Previous', range: [0, prev], kind: 'end', label: fmt(metric, prev, { short: true }) }];
  drv.factors.forEach((f) => {
    data.push({ name: f.label, range: [run, run + f.contrib], v: f.contrib, kind: 'step', label: fmtDelta(metric, f.contrib, { short: true }) });
    run += f.contrib;
  });
  data.push({ name: 'Current', range: [0, curr], kind: 'end', label: fmt(metric, curr, { short: true }) });
  const vals = data.flatMap((x) => x.range);
  const lo = Math.min(...data.filter((x) => x.kind === 'step').flatMap((x) => x.range), prev, curr);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || hi * 0.1;
  const domain = [Math.max(0, lo - pad), hi + pad * 0.4];

  return (
    <Card title="Funnel drivers" sub={`${FORMULAS[metric]}. Each step shows how much of the change that funnel stage explains.`}>
      <div className="grid3">
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={0} />
              <YAxis domain={domain} allowDataOverflow tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(metric, v, { short: true })} width={70} />
              <Tooltip cursor={{ fill: 'var(--surface2)' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return <div className="tooltip-box"><div className="tt-title">{p.name}</div>{p.kind === 'end' ? fmt(metric, p.range[1]) : `${fmtDelta(metric, p.v)} to ${METRIC[metric].label}`}</div>;
              }} />
              <Bar dataKey="range" radius={3} isAnimationActive={false}>
                {data.map((x, i) => <Cell key={i} fill={x.kind === 'end' ? (i === 0 ? 'var(--prev)' : 'var(--accent)') : toneColor(metric, x.v)} />)}
                <LabelList dataKey="label" position="top" style={{ fontSize: 10.5, fill: 'var(--muted)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="t" style={{ alignSelf: 'start' }}>
          <thead><tr><th>Funnel factor</th><th>Prev</th><th>Curr</th><th>Change</th><th>Impact on {METRIC[metric].label}</th></tr></thead>
          <tbody>
            {drv.factors.map((f) => (
              <tr key={f.factor}>
                <td>{f.label}{f.sign < 0 && <span className="hint"> (÷)</span>}</td>
                <td>{fmt(f.factor, f.prev)}</td>
                <td>{fmt(f.factor, f.curr)}</td>
                <td className={f.pct * f.sign * (METRIC[metric].good || 1) > 0 ? 'good' : f.pct ? 'bad' : 'flat'}>{fmtPct(f.pct)}</td>
                <td className={tone(metric, f.contrib)} style={{ fontWeight: 700 }}>{fmtDelta(metric, f.contrib)}</td>
              </tr>
            ))}
            <tr className="total"><td>Total change</td><td>{fmt(metric, prev)}</td><td>{fmt(metric, curr)}</td><td>{fmtPct(((curr - prev) / prev) * 100)}</td><td className={tone(metric, drv.total)}>{fmtDelta(metric, drv.total)}</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ContributionChart({ metric, att }) {
  const data = att.rows.filter((r) => Math.abs(r.contrib) > 1e-9).slice(0, 12).map((r) => ({ name: r.group, contrib: r.contrib, share: r.share }));
  if (!data.length) return <div className="empty">No change to attribute.</div>;
  return (
    <div style={{ height: Math.max(140, data.length * 30 + 40), marginBottom: 14 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmtDelta(metric, v, { short: true })} />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11.5, fill: 'var(--text)' }} tickFormatter={(s) => (s.length > 26 ? `${s.slice(0, 25)}…` : s)} />
          <ReferenceLine x={0} stroke="var(--dim)" />
          <Tooltip cursor={{ fill: 'var(--surface2)' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return <div className="tooltip-box"><div className="tt-title">{p.name}</div>{fmtDelta(metric, p.contrib)} contribution{p.share != null && ` · ${p.share.toFixed(1)}% of total Δ`}</div>;
          }} />
          <Bar dataKey="contrib" radius={3} isAnimationActive={false}>
            {data.map((x, i) => <Cell key={i} fill={toneColor(metric, x.contrib)} />)}
            <LabelList dataKey="contrib" position="right" style={{ fontSize: 11, fill: 'var(--muted)' }} formatter={(v) => fmtDelta(metric, v, { short: true })} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ContributionTable({ metric, att, dim, onDrill }) {
  const m = METRIC[metric];
  const maxAbs = Math.max(...att.rows.map((r) => Math.abs(r.contrib)), 1e-9);
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>{DIM[dim].label}</th>
            <th>Prev {m.label}</th>
            <th>Curr {m.label}</th>
            <th>Δ Actual</th>
            <th>Δ %</th>
            {att.isRatio && <th title={`Share of total ${att.denLabel}`}>Share of {att.denLabel} (prev → curr)</th>}
            <th>Contribution to total Δ</th>
            <th>% of total Δ</th>
            {att.isRatio && <th title={`The group's own ${m.label} changed`}>Rate effect</th>}
            {att.isRatio && <th title={`The group's share of ${att.denLabel} changed`}>Mix effect</th>}
          </tr>
        </thead>
        <tbody>
          {att.rows.map((r) => (
            <tr key={r.group} className={onDrill ? 'click-row' : ''} onClick={() => onDrill?.(r.group)} title={onDrill ? 'Click to drill into this group' : ''}>
              <td title={r.group}>{r.group}</td>
              <td>{fmt(metric, r.prev)}</td>
              <td>{fmt(metric, r.curr)}</td>
              <td className={tone(metric, r.abs)}>{fmtDelta(metric, r.abs)}</td>
              <td className={tone(metric, r.abs)}>{r.isNew ? 'new' : fmtPct(r.pct)}</td>
              {att.isRatio && <td>{r.sharePrev.toFixed(1)}% → {r.shareCurr.toFixed(1)}%</td>}
              <td>
                <div className="bar-cell">
                  <b className={tone(metric, r.contrib)}>{fmtDelta(metric, r.contrib)}</b>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(Math.abs(r.contrib) / maxAbs) * 100}%`, background: toneColor(metric, r.contrib), right: 0 }} /></div>
                </div>
              </td>
              <td>{r.share != null ? `${r.share.toFixed(1)}%` : '—'}</td>
              {att.isRatio && <td className={tone(metric, r.rate)}>{fmtDelta(metric, r.rate)}</td>}
              {att.isRatio && <td className={tone(metric, r.mix)}>{fmtDelta(metric, r.mix)}</td>}
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td>{fmt(metric, att.prev)}</td>
            <td>{fmt(metric, att.curr)}</td>
            <td className={tone(metric, att.totalDelta)}>{fmtDelta(metric, att.totalDelta)}</td>
            <td>{fmtPct(att.prev ? (att.totalDelta / att.prev) * 100 : null)}</td>
            {att.isRatio && <td>100%</td>}
            <td className={tone(metric, att.totalDelta)}>{fmtDelta(metric, att.totalDelta)}</td>
            <td>100%</td>
            {att.isRatio && <td className={tone(metric, att.rows.reduce((s, r) => s + r.rate, 0))}>{fmtDelta(metric, att.rows.reduce((s, r) => s + r.rate, 0))}</td>}
            {att.isRatio && <td className={tone(metric, att.rows.reduce((s, r) => s + r.mix, 0))}>{fmtDelta(metric, att.rows.reduce((s, r) => s + r.mix, 0))}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
