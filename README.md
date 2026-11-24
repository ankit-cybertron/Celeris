# Celeris Demand Forecasting & Planning Control Tower

MKS AI/ML Hackathon — Phase 2 (HackerEarth). Forecast monthly `Units_Sold` for **600 SKUs × 6 regions (3,068 series), Nov 2026 – May 2028**, clean the data, explain anomalies, and ship a planner dashboard.

| Deliverable | Where |
|---|---|
| Submission (`Date,SKU_ID,Region,Units_Sold_Forecast`) | `outputs/submission.csv` |
| Forecast with P10/P50/P90 + revenue | `data/processed/forecast_full.parquet` |
| Cleaning pipeline + DQ report | `src/mks/clean/`, `data/processed/dq_report.json`, `dq_issues.csv` |
| Anomaly register (error vs real event vs gap) | `outputs/anomaly_register.csv`, `outputs/event_impacts.csv` |
| Backtest (no leakage, 2 origins) | `outputs/backtest/` |
| Control Tower Dashboard (5 required + 7 optional + Insights views) | `web/` (React + TanStack Start + Recharts) |
| Design docs, ADRs, data context, runbook | `docs/` |

## Quick start (≈ 5 minutes)

### 1. Python Pipeline & Verification
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Ensure 7 competition CSVs are in data/raw/
make all                        # clean -> anomalies -> backtest -> forecast -> insights -> export (~4 min)
make test                       # 35 contract, rule & regression tests (2.3s)
make fast                       # fast smoke test of the full pipeline (~1 min)
```

### 2. Control Tower Dashboard (React)
```bash
make web-install                # cd web && npm install --legacy-peer-deps
make web                        # starts dashboard on http://127.0.0.1:8080
cd web && npm test              # 14 Vitest unit & routing tests
```
Stages can also be run individually: `python -m mks.cli {clean|anomalies|backtest|forecast|insights|export}`. Config: `configs/config.yaml`.

### Reproducing the results & fresh-clone verification
The entire pipeline was verified from a fresh clone outside the repository (`/tmp/demand-forecast-fresh`) from raw inputs, generating a byte-identical `outputs/submission.csv` (MD5: `0a2755059418bff48edf3a2918ccdf5b`), 35 passed pytest tests, 14 passed vitest tests, and a clean production build. The full verified terminal log is recorded in [`docs/fresh_clone_check.txt`](docs/fresh_clone_check.txt).

> **Note on Competition Data:** Ensure the 7 competition CSVs (`events_calendar.csv`, `inventory_stockouts.csv`, `macro_indicators.csv`, `sample_submission.csv`, `sku_master.csv`, `test.csv`, `train.csv`) are placed in `data/raw/` before running `make all`. (Raw data files are gitignored to respect repository file-size limits).

## What it does
1. **Clean** (`mks.clean`): 6 date formats, 2062-style typos (repaired from `Load_Timestamp`), label/SKU/customer standardisation, duplicate loads, units/price/revenue scale errors, sign flips, missing region imputation, stockout reconciliation, macro fixes; missing rows stay `NaN` (never zero). 28 issue types logged with rows affected and action.
2. **Unconstrained demand**: stockout months use `Requested_Units`; unlisted rows in the semiconductor-allocation window are estimated.
3. **Anomaly register**: every anomaly is classed `data_error` (fixed), `data_gap`, `real_event` (modelled/capped), `structural` or `master_conflict`, with reason and action.
4. **Model**: one global LightGBM (L1 for P50, quantile for P10/P90), direct 1–19 month horizons, features = level/seasonality/ordering-cycle/macro/events/lifecycle. Baselines: seasonal-naive, level×seasonal, TSB, Croston-SBA.
5. **Rules on top**: zero after EOL (+ learned wind-down), launch ramp from successor/predecessor history, planned customer shutdown.
6. **Dashboard**: 13 views grouped into Core (Executive, Forecast, Demand, Anomalies, Data Health), Planning (Insights, Procurement, What-If, Stockouts, Lifecycle, Macro Drivers), and Operations (Exceptions, Downloads). Features continuous timeline, empirical backtest-calibrated P10–P90 bands, and interactive scenario simulations.

## Results (leak-free rolling-origin backtest, 19-month horizon, row-level WAPE)
| Method | origin 2024-04 | origin 2025-03 | pooled |
|---|---|---|---|
| TSB (intermittent baseline) | 0.490 | 0.498 | 0.494 |
| Croston-SBA | 0.492 | 0.500 | 0.496 |
| Seasonal naive | 0.359 | 0.369 | 0.364 |
| Level × seasonal | 0.320 | 0.321 | 0.320 |
| **Global LightGBM (P50)** | **0.279** | **0.293** | **0.286** |

Family×region×month WAPE 0.090. Bias is origin-dependent (−12% / +5%). P10–P90 row-level coverage 77% (target 80%). See `docs/SUBMISSION_NOTES.md` and `docs/INSIGHTS.md` for full caveats and forecast shape dynamics.

## Layout
```
configs/config.yaml     all tunables          src/mks/clean/   cleaning modules + dq log
src/mks/data.py         matrix/keys           src/mks/demand.py, anomalies.py
src/mks/features.py     features              src/mks/models.py, backtest.py, forecast.py
src/mks/cli.py          entry point           web/             React Control Tower app
tests/                  pytest (35 tests)     docs/            design, ADRs, data context, runbook
PROGRESS.md             checkpoint log
```
