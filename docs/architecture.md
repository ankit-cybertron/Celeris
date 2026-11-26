# Architecture & system design

## 1. Requirements
**Functional**: clean 7 messy files; produce 58,219-row forecast (3,068 series × ≤19 months); explain anomalies; dashboard for planners; reproducible one-command run.
**Non-functional**: reproducible (seeded, config-driven); no look-ahead leakage; every cleaning decision auditable; runs on a laptop (<10 min, 2 cores); dashboard loads <10 s.
**Constraints**: individual entry, 8-day window (Nov 20–29 2026), metric unspecified (assume WAPE + bias), data is a single extract (no live source).

## 2. High-level design
```
data/raw/*.csv ──► clean ──► panel_clean.parquet ─┐
                    │ dq_report.json, dq_issues.csv │
                    ▼                               ▼
              macro_clean.parquet        demand.py (unconstrained, spike cap)
                                                    │  panel_demand.parquet
                                                    ▼
                        anomalies.py ──► anomaly_register.csv, event_impacts.csv, series_profile.parquet
                                                    │
        data.py (series x month matrix) ◄───────────┘
              │
   features.py (origin o, horizon h) ──► models.py (LGBM p50/p10/p90 + baselines)
              │                                   │
        backtest.py (2 origins, truncated Y)      forecast.py (origin 2026-10) ──► rules R1/R2/R3 ──► submission.csv, forecast_full.parquet
              │                                                                              │
              └─► outputs/backtest/*  ─────────────────────────────────────────────► app/dashboard.py (reads parquet/csv only)
```
Stages communicate only through files in `data/processed` and `outputs` → each stage is re-runnable and the dashboard needs no pipeline imports.

## 3. Data model
* **Series** = (`SKU_ID`, `Region`); 3,093 catalog series (3,083 with history + 10 launch series without history; exactly 3,068 of them are active in `test.csv` for forecasting). In the interactive dashboard cube, slicing by `(SKU, Region, Channel, Customer)` indexes 3,116 distinct multi-dimensional series combinations across history and forecast (3,068 active forecast series + 48 historical/pre-EOL slices). Attributes: family, powertrain, size, customer, channel.
* **Panel row** = (series, month): `Units_Clean`, `Demand_Unconstrained`, `Demand_Model` (capped spikes), `Price_Clean`, `Revenue_Clean`, `row_status` (`observed|missing|from_stockout_file`), `fix_flags`, stockout fields.
* **Matrix** `Y[series, month 0..112]` (2019-01…2028-05); `NaN` = unknown, never 0.

## 4. Deep dive
**Features (origin o, horizon h)**: means over 1/3/6/12/24 m, nonzero-mean, zero share, growth, series age; seasonal profile (≤ 3 prior years, window clipped at the origin); last-year-same-month values; ordering-cycle period/phase detected on the 24 months before o (`is_ord`, `exp_ord`); macro level at target and origin, YoY delta, 3-month momentum; regional holiday fraction; announced price rise (Sep–Dec) / post-rise January; months to EOL / since launch; categorical ids.
**Training**: rolling origins every 3 months from 2021-07; all horizons whose target ≤ last origin; ~970k rows × 66 features. **Event hygiene**: COVID, LatAm ERP gap and Nexon strike cells are masked (NaN) so the model doesn't learn them as seasonality.
**Intervals**: leaf P10/P90 from quantile models; aggregate intervals from empirical backtest actual/P50 ratios per hierarchy level × horizon bucket (summing leaf quantiles is too wide).
**Coherence**: leaf P50 are the forecast; every aggregate is a bottom-up sum.

## 5. Scale & reliability
Dataset is small (250k rows). Full run ≈ 4 min (clean 11 s, anomalies 3 s, backtest ≈ 75 s, forecast ≈ 85 s on 2 cores). Failure handling: forecast stage asserts row count, key order, column names vs `sample_submission.csv`, non-negativity; tests cover the contract. Determinism: seed in config.

## 6. Trade-offs
| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Model | one global GBM, direct horizons | per-series ETS/ARIMA; deep nets | 3k short, noisy, intermittent series; pooling wins; no recursion error |
| Intermittent demand | model + cycle features | Croston/TSB per series | cycle features gave no extra gain in backtest; Croston kept as future work |
| Intervals | quantile GBM + empirical aggregate scaling | conformal / simulation | cheap, honest at each level; coverage 77% shown |
| Dashboard | React (TanStack Start + Recharts) | Streamlit / Dash | Decoupled static JSON contract; instant client-side filtering; enterprise UI |
| Spikes | cap at 3× local median for training, keep in history | drop | real one-off orders exist but shouldn't be extrapolated |

## 7. What to revisit
Per-family/horizon bias calibration; more backtest origins; Croston/TSB blend; quantile calibration (conformal); a proper successor-ramp model if more pairs are available; hierarchical reconciliation (MinT) if aggregate accuracy is judged.
