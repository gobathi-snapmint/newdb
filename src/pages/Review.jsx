import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Code, FileText, Plus, Presentation, Printer, Sparkles, Trash2, X } from 'lucide-react';
import { useApp } from '../state';
import { METRIC, fmt, fmtDelta, fmtPct, tone } from '../lib/metrics';
import { DIM_TITLE, EXTRA_METRICS, REVIEW_DIMS, REVIEW_METRICS, buildReport, draftSection, scopeFilter, scopeKpis, scopeTitle } from '../lib/review';
import { analyseScope } from '../lib/storyboard';
import { downloadHtml, downloadMarkdown, downloadPptx } from '../lib/reportExport';
import { ChartTooltip, PageHead, Seg } from '../components/ui';

const PREV = '#94a3b8', CURR = '#4f46e5';
const NOTES_KEY = 'crm-review-notes-v1', SCOPES_KEY = 'crm-review-scopes-v1', TITLE_KEY = 'crm-review-title-v1';
const DEFAULT_SCOPES = [
  { id: 'MKP-NU', product: 'MKP', audience: 'NU' },
  { id: 'MKP-RU', product: 'MKP', audience: 'RU' },
  { id: 'PLN', product: 'PLN' },
  { id: 'overall' },
];
const EMPTY_NOTES = { metric: {}, why: {}, actions: '' };

const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const uniq = (rows, key) => {
  const m = new Map();
  rows.forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + r.sent));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
};

export function Review() {
  const { currRows, prevRows, periods } = useApp();
  const [metrics, setMetrics] = useState(REVIEW_METRICS);
  const [dims, setDims] = useState(REVIEW_DIMS);
  const [topN, setTopN] = useState(8);
  const [view, setView] = useState('both');
  const [notes, setNotes] = useState(() => ({ ...EMPTY_NOTES, ...load(NOTES_KEY, {}) }));
  const [scopes, setScopes] = useState(() => load(SCOPES_KEY, DEFAULT_SCOPES));
  const [title, setTitle] = useState(() => load(TITLE_KEY, 'CRM Performance Review'));
  const [busy, setBusy] = useState('');

  useEffect(() => { save(NOTES_KEY, notes); }, [notes]);
  useEffect(() => { save(SCOPES_KEY, scopes); }, [scopes]);
  useEffect(() => { save(TITLE_KEY, title); }, [title]);

  const ordered = [...REVIEW_METRICS, ...EXTRA_METRICS].filter((k) => metrics.includes(k));
  const orderedDims = [...REVIEW_DIMS, 'segment'].filter((d) => dims.includes(d));
  const report = useMemo(() => buildReport(currRows, prevRows, periods, { metrics: ordered, dims: orderedDims, topN }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currRows, prevRows, periods, ordered.join(), orderedDims.join(), topN]);

  const products = useMemo(() => uniq([...currRows, ...prevRows], 'product'), [currRows, prevRows]);
  const audiences = useMemo(() => uniq([...currRows, ...prevRows], 'audience'), [currRows, prevRows]);
  const whys = useMemo(() => scopes.map((s) => {
    const c = currRows.filter(scopeFilter(s)), p = prevRows.filter(scopeFilter(s));
    return { ...s, title: scopeTitle(s), curr: c, prev: p, kpis: scopeKpis(c, p), empty: !c.length && !p.length };
  }), [scopes, currRows, prevRows]);

  const setMetricNote = (k, t) => setNotes((n) => ({ ...n, metric: { ...n.metric, [k]: t } }));
  const setWhyNote = (id, t) => setNotes((n) => ({ ...n, why: { ...n.why, [id]: t } }));
  const toggle = (list, set, k) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn({ report, notes, whys, title }); } finally { setBusy(''); }
  };
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="review">
      <PageHead title="Review Report">
        A detailed review of {report.periodLabel}: every metric with its overall move and a breakup by product line, channel, audience and type of campaign.
        Write your insights in the boxes under each metric, fill in “What has changed and why?” and the action items, then download it as PowerPoint, HTML or Markdown.
        Notes are saved in this browser only.
      </PageHead>

      <div className="card no-print rv-controls">
        <div className="rv-row">
          <span className="hint">Report title</span>
          <input className="input" style={{ width: 280 }} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="rv-exports">
            <button className="btn primary" disabled={!!busy} onClick={() => run('ppt', downloadPptx)}><Presentation size={13} /> {busy === 'ppt' ? 'Building…' : 'PowerPoint'}</button>
            <button className="btn" disabled={!!busy} onClick={() => run('html', downloadHtml)}><Code size={13} /> HTML</button>
            <button className="btn" disabled={!!busy} onClick={() => run('md', downloadMarkdown)}><FileText size={13} /> {busy === 'md' ? 'Building…' : 'Markdown'}</button>
            <button className="btn" onClick={() => window.print()}><Printer size={13} /> Print / PDF</button>
          </div>
        </div>
        <div className="rv-row">
          <span className="hint">Metrics</span>
          {[...REVIEW_METRICS, ...EXTRA_METRICS].map((k) => (
            <button key={k} className={`chip ${metrics.includes(k) ? 'on' : ''}`} onClick={() => toggle(metrics, setMetrics, k)}>{k === 'cost' ? 'Cost (targeting)' : METRIC[k].label}</button>
          ))}
        </div>
        <div className="rv-row">
          <span className="hint">Breakups</span>
          {[...REVIEW_DIMS, 'segment'].map((d) => (
            <label key={d} className="hint rv-check"><input type="checkbox" checked={dims.includes(d)} onChange={() => toggle(dims, setDims, d)} /> {DIM_TITLE[d]}</label>
          ))}
          <span className="hint">Top</span>
          <select className="select" value={topN} onChange={(e) => setTopN(+e.target.value)}>{[5, 8, 12, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <span className="hint">Show</span>
          <Seg options={[['both', 'Charts + tables'], ['charts', 'Charts'], ['tables', 'Tables']]} value={view} onChange={setView} />
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => { if (window.confirm('Clear all notes on this page?')) setNotes(EMPTY_NOTES); }}><Trash2 size={13} /> Clear notes</button>
        </div>
        <div className="rv-toc">
          {report.sections.map((s, i) => <button key={s.key} className="chip" onClick={() => jump(`rv-${s.key}`)}>{i + 1}. {s.title}</button>)}
          <button className="chip" onClick={() => jump('rv-why')}>What changed and why</button>
          <button className="chip" onClick={() => jump('rv-actions')}>Action items</button>
        </div>
      </div>

      <div className="stack">
        {report.sections.map((s, i) => (
          <MetricSection key={s.key} n={i + 1} s={s} view={view} report={report}
            note={notes.metric[s.key] || ''} setNote={(t) => setMetricNote(s.key, t)} />
        ))}

        <div id="rv-why" className="rv-part-title">What has changed and why?</div>
        {whys.map((w) => (
          <WhyCard key={w.id} w={w} note={notes.why[w.id] || ''} setNote={(t) => setWhyNote(w.id, t)}
            onRemove={() => setScopes((list) => list.filter((x) => x.id !== w.id))} />
        ))}
        <AddScope products={products} audiences={audiences} scopes={scopes} onAdd={(s) => setScopes((list) => [...list, s])} />

        <section id="rv-actions" className="card rv-section">
          <h2 className="rv-h">Action items</h2>
          <NoteBox value={notes.actions} onChange={(t) => setNotes((n) => ({ ...n, actions: t }))} rows={8}
            placeholder={'e.g.\n1. Cap SMS frequency for MKP NU — owner, date\n2. Re-test the PLN push creative'} />
        </section>
      </div>
    </div>
  );
}

