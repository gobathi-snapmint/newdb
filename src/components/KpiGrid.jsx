import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { METRICS, delta, fmt } from '../lib/metrics';
import { DeltaText } from './ui';

// One card per metric; clicking a card opens the delta breakdown for it.
export function KpiGrid({ curr, prev, onSelect }) {
  return (
    <div className="kpis">
      {METRICS.map((m) => {
        const d = delta(curr[m.key], prev[m.key]);
        const Arrow = d.abs > 0 ? ArrowUpRight : d.abs < 0 ? ArrowDownRight : null;
        return (
          <button key={m.key} className="kpi" onClick={() => onSelect(m.key)} title={`${m.desc}. Click to see what drove the change.`}>
            <div className="k-label"><span>{m.label}</span>{Arrow && <Arrow size={13} />}</div>
            <div className="k-val num">{fmt(m.key, curr[m.key], { short: true })}</div>
            <div className="k-prev num">prev {fmt(m.key, prev[m.key], { short: true })}</div>
            <div className="k-delta num"><DeltaText metric={m.key} {...d} short /></div>
          </button>
        );
      })}
    </div>
  );
}
