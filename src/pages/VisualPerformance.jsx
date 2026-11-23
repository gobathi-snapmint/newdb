import { useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useApp } from '../state';
import { METRICS, METRIC, fmt, groupBy, value } from '../lib/metrics';
import { BUCKET, DIM, bucketLabel, dayLabel } from '../lib/filters';
import { parseKey, toKey } from '../lib/data';
import { Card, ChartTooltip, PageHead, Seg, Select, colorFor } from '../components/ui';

const CHART_METRICS = METRICS.filter((m) => m.key !== 'campaigns');
const COLOR = Object.fromEntries(CHART_METRICS.map((m, i) => [m.key, colorFor(i)]));
const SPLIT_DIMS = ['channel', 'audience', 'product', 'segment', 'campaignType', 'source', 'exp'];

const isBar = (k) => METRIC[k].kind === 'count';

const daysBetween = (from, to) => {
  const out = [];
  for (let d = parseKey(from); toKey(d) <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(toKey(d));
  return out;
};

export function VisualPerformance() {
  const { filtered, maxDate } = useApp();
  const [metrics, setMetrics] = useState(['sent', 'orders', 'ctr', 'cpo']);
  const [gran, setGran] = useState('week');
  const [range, setRange] = useState('180');
  const [view, setView] = useState('separate');
  const [split, setSplit] = useState('none');
  const [labels, setLabels] = useState(false);
  const toggle = (k) => setMetrics((ms) => (ms.includes(k) ? ms.filter((x) => x !== k) : [...ms, k]));
  const sel = CHART_METRICS.map((m) => m.key).filter((k) => metrics.includes(k));

  // One row per time bucket with every metric, plus per-group values when split
  const { data, groups } = useMemo(() => {
    let rows = filtered;
    if (range !== 'all') {
      const end = parseKey(maxDate);
      const from = toKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - +range + 1));
      rows = rows.filter((r) => r.dateKey >= from);
    }
    const bk = BUCKET[gran];
    const g = groupBy(rows, bk);
    let groups = [], gg = null;
    if (split !== 'none') {
      const sk = DIM[split].get;
      const vol = new Map();
      rows.forEach((r) => vol.set(sk(r), (vol.get(sk(r)) || 0) + r.sent));
      groups = [...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
      gg = groupBy(rows, (r) => `${bk(r)}\u0000${sk(r)}`);
    }
    const data = [...g.keys()].sort().map((b) => {
      const o = { name: bucketLabel(gran, b) };
      CHART_METRICS.forEach((m) => { o[m.key] = value(g.get(b), m.key); });
      if (gg) groups.forEach((grp) => CHART_METRICS.forEach((m) => { o[`${m.key}\u0000${grp}`] = value(gg.get(`${b}\u0000${grp}`), m.key); }));
      return o;
    });
    return { data, groups };
  }, [filtered, gran, range, split, maxDate]);

  return (
    <div>
      <PageHead title="Visual Performance">
        Pick the metrics to plot. See each one in its own chart, all of them together on one chart, or indexed to 100 to compare how fast they moved.
      </PageHead>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="crumbs" style={{ marginBottom: 12 }}>
          <span className="hint">Metrics:</span>
          {CHART_METRICS.map((m) => (
            <button key={m.key} className={`chip ${metrics.includes(m.key) ? 'on' : ''}`} style={{ '--c': COLOR[m.key] }} onClick={() => toggle(m.key)}>
              <span className="swatch" style={{ background: COLOR[m.key] }} />{m.label}
            </button>
          ))}
          <button className="btn" onClick={() => setMetrics(['sent', 'orders', 'ctr', 'cpo'])}>Default</button>
          <button className="btn" onClick={() => setMetrics(['ctr', 'cvr', 'deliveryRate', 'cir'])}>Rates</button>
          <button className="btn" onClick={() => setMetrics(['cost', 'cpc', 'cpo', 'cir'])}>Cost</button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Seg options={[['separate', 'Separate charts'], ['combined', 'Combined chart'], ['indexed', 'Indexed (=100)']]} value={view} onChange={setView} />
          <Seg options={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} value={gran} onChange={setGran} />
          <Select value={range} onChange={setRange} options={[['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 180 days'], ['all', 'All data']]} />
          {view === 'separate' && <Select value={split} onChange={setSplit} options={[['none', 'No split'], ...SPLIT_DIMS.map((k) => [k, `Split by ${DIM[k].label}`])]} />}
          <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Show values
          </label>
        </div>
      </div>

      {!sel.length ? <div className="card empty">Pick at least one metric.</div> : (
        <div className="stack">
          {view === 'separate' && <SeparateCharts data={data} sel={sel} split={split} groups={groups} labels={labels} />}
          {view === 'combined' && <CombinedChart data={data} sel={sel} labels={labels} />}
          {view === 'indexed' && <IndexedChart data={data} sel={sel} labels={labels} />}
          <CurrVsPrev sel={sel} />
          <BreakdownChart />
          <SummaryTable data={data} sel={sel} />
        </div>
      )}
    </div>
  );
}

