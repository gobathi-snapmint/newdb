# CRM Performance Dashboard (CO + CR + CJ)

React + Vite dashboard for One-time (CO), Recurring & Triggered (CR) and Journey (CJ) campaign performance.
Everything is processed **locally in the browser** — the CSVs are never sent anywhere.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5180
```

## Data

Put the three exports in `public/data/` (they are read on page load):

| File | Contents |
| --- | --- |
| `co_data.csv` | One-time campaigns |
| `cr_data.csv` | Recurring & triggered campaigns |
| `cj_data.csv` | Journey campaigns (adds `journey_id`, `journey_name`, `Journey_Type`) |

The files currently there are **dummy data** from `scripts/generate_dummy_data.py` (`npm run dummy-data` regenerates them).
Just overwrite them with the real files. You can also drop a file on the **Data** page to try it without copying it in
(that only lasts for the browser session). The Data page lists any missing columns and rows whose date couldn't be read.

Dates in `Campaign_Start_Date` can be `2026-11-03`, `03/11/26`, `03/11/2026`, `03-Nov-26` (slash dates are day/month).

## Pages

| Page | What it shows |
| --- | --- |
| Overview | KPI cards (current, previous, Δ actual, Δ %), auto-written "What changed" summary, table by source, day-by-day trend vs previous period, mix shift |
| Comparisons | Channel / audience type / campaign type / product / source / experimental / journey-wise tables with Δ, current vs previous bar chart, two-way matrix |
| Delta Explorer | Click any metric: funnel driver waterfall + where the change came from by any dimension (contribution, % of Δ, rate effect, mix effect), with Channel, Audience Type, Product Segment and Segment splits always shown below. Click a row to drill down (e.g. CPO → WhatsApp → audience → campaign) |
| Journeys | Journey (cj_data) campaigns only. **Overview**: KPI cards, target vs same dates in earlier months, top journeys chart, by journey type / channel, daily table. **Journey catalog**: every journey with all metrics and Δ — click a journey to expand its channel-level, step-level and day-level breakdown inline — journey × channel and journey × audience grids. **Deep dive**: pick a journey for its KPIs, month comparison, trend, breakdown by step / channel / audience / product / segment, and daily / weekly / monthly table. **Week / day / month compare**: week-to-date vs previous weeks, latest day vs earlier same weekdays, MTD vs earlier months |
| Storyboard | Auto-written report: Overall → Overall × each audience → each product line overall → product line × audience (e.g. MKP · Overall, MKP · NU, MKP · RU, PLN · Overall …). Each chapter has a headline, KPI table, funnel drivers, "why it happened" checks (sent volume, targeting mix, same-segment like-for-like, channel, delivery, CTR, CVR, unit cost, experiments), a list of things to check, and top channel / segment contributors. Pick the metric to explain (CPO, CIR, CTR, CVR, CPC), which chapters / products / audiences to include; export to Markdown or print to PDF. Rules live in `src/lib/storyboard.js` |
| Month on Month | Pick months; monthly table with MoM Δ actual / %, trend chart, dimension × month matrix |
| Visual Performance | Pick several metrics and plot them as separate charts (optionally split by a dimension), one combined chart (bars + lines, each metric on its own axis) or indexed to 100; current vs previous day-by-day small multiples; two-metric bar + line chart by any dimension; table behind the charts |
| Visual Trends | Daily / weekly / monthly trend of any metric, split by any dimension; funnel; CTR vs CVR efficiency map |
| Campaigns | Campaign- or journey-level table with Δ vs the previous period, search |
| Data | File status, upload, metric definitions |

Every table cell is clickable and opens the Delta Explorer for that metric (and group).

## Filters

- **Period**: *MTD / Date range* (from–to, compared with same dates last month, the previous period of equal length, or a custom range) or *Month on Month* (pick a month and the month to compare with).
- **Source, Campaign type, Audience type, Channel, Product segment, Segment** (multi-select) and **Experimental** (All / BAU only / Experimental only).

## Metric definitions

All ratios are recomputed from summed totals (the per-row ratio columns in the files are ignored).

| Metric | Formula |
| --- | --- |
| Campaigns | distinct `campaign_id` |
| Sent / Delivered / Clicks / Orders | sum of `Sent` / `Delivered` / `clicks` / `OrderSuccess` |
| Delivery % | Delivered ÷ Sent |
| CTR % | Clicks ÷ Delivered |
| CVR % | Orders ÷ Clicks |
| Cost | sum of `Cost` |
| CPC | Cost ÷ Clicks |
| CPO | Cost ÷ Orders |
| GTV / Revenue | sum of `gtv_click_attr` / `revenue_click_attr` |
| CIR % | Cost ÷ Revenue |

- **Channel** comes from `Mode` (PNS → Push, PS → Push (PS), S → SMS, W → WhatsApp, E → Email, RCS → RCS), falling back to the first letter of `Channel`.
- **Segment** = `Segment_1-Segment_2-Segment_3-Segment_4`, leaving out blanks and any part containing a capital letter followed by `00` (e.g. `C3D-Y00-X00-W00` → `C3D`, `SLT-EXP-X00-W00` → `SLT-EXP`). See `segmentKey` in `src/lib/data.js`.
- **Experimental** = any of `Segment_1`–`Segment_4` equals `EXP` (same rule as the version-two dashboard). Change `isExperimentalRow` in `src/lib/data.js` if your files mark it differently.

### How the delta is attributed

- **Additive metrics** (Sent, Cost, Orders …): each group's contribution is its own change.
- **Ratio metrics** (CPO, CTR, CIR …), R = N ÷ D: group *i* contributes N<sub>i</sub>/D<sub>total</sub> (current) − N<sub>i</sub>/D<sub>total</sub> (previous). These add up exactly to the total change and are split into
  - **rate effect** – the group's own ratio changed (e.g. WhatsApp CPO went up), and
  - **mix effect** – the group's share of the denominator changed (e.g. more orders came from expensive SMS).
- **Funnel drivers** (log-mean / LMDI split, adds up exactly): e.g. CPO = Cost per Sent ÷ (Delivery % × CTR × CVR), Orders = Sent × Delivery % × CTR × CVR, CIR = Cost per Sent ÷ (Delivery % × CTR × CVR × Revenue per Order).

## Code layout

```
src/lib/data.js        CSV loading + normalising (column names matched case-insensitively)
src/lib/metrics.js     metric definitions, aggregation, delta attribution, narrative text
src/lib/filters.js     dimensions, filters, period maths
src/state.jsx          shared state (data, period, filters, explorer drill path)
src/pages/*            one file per page
src/components/*       filter bar, KPI cards, metric table, small UI pieces
```
