# ADR-0001: One global LightGBM with direct multi-horizon features

**Status:** Accepted · **Date:** 2026-11-21 · **Deciders:** CT

## Context
3,068 monthly series, 94 months history, 19-month horizon, high row-level noise (nonzero-order CV ≈ 0.34), ~18% of series order every 2–3 months, regime shocks (COVID, shortage, strike), macro series supplied through the forecast window.

## Options
| | Per-series ETS/ARIMA | Global GBM, direct horizon | Global deep net |
|---|---|---|---|
| Complexity | Low per series, 3k fits | Medium | High |
| Handles intermittency/cycles | Poor | Good via cycle + nonzero features | Good |
| Uses macro/events/lifecycle | Hard | Native | Native |
| Data need | Per-series | Pooled | Large |
| Runtime on 2 cores | Min | ~1–2 min per fit | Long |

## Decision
Global LightGBM, direct strategy (`h` as feature, targets at `o+h`), L1 objective for the P50 (WAPE-optimal median), quantile objectives for P10/P90. Baselines kept in every backtest (seasonal-naive, level×seasonal).

## Consequences
+ pooled signal, native macro/event features, no recursive error accumulation. − tree models don't extrapolate unseen shocks (handled by rules, ADR-0004); − bias drifts when regime changes (−12% at origin 2024-04, +5% at 2025-03).
## Action items
- [x] rolling-origin backtest, leak-free · [ ] Croston/TSB blend for lumpy series · [ ] per-family bias calibration if more origins confirm a stable sign
