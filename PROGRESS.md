# PROGRESS — resume checkpoint

> If the session was interrupted: tell Claude "continue". It must read THIS file first, run `git status`/`ls`,
> verify the last DONE item exists on disk, then resume at the first unchecked item. Update this file after every step.

Last updated: (auto) — see git log / file mtime.

## Stages
- [x] S1 Scaffold: README, Makefile, pyproject, requirements, configs, .gitignore
- [x] S2 Docs: architecture.md, ADRs 0001-0005, data_context.md, EDA_FINDINGS.md, runbook.md
- [x] S3 Cleaning pipeline `src/mks/clean/*` + DQ report + tests
- [x] S4 Anomaly register + unconstrained demand `src/mks/anomalies.py`, `demand.py`
- [x] S5 Features + models + backtest `src/mks/features.py`, `models.py`, `backtest.py`
- [x] S6 Final forecast + rules + intervals + submission `src/mks/forecast.py`
- [x] S7 React Dashboard `web/` (TanStack Start + Recharts + Tailwind)
- [x] S8 End-to-end run (`make all`), tests green (35 pytest, 14 vitest), code review pass

## Key facts (do not re-derive)
- Repo root: /home/claude/mks-demand-forecast ; raw data in data/raw (7 csv) ; run: `make all`
- Metric unknown -> assume WAPE + bias. Backtest origin 2025-03: LGBM L1 WAPE 0.30, seasonal-naive 0.37.
- Test has EOL traps (PMP-003, PTC-005, THM-001 EOL 2027-08/05/12) and 3 launches (PMP-020, PTC-029, THM-012).
- Deadline: 2026-11-29 23:59 IST.

## Log
- S3,S4 done (clean pipeline, anomalies run OK). features.py/models.py/backtest.py/cli.py written; forecast.py + running backtest next.
- S5,S6 code done (features, models, backtest, forecast + rules R1 EOL, R2 launch ramp, R3 planned events). Full (non-fast) backtest+forecast launched in background -> outputs/full_run.log. NEXT: S7 dashboard (app/dashboard.py), then docs (S2), tests, review, zip.
- (resume 11-21 17:34) background forecast was killed mid-run; relaunching full chain clean->anomalies->backtest->forecast via nohup -> outputs/full_run.log
- S7 app/dashboard.py written (12 tabs); needs smoke test after full pipeline finishes.
- Full pipeline ran OK (clean->anomalies->backtest->forecast), pytest 13 green. Backtest WAPE lgbm 0.286 (snaive 0.364), fam-region-month 0.090, P10-P90 coverage 0.77. NEXT: dashboard smoke test, docs S2, code review, zip.
- S7 dashboard smoke-tested (AppTest + screenshots OK). NEXT: docs S2 (README, architecture, system_design, ADRs, data_context, EDA, runbook), code review, zip+deliver.
- Added: holiday impacts in event_impacts; dashboard exec shows units+revenue timelines, bias charts, macro lag stability + EV mix. Docs done: README, architecture, ADR 0001-0005. NEXT: data_context.md, EDA_FINDINGS.md, runbook.md, SUBMISSION_NOTES.md, re-smoke dashboard, commit, zip, SendUserFile.
- Docs complete. Running final 'make all' verification (log outputs/full_run.log), then pytest, commit, zip, SendUserFile.
- Final make all OK (deterministic, same totals), pytest green. Remaining: zip + deliver.


## Audit pass (2026-11-23) - DONE
- Fixed: x100 price in reference price (revenue plan $2.75B -> $2.47B), launch SKU prices, BU master conflict (4 SKUs).
- Added: structural-break detector (133), TSB/Croston baselines, insights stage (`make insights` -> docs/INSIGHTS.md, outputs/macro_family_lags.csv), dashboard Insights tab, drill-down, anomaly markers, DQ-by-file, family x indicator lag heatmaps.
- Tests: 34 pass (contract, rules, determinism, dashboard smoke). Report: docs/VALIDATION_REPORT.md.
- Remaining: presentation/walkthrough deck (criterion 7), submission-form mechanics (ask user), AI-use disclosure (rules page has no AI clause).

## React dashboard (2026-11-24) - DONE
- web/ (Vite+React+TS+Recharts) reads web/public/data/*.json from `make export`; 13 tabs, browser-tested. Lovable prompt: docs/LOVABLE_PROMPT.md. Streamlit app kept as fallback.

## Lovable merge (2026-11-24) - DONE
- web/ = Lovable app (TanStack Start) wired to real data via src/mks/export_web.py (Lovable JSON contract). 13 vitest + 35 pytest pass; browser-checked all 13 tabs. Old hand-built React app discarded; Streamlit app kept as fallback.
- FINAL zip: mks-demand-forecast-final.zip (raw data inside; node_modules/.output/.git excluded).

## Dashboard Polish & Bugfixes (2026-11-24 evening) - DONE
- Streamlit removed completely (`rm -rf app/`, updated Makefile, requirements.txt, pyproject.toml, and tests).
- Fixed Bug 1: P10-P90 band below forecast line. Pooled backtest origins in `src/mks/backtest.py` and computed scaling relative to median (q10/q50, q90/q50), guaranteeing q10 <= 1.0 <= q90. Enforced p10 <= p50 <= p90 in `web/src/lib/engine.ts` and added unit test.
- Fixed Bug 2: Procurement view contradiction. Fixed negative cover, aligned portfolio P90 buffer (+10%..16%) vs leaf SKU safety stock (+44%..47%), updated labels and subtitles.
- Fixed Bug 3: Seasonality index calculation in `src/mks/insights.py`. Restricted to complete years 2023-2025 so Nov/Dec are not underweighted by 25%.
- Clarified Item 4: Documented forecast shape dynamics (Nov-26..Feb-27 rebound vs late-2027 reversion to 2024 stationary mean) in INSIGHTS.md, VALIDATION_REPORT.md, and dashboard insights.
- Simplified React tabs & labels: Shortened labels (Executive, Forecast, Demand, Anomalies, Data Health, etc.) and grouped into Core | Planning | Operations with visual dividers.
- Housekeeping: Removed `web/scripts/generate_sample_data.py`, updated README.md, PROGRESS.md. 35 pytest + 14 vitest pass.