function MetricSection({ n, s, view, report, note, setNote }) {
  const o = s.overall;
  return (
    <section id={`rv-${s.key}`} className="card rv-section">
      <h2 className="rv-h"><span className="sb-num">{n}.</span> {s.title}</h2>
      <div className="rv-overall">
        <div>
          <div className="rv-sub">{s.overallTitle}</div>
          <div className="rv-kpis">
            <div><span>Previous</span><b>{fmt(s.key, o.prev)}</b><small>{report.prev}</small></div>
            <div><span>Current</span><b>{fmt(s.key, o.curr)}</b><small>{report.curr}</small></div>
            <div><span>Δ</span><b className={tone(s.key, o.abs)}>{fmtDelta(s.key, o.abs)}</b></div>
            <div><span>Δ %</span><b className={tone(s.key, o.abs)}>{fmtPct(o.pct)}</b></div>
          </div>
        </div>
        <TrendChart s={s} />
      </div>
      <div className="grid2 rv-breakups">
        {s.breakdowns.map((b) => <Breakup key={b.dim} s={s} b={b} view={view} />)}
      </div>
      <div className="rv-sub" style={{ marginTop: 14 }}>Insights — what did we notice?</div>
      <NoteBox value={note} onChange={setNote} placeholder={`What stands out in ${s.title}? Why did it move?`}
        draft={() => draftSection(s, report.prev, report.curr)} />
    </section>
  );
}

