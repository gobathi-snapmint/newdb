import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useApp } from '../state';
import { METRICS, METRIC, aggregate, delta, fmt, fmtPct, groupBy, metricsOf, tone, value } from '../lib/metrics';
import { BUCKET, bucketLabel, dayLabel, inRange, weekStart } from '../lib/filters';
import { parseKey, toKey } from '../lib/data';
import { KpiGrid } from '../components/KpiGrid';
import { MetricTable } from '../components/MetricTable';
import { PeriodCompareTable, monthsAgoColumns } from '../components/PeriodCompareTable';
import { Card, ChartTooltip, PageHead, Seg, Select } from '../components/ui';

const SUB_TABS = [['overview', 'Overview'], ['catalog', 'Journey catalog'], ['deep', 'Journey deep dive'], ['periods', 'Week / day / month compare']];
const CHART_METRICS = METRICS.filter((m) => m.key !== 'campaigns');
const addDays = (k, n) => { const d = parseKey(k); return toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const journeyCount = (rows) => new Set(rows.map((r) => r.journeyName || r.journeyId)).size;

// Journey (cj_data) rows only, still honouring the filter bar
function useJourneyData() {
  const { filtered, currRows, prevRows, setFilters, explore } = useApp();
  return useMemo(() => {
    const isJ = (r) => r.source === 'CJ';
    // Opening the Delta Explorer from here limits it to journey data
    const open = (metric, journey) => {
      setFilters((f) => ({ ...f, source: ['CJ'] }));
      explore(metric, 'journeyName', journey);
    };
    return { all: filtered.filter(isJ), curr: currRows.filter(isJ), prev: prevRows.filter(isJ), open };
  }, [filtered, currRows, prevRows, setFilters, explore]);
}

export function Journeys() {
  const { periods } = useApp();
  const j = useJourneyData();
  const [tab, setTab] = useState('overview');
  const [journey, setJourney] = useState('');
  const openDeep = (name) => { setJourney(name); setTab('deep'); window.scrollTo({ top: 0 }); };

  return (
    <div>
      <PageHead title="Journeys">
        Journey campaigns (cj_data) only — {periods.curr.label} vs {periods.prev.label}, using the filters above. Click a journey name to open its deep dive, or any number to see what drove the change.
      </PageHead>
      <div style={{ marginBottom: 16 }}><Seg options={SUB_TABS} value={tab} onChange={setTab} /></div>
      {!j.all.length ? (
        <div className="card empty">No journey data for the current filters. Check that cj_data is loaded and that the Source filter includes Journey.</div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab j={j} openDeep={openDeep} />}
          {tab === 'catalog' && <CatalogTab j={j} openDeep={openDeep} />}
          {tab === 'deep' && <DeepDiveTab j={j} journey={journey} setJourney={setJourney} />}
          {tab === 'periods' && <PeriodsTab j={j} />}
        </>
      )}
    </div>
  );
}

// ---------- Overview ----------
function OverviewTab({ j, openDeep }) {
  const { periods } = useApp();
  const [n, setN] = useState(6);
  const curr = useMemo(() => metricsOf(aggregate(j.curr)), [j.curr]);
  const prev = useMemo(() => metricsOf(aggregate(j.prev)), [j.prev]);
  const cols = useMemo(() => monthsAgoColumns(periods.curr.from, periods.curr.to, n), [periods, n]);
  const jc = journeyCount(j.curr), jp = journeyCount(j.prev);
  return (
    <div className="stack">
      <div className="hint" style={{ fontSize: 13 }}>
        <b style={{ color: 'var(--text)' }}>{jc}</b> journeys active this period ({jp} in the previous period) · {new Set(j.curr.map((r) => r.journeyType)).size} journey types
      </div>
      <KpiGrid curr={curr} prev={prev} onSelect={(k) => j.open(k)} />
      <Card title="Journeys: target vs same dates in earlier months" sub="All journeys combined. Edit any date to compare a different range."
        right={<Seg options={[[3, '3 months'], [6, '6 months']]} value={n} onChange={setN} />}>
        <PeriodCompareTable columns={cols} rows={j.all} onOpen={(k) => j.open(k)} />
      </Card>
      <TopJourneysChart j={j} openDeep={openDeep} />
      <Card title="By journey type" sub="Current period with change vs previous">
        <MetricTable currRows={j.curr} prevRows={j.prev} dim="journeyType" onExplore={(m) => j.open(m)} title="Journey types" />
      </Card>
      <Card title="By channel (journeys only)">
        <MetricTable currRows={j.curr} prevRows={j.prev} dim="channel" onExplore={(m) => j.open(m)} title="Journey channels" />
      </Card>
      <TimeTable rows={j.curr} title={`Daily — ${periods.curr.label}`} defaultGran="day" />
    </div>
  );
}

