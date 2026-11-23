import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { METRICS, aggregate, attribute, delta, fmt, fmtDelta, fmtPct, groupBy, metricsOf, tone } from '../lib/metrics';
import { DIM } from '../lib/filters';
import { DeltaText, Seg } from './ui';

export const VIEWS = [
  ['summary', 'Current + Δ'],
  ['side', 'Current vs Prev'],
  ['abs', 'Δ Actual'],
  ['pct', 'Δ %'],
  ['contrib', 'Contribution to Δ'],
];

/**
 * Group-wise metric table for the current period compared with the previous one.
 * Clicking a cell opens the delta explorer for that metric (drilled into the group).
 */
export function MetricTable({ currRows, prevRows, dim, metrics = METRICS.map((m) => m.key), onExplore, view: viewProp, onViewChange, title, maxRows }) {
  const [viewState, setViewState] = useState('summary');
  const view = viewProp ?? viewState;
  const setView = onViewChange ?? setViewState;
  const [sort, setSort] = useState({ key: 'sent', dir: -1 });
  const get = DIM[dim].get;

  const data = useMemo(() => {
    const cg = groupBy(currRows, get), pg = groupBy(prevRows, get);
    const keys = [...new Set([...cg.keys(), ...pg.keys()])];
    const rows = keys.map((k) => ({ group: k, curr: metricsOf(cg.get(k)), prev: metricsOf(pg.get(k)), hasCurr: cg.has(k) }));
    const totals = { group: 'Total', curr: metricsOf(aggregate(currRows)), prev: metricsOf(aggregate(prevRows)) };
    const contrib = {};
    if (view === 'contrib') metrics.forEach((m) => {
      contrib[m] = Object.fromEntries(attribute(m, cg, pg).rows.map((r) => [r.group, r]));
    });
    return { rows, totals, contrib };
  }, [currRows, prevRows, get, view, metrics]);

  const sorted = useMemo(() => {
    const val = (r) => {
      if (sort.key === 'group') return r.group;
      const c = r.curr[sort.key], p = r.prev[sort.key];
      if (view === 'abs' || view === 'pct') { const d = delta(c, p); return view === 'abs' ? d.abs : d.pct; }
      if (view === 'contrib') return data.contrib[sort.key]?.[r.group]?.contrib;
      return c;
    };
    return [...data.rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === 'string') return sort.dir * x.localeCompare(y);
      return sort.dir * ((x ?? -Infinity) - (y ?? -Infinity));
    });
  }, [data, sort, view]);

  const shown = maxRows ? sorted.slice(0, maxRows) : sorted;
  const clickSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === 'group' ? 1 : -1 }));

  const cell = (row, m, isTotal) => {
    const c = row.curr[m], p = row.prev[m];
    const d = delta(c, p);
    switch (view) {
      case 'side':
        return <><div className="cell-main">{fmt(m, c, { short: true })}</div><div className="cell-sub flat">{fmt(m, p, { short: true })}</div></>;
      case 'abs':
        return <span className={tone(m, d.abs)} style={{ fontWeight: 650 }}>{fmtDelta(m, d.abs, { short: true })}</span>;
      case 'pct':
        return <span className={tone(m, d.abs)} style={{ fontWeight: 650 }}>{d.isNew ? 'new' : fmtPct(d.pct)}</span>;
      case 'contrib': {
        if (isTotal) return <span className={tone(m, d.abs)} style={{ fontWeight: 650 }}>{fmtDelta(m, d.abs, { short: true })}</span>;
        const r = data.contrib[m]?.[row.group];
        if (!r) return '—';
        return <><div className={tone(m, r.contrib)} style={{ fontWeight: 650 }}>{fmtDelta(m, r.contrib, { short: true })}</div><div className="cell-sub flat">{r.share != null ? `${r.share.toFixed(0)}% of Δ` : ''}</div></>;
      }
      default:
        return <><div className="cell-main">{fmt(m, c, { short: true })}</div><div className="cell-sub"><DeltaText metric={m} {...d} short /></div></>;
    }
  };

  const exportCsv = () => {
    const head = [DIM[dim].label, ...metrics.flatMap((m) => [`${m} current`, `${m} previous`, `${m} delta`, `${m} delta %`])];
    const lines = [head, ...[...sorted, data.totals].map((r) => [r.group, ...metrics.flatMap((m) => {
      const d = delta(r.curr[m], r.prev[m]);
      return [r.curr[m] ?? '', r.prev[m] ?? '', d.abs ?? '', d.pct ?? ''];
    })])];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${title || DIM[dim].label}.csv`;
    a.click();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Seg options={VIEWS} value={view} onChange={setView} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="hint">Click any cell to see what drove that change</span>
          <button className="btn" onClick={exportCsv}><Download size={13} /> CSV</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th className="sortable" onClick={() => clickSort('group')}>{DIM[dim].label}{sort.key === 'group' ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
              {metrics.map((m) => {
                const meta = METRICS.find((x) => x.key === m);
                return <th key={m} className="sortable" title={meta.desc} onClick={() => clickSort(m)}>{meta.short || meta.label}{sort.key === m ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.group}>
                <td title={r.group}>{r.group}{!r.hasCurr && <span className="pill" style={{ marginLeft: 6 }}>prev only</span>}</td>
                {metrics.map((m) => <td key={m} className="click" onClick={() => onExplore?.(m, dim, r.group)}>{cell(r, m)}</td>)}
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              {metrics.map((m) => <td key={m} className="click" onClick={() => onExplore?.(m, dim)}>{cell(data.totals, m, true)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {maxRows && sorted.length > maxRows && <div className="hint" style={{ marginTop: 6 }}>Showing top {maxRows} of {sorted.length} by the sorted column.</div>}
    </div>
  );
}
