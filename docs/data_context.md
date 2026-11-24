# Data context (what an analyst needs to know before touching the data)

Company: Celeris Automobili Industrial, tier-1 supplier. 600 SKUs · 7 families (BSS, CSS, ELA, HYD, PMP, PTC, THM) · 6 regions · 12 customers · 4 channels. History 2019-01…2026-10 (94 months), forecast 2026-11…2028-05 (19 months).

## Files
| File | Rows | Grain | Key columns / notes |
|---|---|---|---|
| train.csv | 248,248 | Date-SKU-Region (+Customer) | `Record_ID` (dupes = double loads), `Date` (authoritative), `Year/Month` (unreliable), `Units_Sold` (text: `-`, `1,234`, negatives), `Unit_Price_USD`, `Revenue_USD`, `Load_Timestamp` (= delivery month + 1) |
| test.csv | 58,219 | Date-SKU-Region | clean keys; carries `Customer_Name`, `Sales_Channel` for the future. Contains rows **after EOL** (trap) and 3 launch SKUs with no history |
| sample_submission.csv | 5 | | `Date,SKU_ID,Region,Units_Sold_Forecast` |
| sku_master.csv | 601 | SKU | `Lifecycle_Status` (Active, EOL Announced, Discontinued, Planned Launch), `Launch_Date`, `EOL_Date`, `Replaces_SKU` (9 pairs), `Powertrain_Application`, `Size_Class`; master contradicts transactions for BSS-018 (sales before launch) |
| events_calendar.csv | 68 | event | Types: Holiday, Disruption, Supply Constraint, Customer Event, Logistics, System, Market Entry, Price Change. Scope: Global/Region/Product_Family/Channel/Customer(`Cust | Region`). Includes future events (price rises, Orion shutdown) |
| macro_indicators.csv | 114 | month | 8 indicators 2019-01…2028-05 (incl. forecast window). Issues: duplicate 2022-06, PMI 4.79, YoY fractions in 2019, NaNs |
| inventory_stockouts.csv | 5,830 | Date-SKU-Region | `Requested = Shipped + Backordered + Lost − Carried_In`; `Shipped` is what train should show; 134 months missing from train |

## Business rules (from the problem statement) and where they are enforced
1 Date authoritative → `clean/dates.py` · 2 latest `Load_Timestamp` wins → `clean/pipeline.py` · 3 zero ≠ missing → `row_status`, `NaN` never filled · 4 price per SKU, same in all regions, changes 1 Jan (+ surcharges) → `units.reference_price` · 5 no sales after EOL / before launch → `forecast.apply_rules` R1/R2 + register · 6 ordering cycles → `cycles.py`, features · 7 unconstrained forecast → `demand.py`, model target.

## Facts worth knowing (verified)
* Price schedule (median SKU price change vs prior year, cleaned prices): 2020 +2.0%, 2021 +2.5%, 2022 +8.1%, 2023 +5.8%, 2024 +4.5%, 2025 +3.7%, 2026 +3.75%. Intra-year price levels of ×1.06 / ×0.943 appear in raw rows (surcharge periods in the events calendar) — the SKU-month reference price absorbs them.
* Ordering cycles (last 24 m): 2,534 monthly series, 296 every 2nd month, 259 quarterly (fit 97–99.6%); 89 series changed cycle.
* Intermittency (Syntetos-Boylan on last 36 m): smooth 2,197 · intermittent 764 · erratic 92 · lumpy 14 · inactive 26.
* Regional holidays shrink demand: Europe Aug −54%, North America Jul −40%, APAC Lunar New Year −26…−42%.
* Real events: COVID −35…−76% by region (2020), Nexon Europe strike −81% (Oct–Nov 2023), LatAm ERP migration −24% (Mar–May 2023; a data-gap not demand), Middle East & Africa opens Jan 2022, Helios India permanent +21% step from Sep 2025.
* Early buying before the announced 9% rise (Nov 2022) — Q4 2022 demand elevated; later 4–4.5% rises show none.
* `Customer_Name` in test equals the last train customer for every series; 23 history series switched customer.

## Terms
**Unconstrained demand** = what customers requested (Requested_Units), vs shipped. **WAPE** = Σ|actual−forecast| / Σactual. **Series** = SKU×Region. **Origin** = last observed month of a backtest.