function TopJourneysChart({ j, openDeep }) {
  const { periods } = useApp();
  const [bar, setBar] = useState('orders');
  const [line, setLine] = useState('cpo');
  const data = useMemo(() => {
    const cg = groupBy(j.curr, (r) => r.journeyName), pg = groupBy(j.prev, (r) => r.journeyName);
    return [...cg.keys()]
      .map((k) => ({ name: k, cBar: value(cg.get(k), bar), pBar: value(pg.get(k), bar), cLine: value(cg.get(k), line), pLine: value(pg.get(k), line) }))
      .sort((a, b) => (b.cBar ?? 0) - (a.cBar ?? 0))
      .slice(0, 12);
  }, [j, bar, line]);
  const key = (dk) => (dk.endsWith('Bar') ? bar : line);
  return (
    <Card title={`Top journeys by ${METRIC[bar].label}`} sub={`Bars: ${METRIC[bar].label} (current vs previous, left axis) · line: ${METRIC[line].label} (right axis). Click a journey to open its deep dive.`}
      right={<>
        <span className="hint">Bars</span><Select value={bar} onChange={setBar} options={CHART_METRICS.map((m) => [m.key, m.label])} />
        <span className="hint">Line</span><Select value={line} onChange={setLine} options={CHART_METRICS.map((m) => [m.key, m.label])} />
      </>}>
      <div style={{ height: 360 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} onClick={(e) => e?.activeLabel != null && openDeep(e.activeLabel)} style={{ cursor: 'pointer' }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} interval={0} angle={-22} textAnchor="end" height={78} />
            <YAxis yAxisId="l" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(bar, v, { short: true })} width={62} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(line, v, { short: true })} width={62} />
            <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v, dk) => fmt(key(dk), v)} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="pBar" name={`${METRIC[bar].label} · ${periods.prev.label}`} fill="var(--prev)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="l" dataKey="cBar" name={`${METRIC[bar].label} · ${periods.curr.label}`} fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="pLine" name={`${METRIC[line].label} · previous`} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.8} dot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="cLine" name={`${METRIC[line].label} · current`} stroke="#f59e0b" strokeWidth={2.4} dot={{ r: 4 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------- Catalog ----------
function CatalogTab({ j, openDeep }) {
  const [metric, setMetric] = useState('cpo');
  return (
    <div className="stack">
      <Card title="Every journey — all metrics" sub="Current period with the change vs previous. Click ▸ or a journey name to expand its channel-level and day-level breakdown; click a number to see what drove it.">
        <MetricTable currRows={j.curr} prevRows={j.prev} dim="journeyName" onExplore={(m, _d, g) => j.open(m, g)} title="Journeys"
          renderExpanded={(name) => <JourneyExpand j={j} name={name} openDeep={openDeep} />} />
      </Card>
      <Card title={`${METRIC[metric].label}: journey × channel`} sub="Current period value, with Δ % vs previous underneath"
        right={<Select value={metric} onChange={setMetric} options={CHART_METRICS.map((m) => [m.key, m.label])} />}>
        <CrossTable j={j} metric={metric} col={(r) => r.channel} openDeep={openDeep} />
      </Card>
      <Card title={`${METRIC[metric].label}: journey × audience type`}>
        <CrossTable j={j} metric={metric} col={(r) => r.audience} openDeep={openDeep} />
      </Card>
    </div>
  );
}

