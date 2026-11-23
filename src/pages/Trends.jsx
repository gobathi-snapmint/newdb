import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { useApp } from '../state';
import { METRICS, METRIC, aggregate, fmt, groupBy, metricsOf, value } from '../lib/metrics';
import { BUCKET, DIM, bucketLabel } from '../lib/filters';
import { parseKey, toKey } from '../lib/data';
import { Card, ChartTooltip, PageHead, Seg, Select, colorFor } from '../components/ui';

export function Trends() {
  return (
    <div>
      <PageHead title="Visual Trends">
        Trends over time for any metric, optionally split by channel, audience or campaign type, plus the conversion funnel and an efficiency map.
      </PageHead>
      <div className="stack">
        <TrendCard />
        <div className="grid2">
          <FunnelCard />
          <EfficiencyCard />
        </div>
      </div>
    </div>
  );
}

function TrendCard() {
  const { filtered, maxDate } = useApp();
  const [gran, setGran] = useState('week');
  const [metric, setMetric] = useState('orders');
  const [split, setSplit] = useState('none');
  const [range, setRange] = useState('180');
  const { data, series } = useMemo(() => {
    let rows = filtered;
    if (range !== 'all') {
      const end = parseKey(maxDate);
      const from = toKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - +range + 1));
      rows = rows.filter((r) => r.dateKey >= from);
    }
    const bk = BUCKET[gran];
    if (split === 'none') {
      const g = groupBy(rows, bk);
      return { data: [...g.keys()].sort().map((k) => ({ name: bucketLabel(gran, k), Total: value(g.get(k), metric) })), series: ['Total'] };
    }
    const sk = DIM[split].get;
    const vol = new Map();
    rows.forEach((r) => vol.set(sk(r), (vol.get(sk(r)) || 0) + r.sent));
    const series = [...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
    const g = groupBy(rows, (r) => `${bk(r)}\u0000${sk(r)}`);
    const buckets = [...new Set(rows.map(bk))].sort();
    return {
      series,
      data: buckets.map((b) => {
        const o = { name: bucketLabel(gran, b) };
        series.forEach((s) => { const a = g.get(`${b}\u0000${s}`); o[s] = a ? value(a, metric) : null; });
        return o;
      }),
    };
  }, [filtered, gran, metric, split, range, maxDate]);

  const additive = METRIC[metric].kind === 'count' && metric !== 'campaigns';
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={14} />
      <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(metric, v, { short: true })} width={66} />
      <Tooltip content={<ChartTooltip format={(v) => fmt(metric, v)} />} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </>
  );
  return (
    <Card title={`${METRIC[metric].label} over time`} sub={split === 'none' ? '' : additive ? `Stacked by ${DIM[split].label} (top 8 by volume)` : `One line per ${DIM[split].label} (top 8 by volume)`}
      right={<>
        <Select value={metric} onChange={setMetric} options={METRICS.map((m) => [m.key, m.label])} />
        <Select value={split} onChange={setSplit} options={[['none', 'No split'], ...['channel', 'audience', 'campaignType', 'source', 'product', 'segment', 'exp'].map((k) => [k, `Split by ${DIM[k].label}`])]} />
        <Seg options={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} value={gran} onChange={setGran} />
        <Select value={range} onChange={setRange} options={[['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 180 days'], ['all', 'All data']]} />
      </>}>
      <div style={{ height: 340 }}>
        <ResponsiveContainer>
          {additive && split !== 'none' ? (
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
              {common}
              {series.map((s, i) => <Area key={s} dataKey={s} stackId="a" stroke={colorFor(i)} fill={colorFor(i)} fillOpacity={0.55} isAnimationActive={false} />)}
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
              {common}
              {series.map((s, i) => <Line key={s} dataKey={s} stroke={split === 'none' ? 'var(--accent)' : colorFor(i)} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />)}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function FunnelCard() {
  const { currRows, prevRows, periods } = useApp();
  const c = useMemo(() => aggregate(currRows), [currRows]);
  const p = useMemo(() => aggregate(prevRows), [prevRows]);
  const steps = ['sent', 'delivered', 'clicks', 'orders'];
  const data = steps.map((s, i) => ({
    name: METRIC[s].label,
    curr: c[s], prev: p[s],
    conv: i ? `${((c[s] / (c[steps[i - 1]] || 1)) * 100).toFixed(2)}% (prev ${((p[s] / (p[steps[i - 1]] || 1)) * 100).toFixed(2)}%)` : '',
  }));
  return (
    <Card title="Funnel" sub="Sent → Delivered → Clicks → Orders (log scale). Step conversion shown under each bar.">
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 18, right: 8, left: 4, bottom: 20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={({ x, y, payload, index }) => (
              <g transform={`translate(${x},${y + 10})`}>
                <text textAnchor="middle" fontSize={12} fill="var(--text)" fontWeight={600}>{payload.value}</text>
                <text textAnchor="middle" y={15} fontSize={10.5} fill="var(--muted)">{data[index]?.conv}</text>
              </g>
            )} interval={0} height={40} />
            <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmt('sent', v, { short: true })} width={60} />
            <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v) => fmt('sent', v)} />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingBottom: 14 }} verticalAlign="top" height={34} />
            <Bar dataKey="prev" name={`Previous (${periods.prev.label})`} fill="var(--prev)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="curr" name={`Current (${periods.curr.label})`} fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="curr" position="top" style={{ fontSize: 10.5, fill: 'var(--muted)' }} formatter={(v) => fmt('sent', v, { short: true })} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function EfficiencyCard() {
  const { currRows } = useApp();
  const [dim, setDim] = useState('channel');
  const data = useMemo(() => {
    const g = groupBy(currRows, DIM[dim].get);
    return [...g.entries()].map(([k, a]) => ({ name: k, ...metricsOf(a) })).filter((x) => x.ctr != null && x.cvr != null);
  }, [currRows, dim]);
  return (
    <Card title="Efficiency map (current period)" sub="CTR vs CVR — bubble size = cost. Top-right is best."
      right={<Select value={dim} onChange={setDim} options={['channel', 'audience', 'campaignType', 'product', 'segment', 'source'].map((k) => [k, DIM[k].label])} />}>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 10, right: 20, left: 4, bottom: 10 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis type="number" dataKey="ctr" name="CTR" tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11, fill: 'var(--muted)' }} label={{ value: 'CTR %', position: 'insideBottom', offset: -4, fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis type="number" dataKey="cvr" name="CVR" tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={50} />
            <ZAxis type="number" dataKey="cost" range={[60, 900]} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return <div className="tooltip-box"><div className="tt-title">{p.name}</div>CTR {fmt('ctr', p.ctr)} · CVR {fmt('cvr', p.cvr)}<br />Cost {fmt('cost', p.cost)} · CPO {fmt('cpo', p.cpo)}</div>;
            }} />
            <Scatter data={data} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={d.name} fill={colorFor(i)} fillOpacity={0.7} />)}
              <LabelList dataKey="name" position="right" style={{ fontSize: 11, fill: 'var(--text)' }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
