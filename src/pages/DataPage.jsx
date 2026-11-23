import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { useApp } from '../state';
import { SOURCES, parseCsv } from '../lib/data';
import { METRICS } from '../lib/metrics';
import { dayLabel } from '../lib/filters';
import { Card, PageHead } from '../components/ui';

function DropZone({ src }) {
  const { files, replaceFile } = useApp();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const f = files[src];
  const load = async (file) => {
    if (!file) return;
    setBusy(true);
    const parsed = await parseCsv(file, src);
    parsed.info.origin = `${file.name} (uploaded, this browser session only)`;
    replaceFile(src, parsed);
    setBusy(false);
  };
  const dates = f.rows.length ? f.rows.reduce((a, r) => [r.dateKey < a[0] ? r.dateKey : a[0], r.dateKey > a[1] ? r.dateKey : a[1]], ['9999', '0000']) : null;
  return (
    <Card title={`${src} · ${SOURCES[src].label}`} sub={<>Expected file: <code>{SOURCES[src].file}</code></>}>
      <label className={`drop ${over ? 'over' : ''}`} style={{ display: 'block' }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
        <input type="file" accept=".csv" hidden onChange={(e) => load(e.target.files[0])} />
        <Upload size={18} /><div>{busy ? 'Reading…' : 'Drop a CSV here or click to choose'}</div>
      </label>
      <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7 }}>
        {f.info.error ? <div className="status-err"><AlertTriangle size={14} /> {f.info.error}</div> : (
          <>
            <div className="status-ok"><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> {f.info.count.toLocaleString('en-IN')} rows loaded</div>
            <div>Source: <code>{f.info.origin}</code></div>
            {dates && <div>Dates: {dayLabel(dates[0])} – {dayLabel(dates[1])}</div>}
            {f.info.badDates > 0 && <div className="status-err">{f.info.badDates} rows skipped (Campaign_Start_Date could not be read)</div>}
            {f.info.missing.length > 0
              ? <div className="status-err">Missing columns: {f.info.missing.join(', ')}</div>
              : <div className="hint">All expected columns present.</div>}
          </>
        )}
      </div>
    </Card>
  );
}

export function DataPage() {
  return (
    <div>
      <PageHead title="Data">
        Everything is processed in your browser — nothing is uploaded anywhere. Put the files in <code>public/data/</code> to load them
        automatically, or drop them below to try a file for this session.
      </PageHead>
      <div className="stack">
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {Object.keys(SOURCES).map((s) => <DropZone key={s} src={s} />)}
        </div>
        <Card title="How the numbers are calculated">
          <table className="t">
            <thead><tr><th>Metric</th><th style={{ textAlign: 'left' }}>Definition</th></tr></thead>
            <tbody>{METRICS.map((m) => <tr key={m.key}><td>{m.label}</td><td style={{ textAlign: 'left' }}>{m.desc}</td></tr>)}</tbody>
          </table>
          <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--muted)', marginBottom: 0 }}>
            <li>Rates and per-unit costs are always recomputed from summed totals, never averaged across rows. The per-row ratio columns in the files (delivery_rate, cost_per_order …) are not used.</li>
            <li>Each row is dated by <code>Campaign_Start_Date</code>.</li>
            <li><b>Channel</b> comes from <code>Mode</code> (PNS → Push, PS → Push (PS), S → SMS, W → WhatsApp, E → Email, RCS → RCS); if Mode is blank, the first letter of <code>Channel</code> is used.</li>
            <li><b>Experimental</b> = any of Segment_1 – Segment_4 is <code>EXP</code>. Everything else counts as BAU.</li>
            <li><b>Campaign type</b> is the <code>Campaign_Type</code> column; <b>Source</b> is the file a row came from (co / cr / cj).</li>
            <li><b>Δ % on rate metrics</b> (Delivery %, CTR %, CVR %, CIR %) is the relative change; Δ Actual is shown in percentage points (pp).</li>
            <li><b>Contribution to Δ</b>: for totals (Sent, Cost …) it is each group's own change. For ratios (CPO, CTR …) group i contributes
              N<sub>i</sub>/D<sub>total</sub> (current) − N<sub>i</sub>/D<sub>total</sub> (previous), which adds up exactly to the total change. It is split into a
              <b> rate effect</b> (the group's own ratio moved) and a <b>mix effect</b> (the group's share of the denominator moved).</li>
            <li><b>Funnel drivers</b> split a change across funnel steps with a log-mean (LMDI) breakdown, e.g. CPO = Cost per Sent ÷ (Delivery % × CTR × CVR). The steps add up exactly to the total change.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