// Inline breakdown under a catalog row: the journey's channels and days, every metric
function JourneyExpand({ j, name, openDeep }) {
  const { periods } = useApp();
  const curr = useMemo(() => j.curr.filter((r) => r.journeyName === name), [j.curr, name]);
  const prev = useMemo(() => j.prev.filter((r) => r.journeyName === name), [j.prev, name]);
  const steps = new Set(curr.map((r) => r.id)).size;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="hint">
          <b style={{ color: 'var(--text)' }}>{name}</b> · {curr[0]?.journeyType || '—'} · {steps} campaigns/steps · {[...new Set(curr.map((r) => r.channel))].join(', ')} · {periods.curr.label} vs {periods.prev.label}
        </span>
        <button className="btn" onClick={() => openDeep(name)}>Open deep dive →</button>
      </div>
      <div>
        <h4>Channel level</h4>
        <MetricTable currRows={curr} prevRows={prev} dim="channel" onExplore={(m) => j.open(m, name)} title={`${name} by channel`} />
      </div>
      <div>
        <h4>Step / campaign level</h4>
        <MetricTable currRows={curr} prevRows={prev} dim="campaign" onExplore={(m) => j.open(m, name)} title={`${name} by step`} />
      </div>
      <TimeTable rows={curr} title={`${name} — day level (${periods.curr.label})`} defaultGran="day" />
    </>
  );
}

