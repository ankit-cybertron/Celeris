# Validation report

Scope: the cleaned data, anomaly register, forecast, backtest and dashboard, checked against the problem statement's 7 business rules and the 7 jury criteria. Re-run: `make all && make test`. Automated checks live in `tests/test_contract.py` and `tests/test_rules_and_app.py` (34 tests).

## Overall assessment: share with caveats

## Findings of this audit (all fixed)

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | One x100 price (ELA-080, Oct-2026, Europe) survived cleaning because the SKU-month reference price was a median of two rows. It inflated Electrical Assemblies' last price (~1.6x) and therefore the forecast revenue plan (19-month revenue $2.75B -> $2.47B after the fix). Units were unaffected. | `reference_price` now screens candidates against the SKU-year median first. Missing-row placeholders take the same-SKU-month price from other regions (rule 4). Contract test: no price outlier, one price per SKU-month. |
| 2 | Medium | The 3 planned-launch SKUs had no price, so their forecast revenue was blank. | Price starts from the predecessor (`Replaces_SKU`). Test: no NaN prices or revenue. |
| 3 | Medium | `sku_master` gives 4 SKUs (PMP-004, PMP-020, PTC-029, THM-012) a Business_Unit that contradicts "each family belongs to exactly one BU"; transactions agree with the rule. | BU taken from the family's BU in transactions; logged in the DQ report and tested. |
| 4 | Info | 45 stockout rows have Requested < Shipped. | Not an error: Shipped includes Carried_In (all 45 have carry-in > 0). Demand correctly uses Requested. |
| 5 | Gap | No structural-break detector. | Added (idiosyncratic level shifts >= 2.5x vs prior 12 months, global index removed): 133 series flagged. Unit test with a planted shift. |
| 6 | Gap | No intermittent-demand methods (statement, Advanced). | TSB and Croston-SBA added to the backtest. |
| 7 | Gap | No business-insight narrative; dashboard drill-down, anomaly markers and family x indicator lag table incomplete. | `docs/INSIGHTS.md` + Insights tab; four-level drill-down with lifecycle; flagged points with type/reason/action on the series; family x indicator lag heatmaps with stability flag; DQ issues by file. |

## Methodology review
- **Leakage:** features and targets are built from a matrix truncated at the origin; truth comes from the untouched matrix (test: no look-ahead). The seasonal-profile window is clipped at the origin.
- **Backtest:** rolling origins 2024-04 and 2025-03, each with a full 19-month horizon, row-level WAPE and bias reported; model and baselines scored on identical rows.
- **Target:** unconstrained demand with spike capping and event masking in training; scored against uncapped unconstrained demand.
- **Intervals:** row-level P10/P90 from quantile LightGBM (coverage 77% on the last origin); aggregate intervals from empirical backtest error ratios pooled across origins and normalized by the median ratio, taking the wider span of pooled and per-origin quantiles. Bands do not guarantee coverage: pooled in-sample total coverage is 73.7%, and cross-origin coverage drops to 31.6% and 5.3% due to opposite origin biases (−12% vs +5%). Note that aggregate calibration rests on only 2 rolling origins (12–14 observations per bucket at total level).

## Calculation spot-checks
- Revenue = Units x Price on every row (max abs diff 0). Verified.
- Duplicate Date-SKU-Region keys: 0. Verified.
- Family totals sum to the grand total. Verified.
- One price per SKU-month across regions: 0 violations (80 before the fix). Verified.
- Submission: 58,219 rows, same keys and order as test.csv, non-negative integers. Verified (test).
- No forecast after EOL; launches zero before launch date. Verified (tests).
- Master SKUs: no Active SKU with an EOL date, none stale; every Discontinued SKU's last sale equals its EOL month.

## Accuracy (rolling-origin, 19 months, pooled over both origins)

| Method | WAPE |
|---|---:|
| Seasonal naive | 0.364 |
| Level x season | 0.320 |
| TSB | 0.494 |
| Croston-SBA | 0.496 |
| **Global LightGBM** | **0.286** |

- LightGBM bias -3.4% pooled (-12% at 2024-04, +5% at 2025-03).
- By demand class (row level, LightGBM / seasonal naive / TSB): smooth 0.278 / 0.354 / 0.305; erratic 0.386 / 0.489 / 0.407; intermittent 0.293 / 0.375 / 1.028; lumpy 0.487 / 0.556 / 0.994. TSB and Croston ignore ordering cycles, so they fail on intermittent series. They are kept as the statement's intermittent-demand baselines, not as candidates.
- Aggregation helps: family x region x month WAPE is 0.090.
- By family 0.26-0.33 (worst: Electrical Assemblies); by region 0.26-0.36 (worst: Middle East & Africa, the newest region).
- P10-P90 row-level coverage 77% (target 80%): slightly narrow, evaluated on the last origin only.

## Interval reliability (empirical backtest coverage)

