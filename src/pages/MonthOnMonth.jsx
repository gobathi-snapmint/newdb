import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../state';
import { METRICS, METRIC, delta, fmt, fmtPct, groupBy, metricsOf, tone, value } from '../lib/metrics';
import { DIM, monthLabel } from '../lib/filters';
import { Card, ChartTooltip, PageHead, Seg, Select } from '../components/ui';
import { PeriodCompareTable } from '../components/PeriodCompareTable';

export function MonthOnMonth() {
  const { filtered, months, maxDate, setPeriod, explore } = useApp();
  const [picked, setPicked] = useState(() => months.slice(-6));
  const sel = months.filter((m) => picked.includes(m));
  const lastDay = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const partial = (mk) => maxDate.startsWith(mk) && +maxDate.slice(8) < lastDay(mk);
  const label = (mk) => `${monthLabel(mk)}${partial(mk) ? ' (MTD)' : ''}`;

  const monthCols = useMemo(() => [...sel].reverse().map((mk, i) => {
    const to = `${mk}-${String(lastDay(mk)).padStart(2, '0')}`;
    return { key: mk, title: i === 0 ? `Target · ${label(mk)}` : label(mk), from: `${mk}-01`, to: partial(mk) ? maxDate : to };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sel.join(), maxDate]);

  const byMonth = useMemo(() => {
    const g = groupBy(filtered, (r) => r.monthKey);
    return Object.fromEntries(months.map((m) => [m, metricsOf(g.get(m))]));
  }, [filtered, months]);

  // Clicking a month cell compares that month with the month before it in the Delta Explorer.
  const openMonth = (mk, metric) => {
    const i = months.indexOf(mk);
    if (i <= 0) return;
    setPeriod((p) => ({ ...p, mode: 'mom', month: mk, compareMonth: months[i - 1] }));
    explore(metric, 'channel');
  };

  return (
    <div>
      <PageHead title="Month on Month">
        Pick the months to compare. Each month's change is against the month before it. Click a cell to break that month's change down.
        {maxDate && partial(maxDate.slice(0, 7)) && ' The latest month is partial (MTD) — compare it with care, or use the MTD period on other pages.'}
      </PageHead>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="crumbs">
          <span className="hint">Months:</span>
          {months.map((m) => (
            <button key={m} className={`crumb ${picked.includes(m) ? 'last' : ''}`} style={{ cursor: 'pointer' }}
              onClick={() => setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))}>{label(m)}</button>
          ))}
          <button className="btn" onClick={() => setPicked(months)}>All</button>
          <button className="btn" onClick={() => setPicked(months.slice(-3))}>Last 3</button>
          <button className="btn" onClick={() => setPicked(months.slice(-6))}>Last 6</button>
        </div>
      </div>
      <div className="stack">
        <Card title="Monthly performance" sub="Latest selected month is the target; the other selected months are compared with it. The last column is their average.">
          {sel.length ? <PeriodCompareTable columns={monthCols} avgLabel="Avg of other months" /> : <div className="empty">Pick at least one month.</div>}
        </Card>
        <MonthChart byMonth={byMonth} sel={sel} label={label} />
        <MonthMatrix sel={sel} months={months} label={label} openMonth={openMonth} />
      </div>
    </div>
  );
}

function MonthChart({ byMonth, sel, label }) {
  const [bar, setBar] = useState('orders');
  const [line, setLine] = useState('cpo');
  const data = sel.map((mk) => ({ name: label(mk), bar: byMonth[mk][bar], line: byMonth[mk][line] }));
  return (
    <Card title="Monthly trend" right={<>
      <span className="hint">Bars</span><Select value={bar} onChange={setBar} options={METRICS.map((m) => [m.key, m.label])} />
      <span className="hint">Line</span><Select value={line} onChange={setLine} options={METRICS.map((m) => [m.key, m.label])} />
    </>}>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: 'var(--muted)' }} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(bar, v, { short: true })} width={64} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(line, v, { short: true })} width={64} />
            <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v, k) => fmt(k === 'bar' ? bar : line, v)} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="bar" name={METRIC[bar].label} fill="var(--accent)" fillOpacity={0.8} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="line" name={METRIC[line].label} stroke="#f59e0b" strokeWidth={2.4} dot={{ r: 4 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MonthMatrix({ sel, months, label, openMonth }) {
  const { filtered, setExplorer } = useApp();
  const [dim, setDim] = useState('channel');
  const [metric, setMetric] = useState('cpo');
  const [mode, setMode] = useState('value');
  const { groups, cell } = useMemo(() => {
    const g = groupBy(filtered, (r) => `${DIM[dim].get(r)}\u0000${r.monthKey}`);
    const vol = new Map();
    filtered.forEach((r) => { const k = DIM[dim].get(r); vol.set(k, (vol.get(k) || 0) + r.sent); });
    const groups = [...vol.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 25);
    return { groups, cell: (grp, mk) => (g.has(`${grp}\u0000${mk}`) ? value(g.get(`${grp}\u0000${mk}`), metric) : null) };
  }, [filtered, dim, metric]);

  return (
    <Card title={`${METRIC[metric].label} by ${DIM[dim].label}, month by month`} sub="Click a cell to break down that group's change versus the previous month"
      right={<>
        <Select value={metric} onChange={setMetric} options={METRICS.map((m) => [m.key, m.label])} />
        <Select value={dim} onChange={setDim} options={['channel', 'audience', 'campaignType', 'product', 'segment', 'source', 'exp', 'journeyType'].map((k) => [k, DIM[k].label])} />
        <Seg options={[['value', 'Value'], ['pct', 'MoM Δ %']]} value={mode} onChange={setMode} />
      </>}>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>{DIM[dim].label}</th>{sel.map((mk) => <th key={mk}>{label(mk)}</th>)}</tr></thead>
          <tbody>
            {groups.map((grp) => (
              <tr key={grp}>
                <td>{grp}</td>
                {sel.map((mk) => {
                  const i = months.indexOf(mk);
                  const c = cell(grp, mk), p = i > 0 ? cell(grp, months[i - 1]) : null;
                  const d = delta(c, p);
                  return (
                    <td key={mk} className="click" title={`${label(mk)}: ${fmt(metric, c)} (prev month ${fmt(metric, p)})`}
                      onClick={() => { openMonth(mk, metric); setExplorer((e) => ({ ...e, metric, path: [{ dim, value: grp }], dim: dim === 'channel' ? 'audience' : 'channel' })); }}>
                      {mode === 'value' ? fmt(metric, c, { short: true }) : <span className={tone(metric, d.abs)}>{i > 0 ? (d.isNew ? 'new' : fmtPct(d.pct)) : '—'}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