const valueLabels = (k, on) => on && <LabelList dataKey={k} position="top" offset={6} style={{ fontSize: 9.5, fill: 'var(--muted)', pointerEvents: 'none' }} formatter={(v) => (v == null ? '' : fmt(k, v, { short: true }))} />;

function SeparateCharts({ data, sel, split, groups, labels }) {
  return (
    <div className="grid2">
      {sel.map((k) => {
        const latest = [...data].reverse().find((d) => d[k] != null);
        return (
          <Card key={k} title={<span style={{ color: COLOR[k] }}>{METRIC[k].label}</span>}
            sub={split === 'none' ? `${METRIC[k].desc} · latest ${fmt(k, latest?.[k])}` : `One line per ${DIM[split].label} (top 6 by Sent)`}>
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: labels ? 18 : 6, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLOR[k]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLOR[k]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} minTickGap={14} />
                  <YAxis tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(k, v, { short: true })} width={62} />
                  <Tooltip content={<ChartTooltip format={(v) => fmt(k, v)} />} />
                  {split === 'none' ? (
                    <Area dataKey={k} name={METRIC[k].label} stroke={COLOR[k]} strokeWidth={2.2} fill={`url(#g-${k})`} dot={false} connectNulls isAnimationActive={false}>
                      {valueLabels(k, labels)}
                    </Area>
                  ) : groups.map((grp, i) => (
                    <Line key={grp} dataKey={`${k}\u0000${grp}`} name={grp} stroke={colorFor(i)} strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
                  ))}
                  {split !== 'none' && <Legend wrapperStyle={{ fontSize: 11 }} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CombinedChart({ data, sel, labels }) {
  // Every metric gets its own scale (Orders would vanish next to Sent otherwise). Volumes and ₹ totals are bars on the
  // left, rates and ₹ per unit are lines on the right; the first two axes on each side are drawn, coloured like their series.
  const bars = sel.filter(isBar), lines = sel.filter((k) => !isBar(k));
  const shown = new Set([...bars.slice(0, 2), ...lines.slice(0, 2)]);
  return (
    <Card title="All selected metrics on one chart"
      sub="Bars = volumes and ₹ totals (left axes), lines = rates and ₹ per unit (right axes). Each metric has its own scale, so compare shapes and turning points, not heights; axis colours match the series.">
      <div style={{ height: 400 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: labels ? 20 : 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={14} />
            {sel.map((k) => (
              <YAxis key={k} yAxisId={k} hide={!shown.has(k)} orientation={isBar(k) ? 'left' : 'right'} tick={{ fontSize: 10.5, fill: COLOR[k] }}
                axisLine={{ stroke: COLOR[k] }} tickFormatter={(v) => fmt(k, v, { short: true })} width={58} />
            ))}
            <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v, k) => fmt(k, v)} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {bars.map((k) => (
              <Bar key={k} yAxisId={k} dataKey={k} name={METRIC[k].label} fill={COLOR[k]} fillOpacity={0.75} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {valueLabels(k, labels)}
              </Bar>
            ))}
            {lines.map((k) => (
              <Line key={k} yAxisId={k} dataKey={k} name={METRIC[k].label} stroke={COLOR[k]} strokeWidth={2.4} dot={{ r: 2.5 }} connectNulls isAnimationActive={false}>
                {valueLabels(k, labels)}
              </Line>
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function IndexedChart({ data, sel, labels }) {
  // Each metric divided by its first value in the range, ×100 — puts very different scales on one axis
  const idx = useMemo(() => {
    const base = Object.fromEntries(sel.map((k) => [k, data.find((d) => d[k])?.[k]]));
    return data.map((d) => {
      const o = { name: d.name };
      sel.forEach((k) => { o[k] = d[k] != null && base[k] ? (d[k] / base[k]) * 100 : null; o[`${k}__raw`] = d[k]; });
      return o;
    });
  }, [data, sel]);
  return (
    <Card title="Indexed trend (first period = 100)" sub="Every metric starts at 100, so you can compare how fast each one grew or fell. Hover to see the actual values.">
      <div style={{ height: 400 }}>
        <ResponsiveContainer>
          <ComposedChart data={idx} margin={{ top: labels ? 20 : 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={14} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} width={48} domain={['auto', 'auto']} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="tooltip-box">
                  <div className="tt-title">{label}</div>
                  {payload.filter((p) => p.value != null).map((p) => (
                    <div key={p.dataKey} style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                      <span><span className="swatch" style={{ background: p.color }} />{p.name}</span>
                      <b className="num">{p.value.toFixed(0)} <span className="hint">({fmt(p.dataKey, p.payload[`${p.dataKey}__raw`])})</span></b>
                    </div>
                  ))}
                </div>
              );
            }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={100} stroke="var(--dim)" strokeDasharray="4 4" />
            {sel.map((k) => (
              <Line key={k} dataKey={k} name={METRIC[k].label} stroke={COLOR[k]} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false}>
                {labels && <LabelList dataKey={k} position="top" style={{ fontSize: 9.5, fill: COLOR[k] }} formatter={(v) => (v == null ? '' : v.toFixed(0))} />}
              </Line>
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// Current period vs previous period, aligned day by day, one small chart per metric
function CurrVsPrev({ sel }) {
  const { currRows, prevRows, periods } = useApp();
  const data = useMemo(() => {
    const cg = groupBy(currRows, (r) => r.dateKey), pg = groupBy(prevRows, (r) => r.dateKey);
    const cd = daysBetween(periods.curr.from, periods.curr.to), pd = daysBetween(periods.prev.from, periods.prev.to);
    return Array.from({ length: Math.max(cd.length, pd.length) }, (_, i) => {
      const o = { name: cd[i] ? dayLabel(cd[i]) : `Day ${i + 1}` };
      sel.forEach((k) => {
        o[`c_${k}`] = cd[i] && cg.has(cd[i]) ? value(cg.get(cd[i]), k) : null;
        o[`p_${k}`] = pd[i] && pg.has(pd[i]) ? value(pg.get(pd[i]), k) : null;
      });
      return o;
    });
  }, [currRows, prevRows, periods, sel]);
  return (
    <Card title="Current vs previous period — day by day" sub={`Solid = ${periods.curr.label}, dashed = ${periods.prev.label} (aligned by day number). Uses the period in the filter bar.`}>
      <div className="grid-auto">
        {sel.map((k) => (
          <div key={k}>
            <div style={{ fontWeight: 700, fontSize: 13, color: COLOR[k], marginBottom: 4 }}>{METRIC[k].label}</div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} minTickGap={20} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(k, v, { short: true })} width={56} />
                  <Tooltip content={<ChartTooltip format={(v) => fmt(k, v)} />} />
                  <Line dataKey={`p_${k}`} name="Previous" stroke="var(--prev)" strokeDasharray="4 3" strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
                  <Line dataKey={`c_${k}`} name="Current" stroke={COLOR[k]} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Two metrics by a dimension: bars (current vs previous) + line on the right axis
function BreakdownChart() {
  const { currRows, prevRows, periods, explore } = useApp();
  const [dim, setDim] = useState('channel');
  const [bar, setBar] = useState('cost');
  const [line, setLine] = useState('cpo');
  const data = useMemo(() => {
    const cg = groupBy(currRows, DIM[dim].get), pg = groupBy(prevRows, DIM[dim].get);
    return [...new Set([...cg.keys(), ...pg.keys()])]
      .map((g) => ({ name: g, cBar: value(cg.get(g), bar), pBar: value(pg.get(g), bar), cLine: value(cg.get(g), line), pLine: value(pg.get(g), line), sent: cg.get(g)?.sent || 0 }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 15);
  }, [currRows, prevRows, dim, bar, line]);
  const key = (dk) => (dk.endsWith('Bar') ? bar : line);
  return (
    <Card title={`${METRIC[bar].label} and ${METRIC[line].label} by ${DIM[dim].label}`}
      sub={`Bars: ${METRIC[bar].label} (left axis), lines: ${METRIC[line].label} (right axis). Faded/dashed = previous period. Click a group to break down its change.`}
      right={<>
        <Select value={dim} onChange={setDim} options={SPLIT_DIMS.map((k) => [k, DIM[k].label])} />
        <span className="hint">Bars</span><Select value={bar} onChange={setBar} options={CHART_METRICS.map((m) => [m.key, m.label])} />
        <span className="hint">Line</span><Select value={line} onChange={setLine} options={CHART_METRICS.map((m) => [m.key, m.label])} />
      </>}>
      <div style={{ height: 340 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} onClick={(e) => e?.activeLabel != null && explore(line, dim, e.activeLabel)} style={{ cursor: 'pointer' }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={0} angle={data.length > 8 ? -25 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 56 : 30} />
            <YAxis yAxisId="l" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(bar, v, { short: true })} width={62} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(line, v, { short: true })} width={62} />
            <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v, dk) => fmt(key(dk), v)} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="pBar" name={`${METRIC[bar].label} · ${periods.prev.label}`} fill="var(--prev)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="l" dataKey="cBar" name={`${METRIC[bar].label} · ${periods.curr.label}`} fill={COLOR[bar]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="pLine" name={`${METRIC[line].label} · previous`} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.8} dot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="cLine" name={`${METRIC[line].label} · current`} stroke="#f59e0b" strokeWidth={2.4} dot={{ r: 4 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SummaryTable({ data, sel }) {
  const exportCsv = () => {
    const lines = [['Period', ...sel.map((k) => METRIC[k].label)], ...data.map((d) => [d.name, ...sel.map((k) => d[k] ?? '')])];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'visual-performance.csv';
    a.click();
  };
  return (
    <Card title="Numbers behind the charts" right={<button className="btn" onClick={exportCsv}><Download size={13} /> CSV</button>}>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Period</th>{sel.map((k) => <th key={k}>{METRIC[k].label}</th>)}</tr></thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.name}><td>{d.name}</td>{sel.map((k) => <td key={k}>{fmt(k, d[k])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
