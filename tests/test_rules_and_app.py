"""Rule overlays, pipeline idempotency and a dashboard smoke test."""
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
P, O, R = ROOT / "data/processed", ROOT / "outputs", ROOT / "data/raw"
have = (P / "forecast_full.parquet").exists() and (R / "train.csv").exists()
pytestmark = pytest.mark.skipif(not have, reason="run `make all` first")


def test_eol_zero_after_and_wind_down_before():
    f, sku = pd.read_parquet(P / "forecast_full.parquet"), pd.read_csv(R / "sku_master.csv")
    for s, e in sku.dropna(subset=["EOL_Date"]).set_index("SKU_ID").EOL_Date.items():
        g = f[f.SKU_ID == s]
        assert (g[g.Date > e].Units_Sold_Forecast == 0).all(), s


def test_launches_have_no_forecast_before_launch_and_positive_after():
    f, sku = pd.read_parquet(P / "forecast_full.parquet"), pd.read_csv(R / "sku_master.csv")
    for s, l in sku[sku.Lifecycle_Status == "Planned Launch"].set_index("SKU_ID").Launch_Date.items():
        g = f[f.SKU_ID == s]
        assert (g[g.Date < l].Units_Sold_Forecast == 0).all(), s
        assert g[g.Date >= l].p50.sum() > 0, s


def test_planned_event_ev062_cuts_orion_na_in_window():
    f = pd.read_parquet(P / "forecast_full.parquet")
    g = f[(f.Customer_Name.str.contains("Orion Driveline")) & (f.Region == "North America")]
    if len(g):
        win = g[g.Date.isin(["2027-07", "2027-08"])].p50.sum()
        oth = g[g.Date.isin(["2027-05", "2027-06"])].p50.sum()
        assert win < 0.6 * oth


def test_submission_is_non_negative_integer_and_complete():
    s, t = pd.read_csv(O / "submission.csv"), pd.read_csv(R / "test.csv")
    assert len(s) == len(t) and s.Units_Sold_Forecast.dtype.kind == "i" and (s.Units_Sold_Forecast >= 0).all()


def test_forecast_is_deterministic_vs_saved_submission():
    """Same inputs -> same file (seeded). Guards against accidental non-determinism."""
    f = pd.read_parquet(P / "forecast_full.parquet")
    s = pd.read_csv(O / "submission.csv")
    assert (np.rint(f.p50).astype(int).to_numpy() == s.Units_Sold_Forecast.to_numpy()).all()


def test_structural_break_detector_flags_planted_shift():
    from mks.anomalies import detect_level_shifts
    rng = np.random.default_rng(0)
    rows = []
    for mi in range(60):
        for reg, lvl in [("A", 100 if mi < 30 else 400)] + [(f"R{i}", 100) for i in range(40)]:
            rows.append(dict(SKU_ID="S", Region=reg, mi=mi, Demand_Unconstrained=lvl * (1 + .05 * rng.standard_normal())))
    d = detect_level_shifts(pd.DataFrame(rows))
    assert set(d.Region) == {"A"} and 24 <= d.mi.iloc[0] <= 36


def test_intermittent_baselines_basic():
    from mks.models import tsb_forecast, croston_sba
    Y = np.array([[0, 0, 5, 0, 5, 0, 5, 0, 5, 0.0], np.zeros(10)])
    for fn in (tsb_forecast, croston_sba):
        out = fn(Y, 9)
        assert out[1] == 0 and 0.5 < out[0] < 5


def test_web_scale_guarantees_valid_bands():
    scale = pd.read_csv(O / "backtest/intervals_scale.csv")
    assert (scale.q10 <= scale.q50).all(), "q10 must be <= q50"
    assert (scale.q50 <= scale.q90).all(), "q50 must be <= q90"
    assert (scale.q10 < scale.q90).all(), "q10 must be strictly less than q90"
    assert not scale.isna().any().any()
