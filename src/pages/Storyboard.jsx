import { useMemo, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import { useApp } from '../state';
import { METRIC, delta, fmt, fmtDelta, fmtPct, tone } from '../lib/metrics';
import { FOCUS_METRICS, analyseScope, chapterScopes, inScope, storyboardMarkdown } from '../lib/storyboard';
import { Card, MultiSelect, PageHead, Seg } from '../components/ui';

const LEVELS = [
  ['overall', 'Overall'],
  ['overallAudience', 'Overall × audience'],
  ['product', 'Product line overall'],
  ['productAudience', 'Product line × audience'],
];
const AREA_ORDER = ['Sent volume', 'Targeting mix', 'Same segment', 'Channel', 'Delivery', 'Engagement (CTR)', 'Conversion (CVR)', 'Unit cost', 'Revenue per order', 'Experiments'];

const bySent = (rows, key) => {
  const m = new Map();
  rows.forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + r.sent));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value, count }));
};

export function Storyboard() {
  const { currRows, prevRows, periods, setFilters, explore } = useApp();
  const [focus, setFocus] = useState('cpo');
  const [levels, setLevels] = useState({ overall: true, overallAudience: true, product: true, productAudience: true });
  const productOpts = useMemo(() => bySent([...currRows, ...prevRows], 'product'), [currRows, prevRows]);
  const audienceOpts = useMemo(() => bySent([...currRows, ...prevRows], 'audience'), [currRows, prevRows]);
  const [products, setProducts] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [minShare, setMinShare] = useState(1);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const chapters = useMemo(() => {
    const ps = productOpts.map((o) => o.value).filter((p) => !products.length || products.includes(p));
    const as = audienceOpts.map((o) => o.value).filter((a) => !audiences.length || audiences.includes(a));
    const total = currRows.reduce((s, r) => s + r.sent, 0) + prevRows.reduce((s, r) => s + r.sent, 0);
    let major = 0, minor = 0;
    return chapterScopes({ products: ps, audiences: as, levels }).flatMap((s) => {
      const c = currRows.filter(inScope(s)), p = prevRows.filter(inScope(s));
      const sent = c.reduce((x, r) => x + r.sent, 0) + p.reduce((x, r) => x + r.sent, 0);
      if (!sent || (s.depth && (sent / total) * 100 < minShare)) return [];
      if (s.depth === 0) { major++; minor = 0; } else minor++;
      return [{ ...s, num: s.depth === 0 ? `${major}.` : `${major || 0}.${minor}`, analysis: analyseScope(c, p, focus) }];
    });
  }, [currRows, prevRows, focus, levels, products, audiences, productOpts, audienceOpts, minShare]);

  const shown = onlyIssues ? chapters.filter((c) => c.analysis.issues || c.depth === 0) : chapters;
  const periodLabel = `${periods.curr.label} vs ${periods.prev.label}`;

  const openExplorer = (c) => {
    setFilters((f) => ({ ...f, product: c.product ? [c.product] : f.product, audience: c.audience ? [c.audience] : f.audience }));
    explore(focus, 'channel');
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([storyboardMarkdown(shown, { focus, periodLabel })], { type: 'text/markdown' }));
    a.download = `storyboard-${focus}.md`;
    a.click();
  };
  const jump = (id) => document.getElementById(`sb-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="storyboard">
      <PageHead title="Storyboard">
        An auto-written walk-through of {periodLabel}: first the overall picture, then each audience, then every product line overall and by audience.
        Each chapter explains how the numbers moved and why — volume, targeting mix, like-for-like segments, channels and the funnel — and flags likely issues to check.
      </PageHead>

      <div className="card no-print" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="hint">Explain</span>
          <Seg options={FOCUS_METRICS.map((k) => [k, METRIC[k].label])} value={focus} onChange={setFocus} />
          <span className="hint">Product lines</span>
          <div style={{ width: 200 }}><MultiSelect options={productOpts} value={products} onChange={setProducts} placeholder="All (by volume)" /></div>
          <span className="hint">Audiences</span>
          <div style={{ width: 180 }}><MultiSelect options={audienceOpts} value={audiences} onChange={setAudiences} placeholder="All (by volume)" /></div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="hint">Chapters</span>
          {LEVELS.map(([k, l]) => (
            <label key={k} className="hint" style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={levels[k]} onChange={(e) => setLevels((s) => ({ ...s, [k]: e.target.checked }))} /> {l}
            </label>
          ))}
          <label className="hint" style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            Skip audience chapters under
            <select className="select" value={minShare} onChange={(e) => setMinShare(+e.target.value)}>
              {[0, 0.5, 1, 2, 5].map((x) => <option key={x} value={x}>{x}%</option>)}
            </select> of sent
          </label>
          <label className="hint" style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only chapters with issues
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn" onClick={download}><Download size={13} /> Markdown</button>
            <button className="btn" onClick={() => window.print()}><Printer size={13} /> Print / PDF</button>
          </div>
        </div>
      </div>

      <div className="stack">
        <Summary chapters={shown} focus={focus} jump={jump} />
        {shown.map((c) => <Chapter key={c.id} c={c} focus={focus} onExplore={() => openExplorer(c)} />)}
        {!shown.length && <div className="card empty">No chapters — turn on at least one chapter type or relax the filters.</div>}
      </div>
    </div>
  );
}

function Summary({ chapters, focus, jump }) {
  const cell = (k, x) => <span className={tone(k, x.abs)}>{fmtPct(x.pct)}</span>;
  return (
    <Card title="Storyboard summary" sub="Every chapter in one table. Click a row to jump to it.">
      <div className="table-wrap" style={{ maxHeight: 'none' }}>
        <table className="t">
          <thead><tr><th>Chapter</th><th>Sent</th><th>Δ Sent</th><th>Orders</th><th>Δ Orders</th><th>Δ Cost</th><th>{METRIC[focus].label} prev → curr</th><th>Δ {METRIC[focus].label}</th><th style={{ textAlign: 'left' }}>Main funnel driver</th><th>Issues</th></tr></thead>
          <tbody>
            {chapters.map((c) => {
              const K = c.analysis.K;
              if (!K) return <tr key={c.id} className="click" onClick={() => jump(c.id)}><td style={{ paddingLeft: c.depth ? 26 : 10 }}>{c.num} {c.title}</td><td colSpan={9} style={{ textAlign: 'left' }} className="hint">{c.analysis.headline}</td></tr>;
              const f = K[focus];
              return (
                <tr key={c.id} className="click" onClick={() => jump(c.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ paddingLeft: c.depth ? 26 : 10, fontWeight: c.depth ? 500 : 700 }}>{c.num} {c.title}</td>
                  <td>{fmt('sent', K.sent.curr, { short: true })}</td>
                  <td>{cell('sent', K.sent)}</td>
                  <td>{fmt('orders', K.orders.curr, { short: true })}</td>
                  <td>{cell('orders', K.orders)}</td>
                  <td>{cell('cost', K.cost)}</td>
                  <td>{fmt(focus, f.prev)} → {fmt(focus, f.curr)}</td>
                  <td><span className={tone(focus, f.abs)} style={{ fontWeight: 700 }}>{fmtDelta(focus, f.abs)} · {fmtPct(f.pct)}</span></td>
                  <td style={{ textAlign: 'left' }}>{c.analysis.topDrv ? <>{c.analysis.topDrv.label} <span className={tone(focus, c.analysis.topDrv.contrib)}>{fmtPct(c.analysis.topDrv.pct)}</span></> : '—'}</td>
                  <td>{c.analysis.issues ? <span className="pill bad-pill">{c.analysis.issues}</span> : <span className="flat">0</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Chapter({ c, focus, onExplore }) {
  const a = c.analysis;
  const findings = [...a.findings].sort((x, y) => AREA_ORDER.indexOf(x.area) - AREA_ORDER.indexOf(y.area));
  const checks = findings.filter((f) => f.check);
  return (
    <div id={`sb-${c.id}`} className={`card sb-chapter ${c.depth ? 'sub' : ''}`}>
      <div className="card-head">
        <div>
          <div className="sb-num">Chapter {c.num}</div>
          <h3 style={{ fontSize: c.depth ? 16 : 19 }}>{c.title}</h3>
          <div className="sub">{c.product ? `Product line ${c.product}` : 'All product lines'} · {c.audience ? `Audience ${c.audience}` : 'All audiences'} · all channels</div>
        </div>
        <button className="btn no-print" onClick={onExplore}><Search size={13} /> Open in Delta Explorer</button>
      </div>
      <div className="story" style={{ marginTop: 0 }}>{a.headline}</div>
      {!a.empty && (
        <>
          <KpiStrip kpis={a.kpis} focus={focus} />
          {a.drv && (
            <div className="sb-drivers">
              <span className="hint">{METRIC[focus].label} funnel drivers:</span>
              {a.drv.factors.map((f) => (
                <span key={f.factor} className="sb-chip">
                  {f.label} <b>{fmtPct(f.pct)}</b> → <span className={tone(focus, f.contrib)}>{fmtDelta(focus, f.contrib)}</span>
                </span>
              ))}
            </div>
          )}
          <h4 className="sb-h">Why it happened</h4>
          <div className="sb-findings">
            {findings.map((f, i) => (
              <div key={i} className={`sb-finding ${f.tone}`}>
                <span className="sb-area">{f.area}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
          {!!checks.length && (
            <>
              <h4 className="sb-h">What might be the issue — things to check</h4>
              <ol className="sb-checks">
                {checks.map((f, i) => <li key={i}><b>{f.area}:</b> {f.check}</li>)}
              </ol>
            </>
          )}
          <div className="grid2" style={{ marginTop: 12 }}>
            <Contrib title="By channel" att={a.contrib.channel} focus={focus} />
            <Contrib title="By segment" att={a.contrib.segment} focus={focus} />
          </div>
        </>
      )}
    </div>
  );
}

function KpiStrip({ kpis, focus }) {
  return (
    <div className="table-wrap" style={{ marginTop: 12, maxHeight: 'none' }}>
      <table className="t sb-kpi">
        <thead><tr><th></th>{kpis.map((k) => <th key={k.key} className={k.key === focus ? 'sel' : ''}>{METRIC[k.key].short || METRIC[k.key].label}</th>)}</tr></thead>
        <tbody>
          <tr><td>Previous</td>{kpis.map((k) => <td key={k.key}>{fmt(k.key, k.prev, { short: true })}</td>)}</tr>
          <tr><td>Current</td>{kpis.map((k) => <td key={k.key} style={{ fontWeight: 700 }}>{fmt(k.key, k.curr, { short: true })}</td>)}</tr>
          <tr><td>Δ</td>{kpis.map((k) => <td key={k.key} className={tone(k.key, k.abs)}>{fmtDelta(k.key, k.abs, { short: true })}</td>)}</tr>
          <tr><td>Δ %</td>{kpis.map((k) => <td key={k.key} className={tone(k.key, k.abs)}>{k.isNew ? 'new' : fmtPct(k.pct)}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

function Contrib({ title, att, focus }) {
  const rows = att.rows.filter((r) => Math.abs(r.contrib) > 1e-9).slice(0, 6);
  const max = Math.max(...rows.map((r) => Math.abs(r.contrib)), 1e-9);
  return (
    <div>
      <h4 className="sb-h" style={{ marginTop: 0 }}>{METRIC[focus].label} change {title.toLowerCase()} (top 6)</h4>
      <table className="t">
        <thead><tr><th>{title.replace('By ', '')}</th><th>Prev → Curr</th><th>Contribution</th><th>Rate</th><th>Mix</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const d = delta(r.curr, r.prev);
            return (
              <tr key={r.group}>
                <td>{r.group}</td>
                <td>{fmt(focus, r.prev)} → {fmt(focus, r.curr)} <span className={tone(focus, d.abs)}>{fmtPct(d.pct)}</span></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <span className={tone(focus, r.contrib)} style={{ fontWeight: 700 }}>{fmtDelta(focus, r.contrib)}</span>
                    <span className="sb-bar"><span style={{ width: `${(Math.abs(r.contrib) / max) * 100}%`, background: tone(focus, r.contrib) === 'bad' ? 'var(--bad)' : 'var(--good)' }} /></span>
                  </div>
                </td>
                <td className={tone(focus, r.rate)}>{fmtDelta(focus, r.rate)}</td>
                <td className={tone(focus, r.mix)}>{fmtDelta(focus, r.mix)}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={5} className="hint">No change to attribute.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
