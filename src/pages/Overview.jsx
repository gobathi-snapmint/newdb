import { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../state';
import { METRICS, METRIC, aggregate, attribute, drivers, fmt, groupBy, metricsOf, narrative, value } from '../lib/metrics';
import { DIM, dayLabel } from '../lib/filters';
import { parseKey, toKey } from '../lib/data';
import { KpiGrid } from '../components/KpiGrid';
import { PeriodCompareTable, monthsAgoColumns } from '../components/PeriodCompareTable';
import { MetricTable } from '../components/MetricTable';
import { Card, ChartTooltip, PageHead, Seg, Select, colorFor } from '../components/ui';

const daysBetween = (from, to) => {
  const out = [];
  for (let d = parseKey(from); toKey(d) <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(toKey(d));
  return out;
};

export function Overview() {
  const { currRows, prevRows, periods, explore } = useApp();
  const curr = useMemo(() => metricsOf(aggregate(currRows)), [currRows]);
  const prev = useMemo(() => metricsOf(aggregate(prevRows)), [prevRows]);

  return (
    <div>
      <PageHead title="Overview">
        Headline numbers for {periods.curr.label} against {periods.prev.label}. Click any card or table cell to see what drove the change.
      </PageHead>
      <div className="stack">
        <KpiGrid curr={curr} prev={prev} onSelect={(k) => explore(k, 'channel')} />
        <TargetVsHistory />
        <WhatChanged />
        <Card title="Performance by source" sub="One-time (co_data), Recurring & Triggered (cr_data) and Journey (cj_data) campaigns">
          <MetricTable currRows={currRows} prevRows={prevRows} dim="source" onExplore={explore} title="By source" />
        </Card>
        <div className="grid2">
          <DailyTrend />
          <MixCard />
        </div>
      </div>
    </div>
  );
}

function TargetVsHistory() {
  const { periods } = useApp();
  const [n, setN] = useState(6);
  const cols = useMemo(() => monthsAgoColumns(periods.curr.from, periods.curr.to, n), [periods, n]);
  return (
    <Card title="Target vs same dates in earlier months"
      sub="Target = the selected period. Every other column is the same dates shifted back 1, 2, 3 … months — edit any date to compare a different range."
      right={<Seg options={[[3, '3 months'], [6, '6 months'], [12, '12 months']]} value={n} onChange={setN} />}>
      <PeriodCompareTable columns={cols} />
    </Card>
  );
}

function WhatChanged() {
  const { currRows, prevRows, explore } = useApp();
  const items = useMemo(() => {
    const cAgg = aggregate(currRows), pAgg = aggregate(prevRows);
    const cg = groupBy(currRows, DIM.channel.get), pg = groupBy(prevRows, DIM.channel.get);
    return ['orders', 'cost', 'cpo', 'cir'].map((k) => ({ k, text: narrative(k, attribute(k, cg, pg), drivers(k, cAgg, pAgg), 'Channel') }));
  }, [currRows, prevRows]);
  return (
    <Card title="What changed" sub="Auto-generated summary — funnel driver and channel split for the key metrics">
      <div className="grid2">
        {items.map(({ k, text }) => (
          <div key={k} className="story" style={{ marginTop: 0, cursor: 'pointer' }} onClick={() => explore(k, 'channel')} title="Open in Delta Explorer">
            <b>{METRIC[k].label}: </b>{text}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DailyTrend() {
  const { currRows, prevRows, periods } = useApp();
  const [metric, setMetric] = useState('orders');
  const data = useMemo(() => {
    const cg = groupBy(currRows, (r) => r.dateKey), pg = groupBy(prevRows, (r) => r.dateKey);
    const cd = daysBetween(periods.curr.from, periods.curr.to), pd = daysBetween(periods.prev.from, periods.prev.to);
    return Array.from({ length: Math.max(cd.length, pd.length) }, (_, i) => ({
      name: cd[i] ? dayLabel(cd[i]) : `Day ${i + 1}`,
      prevName: pd[i] ? dayLabel(pd[i]) : '',
      curr: cd[i] && cg.has(cd[i]) ? value(cg.get(cd[i]), metric) : null,
      prev: pd[i] && pg.has(pd[i]) ? value(pg.get(pd[i]), metric) : null,
    }));
  }, [currRows, prevRows, periods, metric]);
  return (
    <Card title="Day-by-day: current vs previous" sub="Previous period aligned day by day"
      right={<Select value={metric} onChange={setMetric} options={METRICS.filter((m) => m.key !== 'campaigns').map((m) => [m.key, m.label])} />}>
      <div style={{ height: 290 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={18} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(metric, v, { short: true })} width={64} />
            <Tooltip content={<ChartTooltip format={(v) => fmt(metric, v)} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area dataKey="prev" name={`Previous (${periods.prev.label})`} stroke="var(--prev)" fill="var(--prev)" fillOpacity={0.15} strokeDasharray="4 3" isAnimationActive={false} />
            <Line dataKey="curr" name={`Current (${periods.curr.label})`} stroke="var(--accent)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MixCard() {
  const { currRows, prevRows } = useApp();
  const [dim, setDim] = useState('channel');
  const [metric, setMetric] = useState('cost');
  const { data, groups } = useMemo(() => {
    const cg = groupBy(currRows, DIM[dim].get), pg = groupBy(prevRows, DIM[dim].get);
    const groups = [...new Set([...cg.keys(), ...pg.keys()])].sort((a, b) => (value(cg.get(b), metric) || 0) - (value(cg.get(a), metric) || 0));
    const row = (g, name) => {
      const tot = groups.reduce((s, k) => s + (value(g.get(k), metric) || 0), 0);
      const o = { name };
      groups.forEach((k) => { o[k] = tot ? ((value(g.get(k), metric) || 0) / tot) * 100 : 0; });
      return o;
    };
    return { data: [row(pg, 'Previous'), row(cg, 'Current')], groups };
  }, [currRows, prevRows, dim, metric]);
  return (
    <Card title="Mix shift" sub="Share of the total in each period — shows where volume or spend moved"
      right={<>
        <Select value={metric} onChange={setMetric} options={['sent', 'cost', 'clicks', 'orders', 'gtv', 'revenue'].map((k) => [k, METRIC[k].label])} />
        <Select value={dim} onChange={setDim} options={['channel', 'audience', 'campaignType', 'source', 'product', 'segment'].map((k) => [k, DIM[k].label])} />
      </>}>
      <div style={{ height: 290 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text)' }} width={70} />
            <Tooltip content={<ChartTooltip format={(v) => `${v.toFixed(1)}%`} />} cursor={{ fill: 'var(--surface2)' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {groups.map((g, i) => <Bar key={g} dataKey={g} stackId="a" fill={colorFor(i)} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
