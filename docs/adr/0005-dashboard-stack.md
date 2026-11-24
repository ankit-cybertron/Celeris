# ADR-0005: Streamlit + Plotly dashboard (not a static HTML page)

**Status:** Accepted

## Context
Needs ≥5 views with shared filters (family, SKU, region, channel, customer, date), history and forecast on one timeline, uncertainty bands, run locally with documented setup. 245k history rows + 58k forecast rows.

## Options
| | Static HTML + Chart.js (data embedded) | Streamlit + Plotly |
|---|---|---|
| Data size | Must pre-aggregate (>10k rows) → filters limited | Filters operate on the full panel |
| Shareability | One file | `make dashboard` |
| Build time | High for 12 views | Low |

## Decision
Streamlit + Plotly reading parquet/CSV outputs only. Aggregate P10/P90 use backtest-calibrated ratios per hierarchy level; leaf selections sum leaf quantiles (unpooled; leaf sums exceed portfolio P90).

## Consequences
Needs a Python environment on the judge's machine. Mitigation: a static HTML export of the executive view can be added later (`plotly.io.write_html`).