Aggregate P10–P90 intervals are derived from empirical error distributions across rolling origins. Because the backtest contains only two origins with opposing bias regimes (Origin 2024-04 at −11.9% bias vs Origin 2025-03 at +5.0% bias), out-of-sample empirical coverage drops when evaluated across origins:

| Level | Calibration Origin (Training) | Evaluation Origin (Test) | P10–P90 Coverage | Actual Covered / Total Eval | Sample Size n (Calib) |
|---|---|---|---:|---:|---:|
| **Total** | Origin 2024-04 (−11.9% bias) | Origin 2025-03 (+5.0% bias) | 31.6% | 6 / 19 | 19 |
| **Total** | Origin 2025-03 (+5.0% bias) | Origin 2024-04 (−11.9% bias) | 5.3% | 1 / 19 | 19 |
| **Total** | Pooled (both origins) | Both origins | 73.7% | 28 / 38 | 38 |
| **Family** | Origin 2024-04 (−11.9% bias) | Origin 2025-03 (+5.0% bias) | 61.7% | 82 / 133 | 133 |
| **Family** | Origin 2025-03 (+5.0% bias) | Origin 2024-04 (−11.9% bias) | 36.1% | 48 / 133 | 133 |
| **Family** | Pooled (both origins) | Both origins | 78.6% | 209 / 266 | 266 |

*Assessment:* Pooled in-sample coverage reaches 73.7% at the total level and 78.6% at the family level (near the nominal 80% target). However, because each horizon bucket contains only 12–14 observations per origin at the total level, intervals are sensitive to macro regime shifts and should be treated as indicative guideposts rather than guaranteed statistical bounds.

## Assumptions and limitations

1. **Orion Driveline Retooling (EV-062):**
   - A planned customer shutdown at Orion Driveline's North American plants is scheduled for July–August 2027 (`EV-062`).
   - The model applies a 0.22 volume multiplier (a 78% reduction) derived from the historical Nexon labour strike analogue (EV-038). This is an assumption that should be replaced with Orion's actual operational shutdown schedule when confirmed.
   - **NA July Holiday Effect Interaction (Verified in Code):** **YES**, the North American summer holiday effect is already present in the baseline forecast for Orion. In `src/mks/features.py`, the regional holiday matrix encodes `EV-063` (North American summer retooling weeks, July 2027) into the `hol` feature, and July seasonality (`seas`) independently depresses July baseline predictions. Consequently, the 0.22 customer event multiplier is applied in `apply_rules()` on top of an already seasonally lower July prediction.

2. **EOL Wind-down Multipliers:**
   - The pre-EOL volume decay curve (`decay[0..5]`) is learned from only 6 historical discontinued SKUs in the dataset.
   - **Potential Double Counting (Verified in Code):** **YES, potentially**. In `src/mks/features.py`, the model explicitly includes `d["m_to_eol"] = np.clip(ctx.eol - tm, -1, 60)` as a predictive feature. If the tree-based model partially learns a pre-EOL volume taper from this feature, multiplying the model's prediction by the historical decay curve in `apply_rules()` risks compounding the reduction (double counting).

3. **Leaf-Level Interval Coverage (77%):**
   - The reported 77% leaf-level P10–P90 coverage (against the nominal 80% target) is evaluated **strictly on the last origin** (Origin 2025-03, `bt.origin == 74` in `src/mks/backtest.py`), not pooled across both origins.

4. **Aggregate Interval Calibration Sample Size:**
   - Aggregate intervals rely on only 2 rolling origins (38 total observations per series, 12–14 observations per 6-month horizon bucket at the total level). Due to this small sample size, intervals are susceptible to small-sample volatility and regime shifts.

## Visualization review
- Bar charts start at zero; history and forecast share one timeline with a marked forecast start and P10-P90 band; units and revenue shown separately.
- The Executive revenue timeline uses forecast price (last clean price x announced January rises); labelled in the Insights notes.

## Required caveats for stakeholders
1. Forecast is unconstrained demand (rule 7); shipments will be lower if supply limits recur.
2. Row-level error is about 29% by design (many intermittent series); use aggregates for planning and intervals for SKU-level.
3. **Forecast shape & trajectory dynamics:** Winter 2025-26 was a demand-driven dip (not supply-driven; stockouts were under 0.3% of volume). The forecast returns toward the 2024 level because the model finds no growth driver in the flat macro paths. Mid-2027 to 2028 YoY of -2% to -7% is therefore the least-evidenced part of the plan; use it with the P10-P90 range. The backtest exhibits a ±12% bias swing across rolling origins.
4. Stockout file is incomplete; unlisted months in the semiconductor window are estimated (ADR 0003).
5. EV-062 (planned retooling) is applied as a 78% cut, an assumption to replace with the customer's plan.
6. Macro lead/lag figures are correlations (COVID months excluded), not causal estimates; they drive the what-if tab only.
7. Intermittent-demand baselines are weaker than the global model; this is expected and reported.
