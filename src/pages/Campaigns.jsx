import { useDeferredValue, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../state';
import { SOURCES } from '../lib/data';
import { MetricTable } from '../components/MetricTable';
import { Card, PageHead, Seg } from '../components/ui';

const METRIC_COLS = ['sent', 'delivered', 'clicks', 'orders', 'deliveryRate', 'ctr', 'cvr', 'cost', 'cpc', 'cpo', 'gtv', 'revenue', 'cir'];

export function Campaigns() {
  const { currRows, prevRows, explore } = useApp();
  const [source, setSource] = useState('all');
  const [level, setLevel] = useState('campaign');
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim().toLowerCase());

  const pick = useMemo(() => (r) => (source === 'all' || r.source === source)
    && (level !== 'journeyName' || r.source === 'CJ')
    && (!query || r.name.toLowerCase().includes(query) || r.id.toLowerCase().includes(query) || r.journeyName.toLowerCase().includes(query)), [source, level, query]);
  const c = useMemo(() => currRows.filter(pick), [currRows, pick]);
  const p = useMemo(() => prevRows.filter(pick), [prevRows, pick]);

  return (
    <div>
      <PageHead title="Campaigns">
        Campaign-level (or journey-level) performance for the current period, with the change versus the same campaign in the previous period.
      </PageHead>
      <Card
        title={level === 'campaign' ? 'Campaign table' : 'Journey table'}
        right={<>
          <Seg options={[['campaign', 'By campaign'], ['journeyName', 'By journey']]} value={level} onChange={setLevel} />
          <Seg options={[['all', 'All'], ...Object.entries(SOURCES).map(([k, v]) => [k, v.label])]} value={level === 'journeyName' ? 'CJ' : source} onChange={setSource} />
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--dim)' }} />
            <input className="input" style={{ paddingLeft: 28, width: 240 }} placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </>}>
        <MetricTable currRows={c} prevRows={p} dim={level} metrics={METRIC_COLS} onExplore={explore} title={level === 'campaign' ? 'Campaigns' : 'Journeys'} maxRows={300} />
      </Card>
    </div>
  );
}
