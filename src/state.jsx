import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadDefaultFiles } from './lib/data';
import { applyFilters, computePeriods, defaultPeriod, inRange } from './lib/filters';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const EMPTY_FILTERS = { source: [], campaignType: [], audience: [], channel: [], product: [], segment: [], exp: 'All' };

export function AppProvider({ children }) {
  const [files, setFiles] = useState(null); // { CO: {rows, info}, CR: ..., CJ: ... }
  const [period, setPeriod] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tab, setTab] = useState('overview');
  const [explorer, setExplorer] = useState({ metric: 'cpo', dim: 'channel', path: [] });

  useEffect(() => { loadDefaultFiles().then(setFiles); }, []);

  const allRows = useMemo(() => (files ? [...files.CO.rows, ...files.CR.rows, ...files.CJ.rows] : []), [files]);

  // Reset the period whenever a new data set arrives
  useEffect(() => { if (files) setPeriod(defaultPeriod(allRows)); }, [files, allRows]);

  const replaceFile = useCallback((src, parsed) => setFiles((f) => ({ ...f, [src]: parsed })), []);

  const months = useMemo(() => [...new Set(allRows.map((r) => r.monthKey))].sort(), [allRows]);
  const maxDate = useMemo(() => allRows.reduce((m, r) => (r.dateKey > m ? r.dateKey : m), ''), [allRows]);
  const minDate = useMemo(() => allRows.reduce((m, r) => (!m || r.dateKey < m ? r.dateKey : m), ''), [allRows]);

  const filtered = useMemo(() => applyFilters(allRows, filters), [allRows, filters]);
  const periods = useMemo(() => (period ? computePeriods(period) : null), [period]);
  const currRows = useMemo(() => (periods ? inRange(filtered, periods.curr) : []), [filtered, periods]);
  const prevRows = useMemo(() => (periods ? inRange(filtered, periods.prev) : []), [filtered, periods]);

  // Jump to the delta explorer for a metric, optionally already drilled into a group.
  const explore = useCallback((metric, dim, value) => {
    setExplorer({ metric, dim: value != null ? nextDim(dim) : dim || 'channel', path: value != null ? [{ dim, value }] : [] });
    setTab('delta');
    window.scrollTo({ top: 0 });
  }, []);

  const value = {
    files, replaceFile, allRows, months, maxDate, minDate,
    period, setPeriod, filters, setFilters, resetFilters: () => setFilters(EMPTY_FILTERS),
    filtered, periods, currRows, prevRows,
    tab, setTab, explorer, setExplorer, explore,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ORDER = ['channel', 'audience', 'campaignType', 'product', 'segment', 'source', 'campaign'];
export function nextDim(dim, used = []) {
  const taken = new Set([dim, ...used]);
  return ORDER.find((d) => !taken.has(d)) || 'campaign';
}