function CrossTable({ j, metric, col, openDeep }) {
  const { rowsK, colsK, cg, pg, rowTot } = useMemo(() => {
    const k = (r) => `${r.journeyName}\u0000${col(r)}`;
    const cg = groupBy(j.curr, k), pg = groupBy(j.prev, k);
    const rowTot = groupBy(j.curr, (r) => r.journeyName);
    const rowsK = [...rowTot.keys()].sort((a, b) => rowTot.get(b).sent - rowTot.get(a).sent);
    const colsK = [...new Set(j.curr.map(col))].sort();
    return { rowsK, colsK, cg, pg, rowTot };
  }, [j, col]);
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>Journey</th>{colsK.map((c) => <th key={c}>{c}</th>)}<th>All</th></tr></thead>
        <tbody>
          {rowsK.map((r) => (
            <tr key={r}>
              <td><button className="link" onClick={() => openDeep(r)}>{r}</button></td>
              {colsK.map((c) => {
                const cv = value(cg.get(`${r}\u0000${c}`), metric), pv = value(pg.get(`${r}\u0000${c}`), metric);
                const d = delta(cv, pv);
                return (
                  <td key={c} className="click" onClick={() => j.open(metric, r)}>
                    <div className="cell-main">{fmt(metric, cv, { short: true })}</div>
                    {cv != null && <div className={`cell-sub ${tone(metric, d.abs)}`}>{d.isNew ? 'new' : fmtPct(d.pct)}</div>}
                  </td>
                );
              })}
              <td style={{ fontWeight: 700 }}>{fmt(metric, value(rowTot.get(r), metric), { short: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Deep dive ----------
function DeepDiveTab({ j, journey, setJourney }) {
  const { periods } = useApp();
  const names = useMemo(() => {
    const g = groupBy(j.all, (r) => r.journeyName);
    return [...g.entries()].sort((a, b) => b[1].sent - a[1].sent).map(([k]) => k);
  }, [j.all]);
  const name = names.includes(journey) ? journey : names[0];
  const pick = (r) => r.journeyName === name;
  const all = useMemo(() => j.all.filter(pick), [j.all, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const curr = useMemo(() => j.curr.filter(pick), [j.curr, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => j.prev.filter(pick), [j.prev, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const cm = useMemo(() => metricsOf(aggregate(curr)), [curr]);
  const pm = useMemo(() => metricsOf(aggregate(prev)), [prev]);
  const cols = useMemo(() => monthsAgoColumns(periods.curr.from, periods.curr.to, 6), [periods]);
  const [dim, setDim] = useState('campaign');
  const info = all[0] || {};
  const range = all.length ? `${dayLabel(all.reduce((m, r) => (r.dateKey < m ? r.dateKey : m), all[0].dateKey))} – ${dayLabel(all.reduce((m, r) => (r.dateKey > m ? r.dateKey : m), all[0].dateKey))}` : '';

  return (
    <div className="stack">
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="hint">Journey</span>
        <Select value={name} onChange={setJourney} options={names} style={{ minWidth: 280 }} />
        <span className="hint">
          {info.journeyType && <>Type <b style={{ color: 'var(--text)' }}>{info.journeyType}</b> · </>}
          ID <b style={{ color: 'var(--text)' }}>{[...new Set(all.map((r) => r.journeyId))].join(', ') || '—'}</b> ·
          {' '}{new Set(all.map((r) => r.id)).size} campaigns/steps · {[...new Set(all.map((r) => r.channel))].join(', ')} · data {range}
        </span>
      </div>
      <KpiGrid curr={cm} prev={pm} onSelect={(k) => j.open(k, name)} />
      <Card title={`${name}: target vs same dates in earlier months`}>
        <PeriodCompareTable columns={cols} rows={all} onOpen={(k) => j.open(k, name)} />
      </Card>
      <JourneyTrend rows={all} />
      <Card title={`${name} — breakdown`} sub="Current period with change vs previous"
        right={<Seg options={[['campaign', 'By step / campaign'], ['channel', 'By channel'], ['audience', 'By audience'], ['product', 'By product'], ['segment', 'By segment']]} value={dim} onChange={setDim} />}>
        <MetricTable currRows={curr} prevRows={prev} dim={dim} onExplore={(m) => j.open(m, name)} title={`${name} by ${dim}`} />
      </Card>
      <TimeTable rows={all} title={`${name} — over time`} defaultGran="week" />
    </div>
  );
}

function JourneyTrend({ rows }) {
  const [gran, setGran] = useState('week');
  const [bar, setBar] = useState('orders');
  const [line, setLine] = useState('cpo');
  const data = useMemo(() => {
    const g = groupBy(rows, BUCKET[gran]);
    return [...g.keys()].sort().map((k) => ({ name: bucketLabel(gran, k), bar: value(g.get(k), bar), line: value(g.get(k), line) }));
  }, [rows, gran, bar, line]);
  return (
    <Card title="Trend" sub="Whole history of this journey (filter-bar period not applied)"
      right={<>
        <span className="hint">Bars</span><Select value={bar} onChange={setBar} options={CHART_METRICS.map((m) => [m.key, m.label])} />
        <span className="hint">Line</span><Select value={line} onChange={setLine} options={CHART_METRICS.map((m) => [m.key, m.label])} />
        <Seg options={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} value={gran} onChange={setGran} />
      </>}>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={14} />
            <YAxis yAxisId="l" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(bar, v, { short: true })} width={62} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={(v) => fmt(line, v, { short: true })} width={62} />
            <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v, k) => fmt(k === 'bar' ? bar : line, v)} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="bar" name={METRIC[bar].label} fill="var(--accent)" fillOpacity={0.8} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="r" dataKey="line" name={METRIC[line].label} stroke="#f59e0b" strokeWidth={2.4} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// Day / week / month rows × every metric, newest first; Δ view compares each row with the one before it
function TimeTable({ rows, title, defaultGran }) {
  const [gran, setGran] = useState(defaultGran);
  const [mode, setMode] = useState('values');
  const data = useMemo(() => {
    const g = groupBy(rows, BUCKET[gran]);
    const keys = [...g.keys()].sort();
    return keys.map((k, i) => ({ key: k, label: bucketLabel(gran, k), m: metricsOf(g.get(k)), p: i ? metricsOf(g.get(keys[i - 1])) : null })).reverse();
  }, [rows, gran]);
  const exportCsv = () => {
    const lines = [['Period', ...METRICS.map((m) => m.label)], ...data.map((d) => [d.label, ...METRICS.map((m) => d.m[m.key] ?? '')])];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${title}.csv`;
    a.click();
  };
  return (
    <Card title={title}
      right={<>
        <Seg options={[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} value={gran} onChange={setGran} />
        <Seg options={[['values', 'Values'], ['pct', 'Δ % vs previous row']]} value={mode} onChange={setMode} />
        <button className="btn" onClick={exportCsv}><Download size={13} /> CSV</button>
      </>}>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>{gran === 'day' ? 'Date' : gran === 'week' ? 'Week' : 'Month'}</th>{METRICS.map((m) => <th key={m.key} title={m.desc}>{m.short || m.label}</th>)}</tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                {METRICS.map((m) => {
                  if (mode === 'values') return <td key={m.key}>{fmt(m.key, d.m[m.key], { short: true })}</td>;
                  const dd = delta(d.m[m.key], d.p?.[m.key]);
                  return <td key={m.key} className={tone(m.key, dd.abs)}>{d.p ? (dd.isNew ? 'new' : fmtPct(dd.pct)) : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Week / day / month comparisons ----------
function PeriodsTab({ j }) {
  const { maxDate } = useApp();
  const [mode, setMode] = useState('week');
  const [journey, setJourney] = useState('all');
  const names = useMemo(() => [...new Set(j.all.map((r) => r.journeyName))].sort(), [j.all]);
  const rows = useMemo(() => (journey === 'all' ? j.all : j.all.filter((r) => r.journeyName === journey)), [j.all, journey]);

  const cols = useMemo(() => {
    if (mode === 'day') {
      // Latest day vs the day before and the same weekday 1–4 weeks back
      return [[0, 'Target day'], [1, 'Day before'], [7, '1W ago'], [14, '2W ago'], [21, '3W ago'], [28, '4W ago']]
        .map(([n, t]) => { const d = addDays(maxDate, -n); return { key: `d${n}`, title: t, from: d, to: d }; });
    }
    if (mode === 'week') {
      // Week-to-date (Monday → latest day) vs the same weekdays in the previous 6 weeks
      const ws = weekStart(maxDate);
      const len = Math.round((parseKey(maxDate) - parseKey(ws)) / 864e5);
      return Array.from({ length: 7 }, (_, i) => {
        const from = addDays(ws, -7 * i);
        return { key: `w${i}`, title: i ? `${i}W ago` : 'This week', from, to: addDays(from, len) };
      });
    }
    return monthsAgoColumns(`${maxDate.slice(0, 7)}-01`, maxDate, 6);
  }, [mode, maxDate]);

  const avgLabel = mode === 'day' ? 'Avg of compared days' : mode === 'week' ? '6W avg' : '6M avg';
  const sub = {
    day: `Latest day (${dayLabel(maxDate)}) vs the day before and the same weekday in earlier weeks.`,
    week: 'Week-to-date (Monday to the latest day) vs the same weekdays of the previous 6 weeks — like-for-like.',
    month: 'Month-to-date vs the same dates in the previous 6 months.',
  }[mode];
  const inData = inRange(rows, cols[0]).length;

  return (
    <div className="stack">
      <Card title="Journey comparison" sub={`${sub} Ignores the period in the filter bar; other filters apply. Dates are editable.`}
        right={<>
          <Select value={journey} onChange={setJourney} options={[['all', 'All journeys'], ...names]} style={{ minWidth: 220 }} />
          <Seg options={[['day', 'Same day'], ['week', 'Week on week'], ['month', 'Month on month']]} value={mode} onChange={setMode} />
        </>}>
        {!inData && <div className="hint" style={{ marginBottom: 8 }}>No data for this journey in the target column.</div>}
        <PeriodCompareTable columns={cols} rows={rows} avgLabel={avgLabel} onOpen={(k) => j.open(k, journey === 'all' ? undefined : journey)} />
      </Card>
    </div>
  );
}
