# Submission notes — honest status

## What is solid
* Leak-free backtest: truncated series matrix per origin, tested (`tests/test_model.py::test_features_have_no_lookahead`). Pooled WAPE 0.286 vs 0.364 seasonal-naive (−21%).
* Contract: `outputs/submission.csv` = 58,219 rows in test order, integer ≥ 0, zero after EOL (tested).
* Every cleaning step is logged and reversible (flags per row in `panel_clean.parquet`).

## Known limitations (say them before the jury does)
1. **Metric unknown** — optimised for row-level WAPE (L1/median). If RMSE or bias is scored, revisit the objective (Tweedie/mean) and set `model.bias_calibration`.
2. **Bias is regime-dependent** (−12% / +5% across the two origins). Only two origins; more origins would show whether a global calibration is justified.
3. **Backtest uses actual macro values for the target month** (the real forecast window also gets given macro values, so this mirrors the competition, but real-world macro forecasts would be noisier).
4. **Assumptions with small samples**: ELA shortage demand estimation (ADR-0003), Orion shutdown multiplier 0.22 (single analog), EOL wind-down (6 SKUs), launch ramp (≤6 pairs).
5. **Intervals**: row-level P10–P90 coverage 77% (target 80%). Aggregate intervals are derived from 38 observations pooled across 2 rolling origins (19 months each, 12–14 observations per horizon bucket at the total level). Due to this small n and the regime shift between origins (−12% vs +5% bias), out-of-sample coverage across origins is sensitive; aggregate intervals should be treated as operational guideposts rather than tight statistical bounds.
6. Ambiguous ×10/×0.1 unit-vs-revenue rows (718) resolved by a local-level heuristic.
7. Team-size conflict: HackerEarth page says individual; the statement PDF mentions teams — confirm before the final submission.

## Highest-value next steps (ordered by expected score gain)
1. More backtest origins (2023-04, 2023-10, 2024-10) → decide bias calibration and horizon-specific shrinkage.
2. Blend with a Croston/TSB or ETS family model for lumpy/intermittent series and check by demand class (`series_profile.parquet`).
3. Quantile calibration (split-conformal on backtest residuals) to move coverage from 77% to ~80%.
4. Per-family macro-lag features chosen from the stability table (Macro tab) instead of generic lags.
5. 5-minute jury story: clean → anomalies (error vs event) → forecast with rules → dashboard.
