# ADR-0003: Unconstrained demand and the supply-shortage window

**Status:** Accepted

## Context
Rule 7: forecast demand, not shipments. `inventory_stockouts.csv` (5,830 rows) lists Requested/Shipped/Backordered/Lost. The events calendar marks an ELA semiconductor allocation 2021-03…2022-09; 5,830 stockout rows concentrate there but are incomplete.

## Evidence
In the window, ELA rows **not** in the stockout file run at 0.84× of their 2023-24 baseline, versus 1.29× on listed rows' requested demand and 1.19× for other families ⇒ unlisted rows are also supply-depressed.

## Decision
`Demand_Unconstrained` = `Requested_Units` on listed rows; on unlisted ELA rows in the window `Units / fill_ratio(month)`, fill_ratio = shipped/requested on listed rows of that month, clipped to [1/3, 1]. Flagged `estimated_unconstrained` (19 family-month register rows).

## Consequences
+ removes a spurious 2021-22 ELA trough from training. − an assumption: if unlisted rows were genuinely unconstrained we overstate 2021-22 ELA demand (affects only trend/level features; the model mostly uses the last 12–24 months). The backtest is scored on this unconstrained series.
