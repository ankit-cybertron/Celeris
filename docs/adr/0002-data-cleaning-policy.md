# ADR-0002: Cleaning policy — Date and Revenue/Price are the arbiters; nothing is silently zero-filled

**Status:** Accepted

## Context
Problem-statement business rules: `Date` is authoritative; later `Load_Timestamp` wins duplicates; a missing row is not a zero; units/price/revenue must reconcile. The raw extract contains ~25 error types (see `data/processed/dq_issues.csv`).

## Decision
1. **Dates**: parse 6 formats; if outside 2019-01…2026-10 use `Load_Timestamp − 1 month` (verified: lag is exactly 1 month for all rows). `Year`/`Month` columns are ignored.
2. **Labels**: lookup maps for region/channel; customers by case/whitespace/`Inc.` normalisation + fuzzy match (cutoff 0.7) to the 12 names with ≥1,000 rows; SKU normalised to `AAA-NNN`; family/BU from `sku_master`.
3. **Duplicates**: keep latest `Load_Timestamp` per `Record_ID`, then per (Date, SKU, Region).
4. **Units**: negatives → abs (revenue also negative → sign flip). `Revenue/(Units×Price)` = 0.01 with normal price ⇒ units ×100 → `Revenue/Price`. Ratios 10 / 0.1 are ambiguous (units or revenue wrong) → choose the candidate closer to the series' 13-month local median. Price ×100 (cents) or 0 → SKU-month reference price (median across regions). Units missing but revenue present → `Revenue/Price`.
5. **Stockout file**: `Shipped_Units` is truth for train units; stockout rows absent from train are recovered.
6. **Missing**: region imputed only when the (SKU, customer, month) has exactly one free region slot; missing rows inside a series' life stay `NaN`.
7. **Macro**: duplicate month → row closest to neighbours; PMI<20 ×10; leading YoY block in fractions ×100; interpolate gaps.

## Alternatives rejected
Dropping bad rows (loses 3k+ rows, biases toward clean regions); zero-filling missing (creates fake demand collapses); trusting `Units_Sold` over revenue (inflates ×100 outliers up to 16,300 units).

## Consequences
Every action is a row in the DQ log and, per row, in the anomaly register (`class=data_error`, action `fixed:…`). Residual risk: ambiguous 10×/0.1× rows (718) rely on a local-level heuristic.