function TrendChart({ s }) {
  const f = (v) => fmt(s.key, v, { short: true });
  return (
    <div style={{ height: 200, minWidth: 0 }}>
      <ResponsiveContainer>
        <LineChart data={s.trend} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={{ fontSize: 10.5, fill: 'var(--muted)' }} tickFormatter={f} width={60} domain={s.isCount ? [0, 'auto'] : ['auto', 'auto']} />
          <Tooltip content={<ChartTooltip format={(v) => fmt(s.key, v)} />} />
          <Legend wrapperStyle={{ fontSize: 11.5 }} />
          <Line dataKey="prev" name={`Previous (${s.trendStep === 7 ? 'by week' : 'same day'})`} stroke={PREV} strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="curr" name="Current" stroke={CURR} strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Breakup({ s, b, view }) {
  const f = (v) => fmt(s.key, v, { short: true });
  return (
    <div className="rv-breakup">
      <div className="rv-sub">Breakup by {b.title.toLowerCase()}</div>
      {view !== 'tables' && (
        <div style={{ height: b.rows.length * 36 + 40 }}>
          <ResponsiveContainer>
            <BarChart data={b.rows} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barGap={1}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" hide domain={[0, 'auto']} />
              <YAxis type="category" dataKey="group" width={110} tick={{ fontSize: 11, fill: 'var(--text)' }} />
              <Tooltip cursor={{ fill: 'var(--surface2)' }} content={<ChartTooltip format={(v) => fmt(s.key, v)} />} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="prev" name="Previous" fill={PREV} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                <LabelList dataKey="prev" position="right" formatter={f} style={{ fontSize: 10, fill: 'var(--muted)' }} />
              </Bar>
              <Bar dataKey="curr" name="Current" fill={CURR} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                <LabelList dataKey="curr" position="right" formatter={f} style={{ fontSize: 10, fill: 'var(--muted)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {view !== 'charts' && (
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table className="t">
            <thead><tr><th>{b.title}</th><th>Previous</th><th>Current</th><th>Δ</th><th>Δ %</th><th>{s.isCount ? 'Share' : 'Sent share'}</th></tr></thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.group} className={r.others ? 'hint' : ''}>
                  <td>{r.group}</td>
                  <td>{fmt(s.key, r.prev)}</td>
                  <td>{fmt(s.key, r.curr)}</td>
                  <td className={tone(s.key, r.abs)}>{fmtDelta(s.key, r.abs, { short: true })}</td>
                  <td className={tone(s.key, r.abs)}>{r.isNew ? 'new' : fmtPct(r.pct)}</td>
                  <td>{r.shareCurr == null ? '—' : `${r.shareCurr.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {b.summary && <div className="hint" style={{ marginTop: 6 }}>{b.summary}</div>}
    </div>
  );
}

function WhyCard({ w, note, setNote, onRemove }) {
  const draft = () => {
    const a = analyseScope(w.curr, w.prev, 'cpo');
    return [a.headline, ...(a.findings || []).filter((x) => x.tone === 'bad' || x.tone === 'good').slice(0, 5).map((x) => `• ${x.area}: ${x.text}`)].join('\n');
  };
  return (
    <section id={`rv-why-${w.id}`} className="card rv-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="rv-h" style={{ margin: 0 }}>What has changed and why? – {w.title}</h2>
        <button className="btn no-print" style={{ marginLeft: 'auto' }} title="Remove this box" onClick={onRemove}><X size={13} /></button>
      </div>
      {w.empty ? <div className="hint" style={{ margin: '10px 0' }}>No data for {w.title} in either period with the current filters.</div> : (
        <div className="rv-kpis rv-kpis-wide">
          {w.kpis.map((k) => (
            <div key={k.key}><span>{k.label}</span><b>{fmt(k.key, k.curr, { short: true })}</b>
              <small>was {fmt(k.key, k.prev, { short: true })} · <span className={tone(k.key, k.abs)}>{fmtPct(k.pct)}</span></small></div>
          ))}
        </div>
      )}
      <NoteBox value={note} onChange={setNote} rows={6} placeholder={`What changed for ${w.title}, and why?`} draft={w.empty ? null : draft} />
    </section>
  );
}

function AddScope({ products, audiences, scopes, onAdd }) {
  const [product, setProduct] = useState('');
  const [audience, setAudience] = useState('');
  const id = [product || (audience ? 'overall' : ''), audience].filter(Boolean).join('-') || 'overall';
  const exists = scopes.some((s) => s.id === id);
  return (
    <div className="card no-print rv-row">
      <span className="hint">Add a “What has changed and why?” box for</span>
      <select className="select" value={product} onChange={(e) => setProduct(e.target.value)}>
        <option value="">Overall (all product lines)</option>
        {products.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>
        <option value="">All audiences</option>
        {audiences.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <button className="btn" disabled={exists} onClick={() => onAdd({ id, product: product || undefined, audience: audience || undefined })}>
        <Plus size={13} /> {exists ? 'Already added' : 'Add'}
      </button>
    </div>
  );
}

function NoteBox({ value, onChange, placeholder, rows = 5, draft }) {
  return (
    <div className="rv-note">
      <textarea className="rv-textarea no-print" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="rv-note-print">{value?.trim() || '—'}</div>
      {draft && (
        <button className="btn no-print" style={{ alignSelf: 'flex-start' }} title="Insert a draft written from the numbers — edit it after"
          onClick={() => { const t = draft(); onChange(value?.trim() ? `${value}\n\n${t}` : t); }}>
          <Sparkles size={13} /> Draft from data
        </button>
      )}
    </div>
  );
}

