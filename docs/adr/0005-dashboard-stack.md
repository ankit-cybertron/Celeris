# ADR-0005: Control Tower Dashboard Stack (React + TanStack Start + Recharts)

**Status:** Accepted

## Context
The competition requires an interactive Demand Control Tower with ≥5 views (Executive, Forecast & Accuracy, Procurement, Demand Explorer, Anomaly Monitor) with shared multi-dimensional cascading filters (Product family, SKU, Region, Sales channel, Customer), continuous history-to-forecast timelines, empirical uncertainty bands, scenario simulation, and responsive layout.

## Options Considered
| Evaluation Criteria | Static HTML (Embedded JS) | Python Streamlit / Dash | Single-Page React (Vite + TanStack + Recharts) |
|---|---|---|---|
| **Responsiveness & State** | Static / read-only | Python server roundtrip on every filter click | Instant client-side filtering via typed arrays |
| **UX & Modern Controls** | Limited layout flexibility | Fixed Streamlit widget paradigms | Bespoke collapsible rail (`Ctrl+B`), 13 modular views |
| **Execution Architecture** | Pre-aggregated static file | Heavy Python runtime + WebSocket dependency | Static JSON contract (`web/public/data/`) with client-side engine |
| **Enterprise Readiness** | Low | Prototype tier | Production enterprise application tier |

## Decision
Adopt a modern, decoupled single-page React application (`web/`) built with TypeScript, TanStack Start/Router, Tailwind CSS, and Recharts. The pipeline exports pre-indexed columnar JSON arrays (`make export` writes `cube.json`, `dq.json`, `anomalies.json`, `backtest.json`, etc.), and a typed client-side aggregation engine (`Engine` in `web/src/lib/engine.ts`) executes multi-dimensional filtering, aggregations, and scenario simulations with sub-millisecond latency without requiring a backend server.

## Consequences
- **Decoupled Architecture:** ML modeling and web presentation are cleanly decoupled via static JSON data contracts.
- **Judge Ergonomics:** The dashboard runs locally via `make web` or can be deployed to any static host (Cloudflare, Vercel, Netlify) with zero backend maintenance.
- **Reliability:** 14 Vitest unit and routing tests validate the web engine and navigation independently of the Python test suite.
