> NOTE: the Lovable-built app now lives in `web/` and is already wired to the pipeline export (`make export` writes `web/public/data`). The contract below is what the exporter produces (`src/mks/export_web.py`).

# Prompt for Lovable (paste everything inside the fence)

Before pasting: in Lovable, add the files from `web/public/data/` (cube.json, dq.json, anomalies.json, backtest.json, insights.json, stockouts.json, lifecycle.json, profile.json, exceptions.json, meta.json, submission.csv) to the project's `public/data/` folder. Fastest path: import the whole `web/` folder from this repo (GitHub) and then paste the prompt to restyle/extend. Data is produced by `make export`; never type numbers by hand.

```
Build a single-page React + TypeScript dashboard (Vite, Recharts, no backend) called "Celeris Demand Control Tower" for a demand-forecasting competition (MKS AI/ML Hackathon). It must READ static JSON files from /data/*.json (fetch at startup). Do NOT hardcode any numbers.

LAYOUT
- Left dark sidebar with 5 SHARED cascading filters used by every view: Product family, SKU, Region, Sales channel, Customer (each "All" or a value; each dropdown only lists values compatible with the other selections) + "Reset filters".
- Main area: tab bar with 13 tabs: Insights, Executive overview, Data health, Demand explorer, Anomaly monitor, Forecast & accuracy, Stockouts, Lifecycle, Macro lead/lag, What-if, Procurement (P90), Planner exceptions, Downloads.
- Clean, modern, light content area, card-based, KPI tiles, responsive. Blue = history, orange (dashed) = forecast. Use a vertical dashed "forecast →" marker at 2026-10/11 on every timeline and a shaded P10–P90 band.

DATA CONTRACT (files in /data)
- cube.json: { months: string[] "2019-01".."2028-05"; last_hist: number (index of 2026-10); dims: {sku, region, channel, customer, family: string[]}; sku_family: number[] (family index per sku index); rules: string[];
  hist: columnar arrays m (month idx), sku, reg, ch, cus (indices, -1 = none), u (units shipped, -1 = unknown/missing row), d (unconstrained demand, -1 unknown), r (revenue of demand), miss (1 = missing-row placeholder);
  fc: columnar arrays m, sku, reg, ch, cus, p10, p50, p90, r (P50 revenue), rule (0 none, else index+1 into rules) }
  All aggregation (sum by month / by dimension, with the shared filters) is done client-side over these arrays.
- dq.json: { summary: {before:{...}, after:{...}, raw_rows, clean_observed_rows, panel_rows, series}, issues: [{file, issue, rows_affected, action, severity}] }
- anomalies.json: { register: [{anomaly_id, type, class, date_start ("YYYY-MM" or "series-level"), date_end, SKU_ID, Region, Customer_Name, scope, value_observed, value_expected, impact_pct, reason, action}], events: [...] }
- backtest.json: { overall:[{origin,method,wape,bias,n}], by_dim:[{dim: "h"|"fam"|"Region"|"Sales_Channel", key, method, wape, bias, n}], aggregate:[{value}], coverage:[...], scale:[{level, h_bucket, q10, q50, q90}] (aggregate interval ratios), importance:[...] }
- insights.json: { insights: {headline, outlook_Product_Family, outlook_Region, outlook_Sales_Channel, top_growth, top_decline, season_index, holiday_dips_pct, stockouts, price_effect, p90_buffer_pct_by_family, lifecycle, macro_leaders, powertrain_share_by_year, planner_actions}, lags: [{family ("ALL" = total), indicator, best_lag, corr, beta, lag_early, lag_late, stable}], series: [macro indicator rows by Date] }
- stockouts.json, lifecycle.json (sku master + forecast_19m, first_sale, last_sale), profile.json (per SKU-region: demand_class, zero_share_36m, cycle_period, ...), exceptions.json, meta.json, submission.csv.

REQUIRED VIEWS (all must respond to the shared filters)
1. Executive overview: KPIs (19-month forecast units and revenue, next-12m vs last-12m growth for units and revenue); ONE continuous timeline history→forecast with a Units/Revenue toggle, shipped vs unconstrained demand, P10–P90 band; mix by family, region and channel (grouped bars: last 12m history vs next 12m forecast).
2. Data health: issues by type (horizontal bars, colored by severity), issues by file, before-vs-after-cleaning table, KPIs (raw rows, observed rows after cleaning, issue types, series).
3. Demand explorer: drill-down treemap family → SKU → region → customer (last 12m demand); seasonality index by calendar month; zero-order months vs unknown (missing) months counts; lifecycle card for a selected SKU (status, launch, EOL, successor, first/last sale); series profile table (intermittency class, ordering cycle).
4. Anomaly monitor: demand timeline with flagged points as markers coloured by type (checkbox filter by type), tooltip showing type, reason and recommended action; anomalies by type and by year; full sortable register table; real-event impact table.
5. Forecast & accuracy: forecast vs history with P10–P90; KPIs (backtest WAPE, bias, family×region×month WAPE, interval coverage); WAPE + bias by forecast horizon (1..19), by family, by region, by channel, with seasonal-naive comparison; method comparison table; feature importance.
OPTIONAL VIEWS: Insights (business insights from insights.json: outlook by family/region/channel, movers, seasonality, stockout cost, macro leaders, lifecycle, planner actions); Stockouts & lost sales (by month/reason/family); Lifecycle (EOL / launches / discontinued with SKU timeline and predecessor); Macro lead/lag (family × indicator heatmap showing corr, best lag in months and a stability tick; indicator path chart; EV powertrain share); What-if (choose indicator and change, e.g. PMI −3; use beta and best_lag for family "ALL" to scale the forecast from the lag onward; show baseline vs what-if and 19-month impact); Procurement (monthly P50 plan + cover to P90, SKUs with largest P90 buffer); Planner exceptions (series whose forecast moves ≥ X% vs last 12 months with sliders, plus structural flags); Downloads (submission.csv and CSV exports of the current view).

INTERVAL RULE: when the selection is an aggregate (no SKU/customer filter), P10/P90 = P50 × q10/q90 from backtest.json "scale" for the matching level (total, family, region, channel, family_region) and horizon bucket (h1-6, h7-12, h13-19); for a SKU/customer selection sum the leaf p10/p90.

QUALITY BAR: no console errors; handles loading and failures; formatting with K/M/B and $; sortable tables; accessible contrast; charts have axes, legends and tooltips; performs smoothly with the 8 MB cube (compute aggregates in memoised functions, not on every render).
A working reference implementation exists in /src (lib/data.ts holds the aggregation engine, views/* the tabs). Keep the data contract unchanged; you may freely restyle the UI.
```
