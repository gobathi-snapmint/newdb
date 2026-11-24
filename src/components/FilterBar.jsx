import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { useApp } from '../state';
import { SOURCES } from '../lib/data';
import { AVG_MONTHS, DIM, monthLabel } from '../lib/filters';
import { Field, MultiSelect, Seg, Select } from './ui';

function optionsFor(rows, key) {
  const counts = new Map();
  for (const r of rows) {
    const v = key === 'source' ? r.source : DIM[key].get(r);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, c]) => ({ value: v, label: key === 'source' ? `${v} · ${SOURCES[v]?.label || v}` : v, count: c }));
}

export function FilterBar({ hidePeriod }) {
  const { allRows, months, period, setPeriod, filters, setFilters, resetFilters, periods, minDate, maxDate } = useApp();
  const opts = useMemo(() => ({
    source: optionsFor(allRows, 'source'),
    campaignType: optionsFor(allRows, 'campaignType'),
    audience: optionsFor(allRows, 'audience'),
    channel: optionsFor(allRows, 'channel'),
    product: optionsFor(allRows, 'product'),
    segment: optionsFor(allRows, 'segment'),
  }), [allRows]);
  if (!period) return null;
  const set = (patch) => setPeriod((p) => ({ ...p, ...patch }));
  const setF = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const monthOpts = [...months].reverse().map((m) => [m, monthLabel(m)]);

  return (
    <div className="filterbar">
      {!hidePeriod && <div className="fb-row">
        <Field label="Period">
          <Seg options={[['mtd', 'MTD / Date range'], ['mom', 'Month on Month']]} value={period.mode} onChange={(mode) => set({ mode })} />
        </Field>
        {period.mode === 'mtd' ? (
          <>
            <Field label="From">
              <input type="date" className="input" value={period.from} min={minDate} max={period.to} onChange={(e) => e.target.value && set({ from: e.target.value })} />
            </Field>
            <Field label="To">
              <input type="date" className="input" value={period.to} min={period.from} max={maxDate} onChange={(e) => e.target.value && set({ to: e.target.value })} />
            </Field>
            <Field label="Compare with">
              <Select value={period.compare} onChange={(compare) => set({ compare })}
                options={[['prevMonth', 'Same dates last month'], ...AVG_MONTHS.map((n) => [`avg${n}`, `Avg of last ${n} months (same dates)`]), ['prevPeriod', 'Previous period (same length)'], ['custom', 'Custom range']]} />
            </Field>
            {period.compare === 'custom' && (
              <>
                <Field label="Compare from"><input type="date" className="input" value={period.cFrom} onChange={(e) => e.target.value && set({ cFrom: e.target.value })} /></Field>
                <Field label="Compare to"><input type="date" className="input" value={period.cTo} onChange={(e) => e.target.value && set({ cTo: e.target.value })} /></Field>
              </>
            )}
          </>
        ) : (
          <>
            <Field label="Month"><Select value={period.month} onChange={(month) => set({ month })} options={monthOpts} /></Field>
            <Field label="Compare with"><Select value={period.compareMonth} onChange={(compareMonth) => set({ compareMonth })}
              options={[...AVG_MONTHS.map((n) => [`avg${n}`, `Avg of last ${n} months`]), ...monthOpts]} /></Field>
          </>
        )}
        <div className="period-chip" style={{ marginLeft: 'auto', paddingBottom: 6 }}>
          <span className="pill curr">Current</span><b>{periods.curr.label}</b>
          <span>vs</span>
          <span className="pill">Previous</span><b>{periods.prev.label}</b>
        </div>
      </div>}
      <div className="fb-row">
        <Field label="Source"><MultiSelect options={opts.source} value={filters.source} onChange={setF('source')} /></Field>
        <Field label="Campaign type"><MultiSelect options={opts.campaignType} value={filters.campaignType} onChange={setF('campaignType')} /></Field>
        <Field label="Audience type"><MultiSelect options={opts.audience} value={filters.audience} onChange={setF('audience')} /></Field>
        <Field label="Channel"><MultiSelect options={opts.channel} value={filters.channel} onChange={setF('channel')} /></Field>
        <Field label="Product segment"><MultiSelect options={opts.product} value={filters.product} onChange={setF('product')} /></Field>
        <Field label="Segment"><MultiSelect options={opts.segment} value={filters.segment} onChange={setF('segment')} /></Field>
        <Field label="Experimental">
          <Seg options={[['All', 'All'], ['No', 'BAU only'], ['Yes', 'Experimental only']]} value={filters.exp} onChange={setF('exp')} />
        </Field>
        <button className="btn" onClick={resetFilters} title="Clear all filters"><RotateCcw size={13} /> Reset</button>
      </div>
    </div>
  );
}
