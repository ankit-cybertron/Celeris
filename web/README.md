# Celeris Demand Control Tower — Frontend

Interactive single-page demand planning and forecasting cockpit built for the **MKS AI/ML Hackathon**.

**Live Demo:** [https://celeris.ankit-cybertron.workers.dev](https://celeris.ankit-cybertron.workers.dev)

## Architecture & Tech Stack

- **Framework:** React 19 + TypeScript (Vite + TanStack Router/Start)
- **Styling & UI:** Tailwind CSS, Lucide Icons, Radix UI primitives
- **Visualizations:** Recharts (responsive time-series, grouped comparison bars, treemaps)
- **Data Engine:** Zero-latency client-side query engine (`src/lib/engine.ts`) operating directly over pre-indexed columnar JSON arrays (`/data/*.json`)

## Quick Start

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Run local development server (http://127.0.0.1:8080)
npm run dev

# 3. Run automated Vitest unit & routing tests
npm test

# 4. Production build
npm run build
```

## Dashboard Capabilities

### 13 Specialized Analytical Views
1. **Executive Overview:** Enterprise demand trajectory, P10–P90 risk envelope, YoY volume variances, and family/regional breakdowns.
2. **Forecast & Accuracy:** Granular SKU-level forecasts, backtest residuals, origin bias diagnostics, and coverage bands.
3. **Demand Explorer:** Multi-dimensional drill-down treemap across Family, SKU, Region, Channel, and Customer tiers.
4. **Anomaly Monitor:** Comprehensive audit ledger tracking data errors, event shocks, and structural breaks.
5. **Procurement (P90):** Recommended Cover-to-P90 buffer stock, empirical Bayes shrunk family safety margins, and supplier order scheduling.
6. **What-If Simulator:** Dynamic parameter tuning (Macro shocks, tariff impacts, supplier delivery lead-time delays).
7. **Data Health:** Real-time data quality scorecards, missingness distribution, and price consistency audits.
8. **Lifecycle & Phase-In/Out:** Tracking active, ramp-up, mature, and EOL product portfolios.
9. **Macro Drivers:** Regional economic indicator correlations, lead-lag cross-correlations, and transmission sensitivities.
10. **Stockouts & Unconstrained Demand:** Lost sales visibility, requested vs shipped volume, and inventory fill rates.
11. **Planner Exceptions:** Algorithmic alert feed for high-variance SKUs, volatile ordering rhythms, and inventory stockout risks.
12. **Insights & Strategic Takeaways:** Plain-language synthesis of macro tailwinds, winter demand dynamics, and multi-year outlooks.
13. **Data Downloads:** Direct export of cleaned panels, forecast ensembles, anomaly logs, and submission packages.

### Responsive & Collapsible UX
- **Desktop Rail (`lg:w-72` $\leftrightarrow$ `lg:w-16`):** One-click collapsible sidebar with smooth transitions, maximizing screen width for wide tabular grids and complex heatmaps.
- **Mobile Drawer:** Header-integrated filter toggle collapsing extensive dropdown lists into a clean 52px top bar on small viewports.
- **Global Shortcut:** Press **`Ctrl+B`** (or **`Cmd+B`**) anywhere to toggle the sidebar.

## Data Contract

All data consumed by the dashboard is generated automatically by the ML pipeline (`make all` or `make export`) into `web/public/data/`:
- `cube.json`: Multi-dimensional columnar demand cube (historical & forecast arrays).
- `dq.json`: Data quality audit report and issue breakdown.
- `anomalies.json`: Flagged data errors, event shocks, and structural shifts.
- `backtest.json`: Model evaluation metrics, bias across horizons, and empirical scale ratios.
- `insights.json`: Executive outlooks, macroeconomic lead/lag tables, and shrunk family buffers.
- `submission.csv`: Competition submission file.
