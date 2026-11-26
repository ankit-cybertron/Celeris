# Runbook

## Run
`make all` (≈4 min) → `make test` → `make dashboard`. `make fast` is a ≈1-minute smoke run with tiny models (do not submit its output).

## Resume after an interruption
1. Check git status: `git status && git log --oneline -n 5`. 2. Check that the last "done" artefact exists (`ls outputs data/processed`). 3. Resume at the first unchecked stage; stages are idempotent and communicate through files.

## Stage contract
| Stage | Reads | Writes |
|---|---|---|
| clean | data/raw/*.csv | processed/panel_clean.parquet, macro_clean.parquet, dq_report.json, dq_issues.csv |
| anomalies | panel_clean, raw events/sku/test | processed/panel_demand, series_keys, series_profile; outputs/anomaly_register.csv, event_impacts.csv |
| backtest | panel_demand, macro | outputs/backtest/* |
| forecast | panel_demand, macro, backtest outputs | outputs/submission.csv, forecast_audit.json, feature_importance.csv; processed/forecast_full.parquet |

## Troubleshooting
* `Pipeline outputs not found` in the dashboard → run `make all`.
* `forecast merge lost rows` assertion → test.csv keys changed; rerun `make clean anomalies`.
* Slow/OOM → set `model.train_origin_step: 6` or `n_estimators: 200` in `configs/config.yaml`.
* Submission rejected → check `outputs/submission.csv` columns equal `sample_submission.csv` (validated automatically by the forecast stage and `tests/test_outputs.py`).

## Tuning knobs (configs/config.yaml)
`model_exclude_events` (events masked from training), `planned_events` (multipliers for future events), `anomaly.spike_*`, `model.*`, `model.bias_calibration`.
