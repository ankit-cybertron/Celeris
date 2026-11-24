# ADR-0004: Business-rule overlays on the model forecast

**Status:** Accepted

| Rule | Trigger | Treatment | Evidence / assumption |
|---|---|---|---|
| R1 EOL | PMP-003 (2027-08), PTC-005 (2027-05), THM-001 (2027-12) have test rows after EOL | forecast = 0 after the EOL month; learned wind-down in the last 6 months (monotone multipliers 0.42,0.42,0.52,0.60,0.62,0.62) | rule 5; curve = median over 6 historically discontinued SKUs (small sample) |
| R2 Launch | PMP-020 (2027-06), PTC-029 (2027-03), THM-012 (2027-10), no history | `ramp[k] × predecessor last-12m level in the same region`; P10/P90 from the 10th/90th percentile of past pairs | ramp = median of 6 historic successor/predecessor pairs; sawtooth from the pairs' ordering cycles is smoothed with a 3-point mean |
| R3 Planned event | Orion Driveline NA retooling Jul–Aug 2027 (EV-062) | × 0.22 in those months (config `planned_events`) | analog: Nexon strike months ran 0.18–0.27× with no catch-up. **Assumption — tune if the jury gives magnitude** |
| Price | Jan-2027 +4.5%, Jan-2028 +4.0% | `Price_Forecast` = last clean price × cumulative rises; revenue = P50 × price | events calendar |

Pull-forward before price rises: only the 9% rise of Nov-2022 shows early buying (+ pre-rise Q4 uplift in the register); the 4–4.5% rises don't, so the model receives the rise size as a feature and learns it itself.

## Consequences
Rule output is flagged in `forecast_full.parquet.rule` and in the dashboard "Planner exceptions" tab; the audit lives in `outputs/forecast_audit.json`.
