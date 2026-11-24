# EDA findings (all numbers produced by this repo's pipeline)

## Data quality (before → after)
| Metric | Raw | Clean |
|---|---|---|
| Rows | 248,248 | 244,590 observed (+948 missing rows kept as NaN in a 245,538-row panel) |
| Distinct date strings | 667 | 94 |
| Region labels | 29 | 6 |
| Channel labels | 17 | 4 |
| Customer labels | 220 | 12 |
| SKU labels | 2,659 | 598 |
| Duplicate Record_IDs | 3,682 | 0 |
| Missing/non-numeric units | 3,580 | 1,942 (948 missing rows + 994 unrecoverable) |
| Negative units | 497 | 0 |
| Max single-row units | 16,300 | 2,002 |

Largest issue types (rows): non-standard dates 9,967 · region labels 5,992 · channel labels 3,745 · malformed SKU 3,741 · duplicate Record_ID 3,682 · units missing 3,327 · units recovered from revenue/price 2,528 · customer typos 2,490 · family missing 1,252 · region missing 942 · price in cents 587 · negatives 491 · revenue ×10 428 · price zero 295 · units ×10 290 · units ×100 76 · units≠shipped 65.

## Anomaly register (outputs/anomaly_register.csv)
data_error 4,760 rows · data_gap 1,942 · real_event 6,226 (5,830 stockouts, 363 one-off orders, …) · structural 131 (89 cycle changes, 23 customer switches, 16 lost accounts, 3 launches) · master_conflict 4 (1 sales-before-launch, 3 test-rows-after-EOL).

## Demand
* Total monthly demand ≈ 142k units (last 12 m, unconstrained). COVID trough: Apr 2020 51k vs 102k in Mar (−50%). Annual totals YoY: 2020 −20%, 2021 +48%, 2022 −6%, 2023 +2%, 2024 +13%, 2025 −2%; 2025-H2 was −10% vs 2024-H2, and Jul–Oct 2026 is +13% vs the same months of 2025 (regime turns the model only partly anticipates).
* Family×region×month is predictable (WAPE 0.09); individual rows are noisy (WAPE 0.29) — order-size CV ≈ 0.34 on nonzero months, ~15% of series-months are zero.
* Feature importance (split count): cycle fit, series age, nonzero means, expected-order flag, zero share, 12-month mean, growth, last-year values, family.

## Model comparison (leak-free, 19-month horizon)
See README table. Error by horizon is flat (0.26 at h=1 → 0.28–0.31 at h=9–12 → 0.28 at h=19): most error is row-level noise, not horizon. By family (pooled WAPE): BSS 0.264 · THM 0.280 · CSS 0.281 · PTC 0.282 · PMP 0.288 · HYD 0.304 · ELA 0.327 (ELA hardest: shortage history).
Bias by origin: −12.0% (2024-04), +5.2% (2025-03): the model follows the macro trend but not regime turns.
