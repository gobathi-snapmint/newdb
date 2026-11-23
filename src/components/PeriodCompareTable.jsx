import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '../state';
import { METRICS, aggregate, delta, fmt, fmtDelta, fmtPct, metricsOf, tone } from '../lib/metrics';
import { inRange, shiftMonth } from '../lib/filters';
import { parseKey } from '../lib/data';
import { Seg } from './ui';

const short = (k) => parseKey(k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
export const rangeCaption = (from, to) => `${short(from)} - ${short(to)}`;

// Target range plus the same dates 1..n months earlier
export function monthsAgoColumns(from, to, n) {
  return [
    { key: 't', title: 'Target', from, to },
    ...Array.from({ length: n }, (_, i) => ({ key: `m${i + 1}`, title: `${i + 1}M ago`, from: shiftMonth(from, -(i + 1)), to: shiftMonth(to, -(i + 1)) })),
  ];
}

/**
 * Metrics as rows, periods as columns: the first column is the target, the rest are
 * comparison periods, and the last column is the average of the comparison periods.
 * Each column's dates can be edited. Clicking a cell opens the Delta Explorer for
 * target vs that column.
 */
export function PeriodCompareTable({ columns: defaultCols, editable = true, avgLabel }) {
  const { filtered, setPeriod, explore } = useApp();
  const [edits, setEdits] = useState({});
  const [view, setView] = useState('values');
  const sig = defaultCols.map((c) => `${c.key}${c.from}${c.to}`).join('|');
  useEffect(() => setEdits({}), [sig]);

  const cols = defaultCols.map((c) => ({ ...c, ...edits[c.key] }));
  // A period with no rows at all is "no data" (—), not zeros, and is left out of the average
  const values = useMemo(() => cols.map((c) => { const rows = inRange(filtered, c); return rows.length ? metricsOf(aggregate(rows)) : {}; }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, cols.map((c) => c.from + c.to).join('|')]);

  const comp = values.slice(1);
  const withData = comp.filter((v) => v.sent != null).length;
  const avg = Object.fromEntries(METRICS.map((m) => {
    const v = comp.map((x) => x[m.key]).filter((x) => x != null);
    return [m.key, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null];
  }));
  const target = values[0];
  const setDate = (key, field, v) => v && setEdits((e) => ({ ...e, [key]: { ...e[key], [field]: v } }));

  const open = (metric, col) => {
    setPeriod((p) => ({ ...p, mode: 'mtd', from: cols[0].from, to: cols[0].to, compare: 'custom', cFrom: col.from, cTo: col.to }));
    explore(metric, 'channel');
  };

  const cell = (m, v) => {
    if (view === 'values' || v == null) return fmt(m, v);
    const d = delta(target[m], v);
    if (view === 'abs') return <span className={tone(m, d.abs)}>{fmtDelta(m, d.abs)}</span>;
    return <span className={tone(m, d.abs)}>{d.isNew ? 'new' : fmtPct(d.pct)}</span>;
  };

  const exportCsv = () => {
    const head = ['Metric', ...cols.map((c) => `${c.title} (${c.from} to ${c.to})`), avgLabel || `${comp.length}M avg`];
    const lines = [head, ...METRICS.map((m) => [m.label, ...values.map((v) => v[m.key] ?? ''), avg[m.key] ?? ''])];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'period-comparison.csv';
    a.click();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Seg options={[['values', 'Values'], ['abs', 'Target Δ actual'], ['pct', 'Target Δ %']]} value={view} onChange={setView} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="hint">{view === 'values' ? 'Click a cell to see what changed between the target and that period' : 'Target minus each period (green = target is better)'}</span>
          <button className="btn" onClick={exportCsv}><Download size={13} /> CSV</button>
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 'none' }}>
        <table className="t pct-table">
          <thead>
            <tr>
              <th>Metric</th>
              {cols.map((c, i) => (
                <th key={c.key} className={i === 0 ? 'target' : ''}>
                  <div className="pc-title">{c.title}</div>
                  {editable ? (
                    <div className="pc-dates">
                      <input type="date" value={c.from} max={c.to} onChange={(e) => setDate(c.key, 'from', e.target.value)} />
                      <input type="date" value={c.to} min={c.from} onChange={(e) => setDate(c.key, 'to', e.target.value)} />
                    </div>
                  ) : null}
                  <div className="pc-cap">{rangeCaption(c.from, c.to)}</div>
                </th>
              ))}
              <th className="avg"><div className="pc-title">{avgLabel || `${comp.length}M avg`}</div><div className="pc-cap">{withData === comp.length ? `mean of the ${comp.length} periods` : `mean of ${withData} periods with data`}</div></th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key}>
                <td title={m.desc}>{m.label}</td>
                {cols.map((c, i) => (
                  <td key={c.key} className={`${i === 0 ? 'target' : 'click'}`} onClick={i === 0 ? undefined : () => open(m.key, c)}>
                    {i === 0 ? fmt(m.key, target[m.key]) : cell(m.key, values[i][m.key])}
                  </td>
                ))}
                <td className="avg">{cell(m.key, avg[m.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
