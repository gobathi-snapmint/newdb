import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fmtDelta, fmtPct, tone } from '../lib/metrics';

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>;
      })}
    </div>
  );
}

export function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

export function Select({ value, onChange, options, style }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} style={style}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function MultiSelect({ options, value, onChange, placeholder = 'All' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const label = !value.length ? placeholder : value.length <= 2 ? value.map((v) => options.find((o) => o.value === v)?.label || v).join(', ') : `${value.length} selected`;
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="ms" ref={ref}>
      <button className="input ms-btn" onClick={() => setOpen((o) => !o)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: value.length ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="ms-pop">
          <div className="ms-actions">
            <button onClick={() => onChange(options.map((o) => o.value))}>Select all</button>
            <button onClick={() => onChange([])}>Clear</button>
          </div>
          {options.map((o) => (
            <label key={o.value} className="ms-item">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.count != null && <span className="hint">{o.count.toLocaleString('en-IN')}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// "+₹12.40 · +8.2%" coloured by whether the move is good for this metric
export function DeltaText({ metric, abs, pct, isNew, showAbs = true, showPct = true, short }) {
  const t = tone(metric, abs);
  if (abs == null) return <span className="flat">—</span>;
  return (
    <span className={t}>
      {showAbs && fmtDelta(metric, abs, { short })}
      {showAbs && showPct && ' · '}
      {showPct && (isNew ? 'new' : fmtPct(pct))}
    </span>
  );
}

export function Card({ title, sub, right, children, style }) {
  return (
    <div className="card" style={style}>
      {(title || right) && (
        <div className="card-head">
          <div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div>
          {right && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHead({ title, children }) {
  return <div className="page-head"><div><h1>{title}</h1>{children && <p>{children}</p>}</div></div>;
}

// Categorical palette (stable order) + previous-period grey
export const PALETTE = ['#4f46e5', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16', '#f97316', '#64748b', '#a855f7'];
export const colorFor = (i) => PALETTE[i % PALETTE.length];

export function ChartTooltip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip-box">
      <div className="tt-title">{label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          <span><span className="swatch" style={{ background: p.color || p.fill }} />{p.name}</span>
          <b className="num">{format ? format(p.value, p.dataKey) : p.value}</b>
        </div>
      ))}
    </div>
  );
}
