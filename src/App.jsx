import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, ChartLine, Route, Database, GitCompareArrows, LayoutDashboard, ListTree, Moon, Sun, CalendarRange, Table2 } from 'lucide-react';
import { AppProvider, useApp } from './state';
import { FilterBar } from './components/FilterBar';
import { Overview } from './pages/Overview';
import { Compare } from './pages/Compare';
import { DeltaExplorer } from './pages/DeltaExplorer';
import { MonthOnMonth } from './pages/MonthOnMonth';
import { Trends } from './pages/Trends';
import { VisualPerformance } from './pages/VisualPerformance';
import { Campaigns } from './pages/Campaigns';
import { Journeys } from './pages/Journeys';
import { Storyboard } from './pages/Storyboard';
import { DataPage } from './pages/DataPage';
import { dayLabel } from './lib/filters';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, page: Overview },
  { id: 'compare', label: 'Comparisons', icon: GitCompareArrows, page: Compare },
  { id: 'delta', label: 'Delta Explorer', icon: ListTree, page: DeltaExplorer },
  { id: 'story', label: 'Storyboard', icon: BookOpen, page: Storyboard },
  { id: 'mom', label: 'Month on Month', icon: CalendarRange, page: MonthOnMonth, noFilterPeriod: true },
  { id: 'journeys', label: 'Journeys', icon: Route, page: Journeys },
  { id: 'visual', label: 'Visual Performance', icon: ChartLine, page: VisualPerformance },
  { id: 'trends', label: 'Visual Trends', icon: BarChart3, page: Trends },
  { id: 'campaigns', label: 'Campaigns', icon: Table2, page: Campaigns },
  { id: 'data', label: 'Data', icon: Database, page: DataPage, noFilters: true },
];

function Shell() {
  const { files, period, periods, tab, setTab, allRows, maxDate } = useApp();
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('theme') || 'light'; } catch { return 'light'; } });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);

  if (!files || (allRows.length && !periods)) return <div className="loading">Reading CSV files…</div>;
  const active = TABS.find((t) => t.id === tab);
  const Page = active.page;
  const noData = !allRows.length;

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">CRM Performance<small>One-time · Recurring · Journey</small></div>
        {TABS.map((t) => (
          <button key={t.id} className={`nav-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
        <div className="sidebar-foot">
          {maxDate && <div>Data up to <b>{dayLabel(maxDate)}</b></div>}
          <div>{allRows.length.toLocaleString('en-IN')} rows</div>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />} {theme === 'dark' ? 'Light' : 'Dark'} mode
          </button>
        </div>
      </nav>
      <main className="main">
        {noData && tab !== 'data' ? (
          <div className="card empty" style={{ marginTop: 24 }}>
            No data loaded. Put <code>co_data.csv</code>, <code>cr_data.csv</code> and <code>cj_data.csv</code> in <code>public/data/</code>, or
            {' '}<button className="btn" onClick={() => setTab('data')}>upload them on the Data page</button>
          </div>
        ) : (
          <>
            {!active.noFilters && period && <FilterBar hidePeriod={active.noFilterPeriod} />}
            <Page />
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
