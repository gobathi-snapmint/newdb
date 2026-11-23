import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../state';
import { METRICS, METRIC, delta, fmt, fmtPct, groupBy, tone, value } from '../lib/metrics';
import { DIM } from '../lib/filters';
import { MetricTable } from '../components/MetricTable';
import { Card, ChartTooltip, PageHead, Seg, Select } from '../components/ui';

const COMPARE_DIMS = ['channel', 'audience', 'campaignType', 'product', 'segment', 'source', 'exp', 'journeyType', 'journeyName'];

export function Compare() {
  const { currRows, prevRows, explore } = useApp();
  const [dim, setDim] = useState('channel');
  const journeyOnly = DIM[dim].journeyOnly;
  const c = journeyOnly ? currRows.filter((r) => r.source === 'CJ') : currRows;
  const p = journeyOnly ? prevRows.filter((r) => r.source === 'CJ') : prevRows;

  return (
    <div>
      <PageHead title="Comparisons">
        Side-by-side performance by channel, audience type, campaign type and more, with the change versus the previous period.
      </PageHead>
      <div style={{ marginBottom: 14 }}>
        <Seg options={COMPARE_DIMS.map((k) => [k, DIM[k].label])} value={dim} onChange={setDim} />
        {journeyOnly && <span className="hint" style={{ marginLeft: 10 }}>Journey data only (cj_data)</span>}
      </div>
      <div className="stack">
        <Card title={`${DIM[dim].label}-wise comparison`}>
          <MetricTable currRows={c} prevRows={p} dim={dim} onExplore={explore} title={`${DIM[dim].label} comparison`} maxRows={60} />
        </Card>
        <div className="grid2">
          <GroupBars currRows={c} prevRows={p} dim={dim} />
          <Matrix currRows={c} prevRows={p} rowDim={dim} />
        </div>
      </div>
    </div>
  );
}

function GroupBars({ currRows, prevRows, dim }) {
  const { periods } = useApp();
  const [metric, setMetric] = useState('cpo');
  const data = useMemo(() => {
    const cg = groupBy(currRows, DIM[dim].get), pg = groupBy(prevRows, DIM[dim].get);
    return [...new Set([...cg.keys(), ...pg.keys()])]
      .map((g) => ({ name: g, curr: cg.has(g) ? value(cg.get(g), metric) : null, prev: pg.has(g) ? value(pg.get(g), metric) : null, vol: cg.get(g)?.sent || 0 }))
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 15);
  }, [currRows, prevRows, dim, metric]);
  return (
    <Card title={`${METRIC[metric].label} by ${DIM[dim].label}`} sub="Current vs previous period (top 15 by volume)"
      right={<Select value={metric} onChange={setMetric} options={METRICS.map((m) => [m.key, m.label])} />}>
      <div style={{ height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 70 : 30}
              tickFormatter={(s) => (s.length > 16 ? `${s.slice(0, 15)}…` : s)} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(metric, v, { short: true })} width={64} />
            <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v) => fmt(metric, v)} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="prev" name={`Previous (${periods.prev.label})`} fill="var(--prev)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="curr" name={`Current (${periods.curr.label})`} fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// Cross-tab of two dimensions, coloured like a heat map
function Matrix({ currRows, prevRows, rowDim }) {
  const { explore } = useApp();
  const [colDim, setColDim] = useState(rowDim === 'audience' ? 'channel' : 'audience');
  const [metric, setMetric] = useState('cpo');
  const [mode, setMode] = useState('curr');
  const cd = colDim === rowDim ? (rowDim === 'channel' ? 'audience' : 'channel') : colDim;
  const { rows, cols, cg, pg } = useMemo(() => {
    const key = (r) => `${DIM[rowDim].get(r)}\u0000${DIM[cd].get(r)}`;
    const cg = groupBy(currRows, key), pg = groupBy(prevRows, key);
    const vol = (dimKey) => {
      const m = new Map();
      currRows.forEach((r) => { const k = DIM[dimKey].get(r); m.set(k, (m.get(k) || 0) + r.sent); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 12);
    };
    return { rows: vol(rowDim), cols: vol(cd), cg, pg };
  }, [currRows, prevRows, rowDim, cd]);

  const cells = rows.map((r) => cols.map((c) => {
    const k = `${r}\u0000${c}`;
    const cv = cg.has(k) ? value(cg.get(k), metric) : null, pv = pg.has(k) ? value(pg.get(k), metric) : null;
    return { cv, pv, d: delta(cv, pv) };
  }));
  const vals = cells.flat().map((x) => (mode === 'curr' ? x.cv : x.d.pct)).filter((v) => v != null && Number.isFinite(v));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const good = METRIC[metric].good || 1;
  const bg = (v) => {
    if (v == null || !Number.isFinite(v)) return 'transparent';
    if (mode === 'pct') {
      const t = Math.min(1, Math.abs(v) / 50);
      return v * good > 0 ? `rgba(15,157,88,${0.08 + t * 0.35})` : `rgba(217,48,37,${0.08 + t * 0.35})`;
    }
    const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    return `rgba(79,70,229,${0.06 + (good > 0 ? t : 1 - t) * 0.4})`;
  };

  return (
    <Card title={`${DIM[rowDim].label} × ${DIM[cd].label}`} sub={mode === 'curr' ? 'Current period value (darker = better)' : 'Δ % vs previous (green = better)'}
      right={<>
        <Select value={metric} onChange={setMetric} options={METRICS.map((m) => [m.key, m.label])} />
        <Select value={cd} onChange={setColDim} options={['channel', 'audience', 'campaignType', 'product', 'segment', 'source', 'exp'].filter((k) => k !== rowDim).map((k) => [k, DIM[k].label])} />
        <Seg options={[['curr', 'Value'], ['pct', 'Δ %']]} value={mode} onChange={setMode} />
      </>}>
      <div className="table-wrap" style={{ maxHeight: 330 }}>
        <table className="t">
          <thead><tr><th>{DIM[rowDim].label}</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r}>
                <td>{r}</td>
                {cells[i].map((x, j) => (
                  <td key={j} className="click" style={{ background: bg(mode === 'curr' ? x.cv : x.d.pct) }} title={`${fmt(metric, x.pv)} → ${fmt(metric, x.cv)}`}
                    onClick={() => explore(metric, rowDim, r)}>
                    {mode === 'curr' ? fmt(metric, x.cv, { short: true }) : <span className={tone(metric, x.d.abs)}>{x.d.isNew ? 'new' : fmtPct(x.d.pct)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
