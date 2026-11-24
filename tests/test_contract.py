"""Data-validation contract on the pipeline outputs (statement business rules + invariants + regression bounds)."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
P, O, R = ROOT / "data/processed", ROOT / "outputs", ROOT / "data/raw"
pytestmark = pytest.mark.skipif(not (P / "panel_demand.parquet").exists() or not (R / "train.csv").exists(), reason="run `make all` with raw data first")


@pytest.fixture(scope="module")
def panel():
    return pd.read_parquet(P / "panel_demand.parquet")


@pytest.fixture(scope="module")
def fc():
    return pd.read_parquet(P / "forecast_full.parquet")


def test_one_row_per_date_sku_region(panel):
    assert not panel.duplicated(["Date", "SKU_ID", "Region"]).any()


def test_revenue_reconciles(panel):
    x = panel.dropna(subset=["Units_Clean", "Price_Clean"])
    assert (x.Revenue_Clean - x.Units_Clean * x.Price_Clean).abs().max() < 1e-6


def test_price_one_per_sku_month_and_changes_on_january(panel):
    assert (panel.groupby(["SKU_ID", "Date"]).Price_Clean.nunique() <= 1).all()
    g = panel.groupby(["SKU_ID", "Date"]).Price_Clean.first().unstack()
    r = g.div(g.shift(1, axis=1))
    r = r[[c for c in r.columns if not c.endswith("-01") and c not in ("2022-07", "2023-01")]]
    assert ((r - 1).abs() > 0.5).sum().sum() == 0, "no x100/x0.01 price errors may survive cleaning"
    assert panel.Price_Clean.max() < 10_000


def test_only_canonical_labels(panel):
    assert panel.Region.nunique() == 6 and panel.Sales_Channel.nunique() == 4 and panel.Product_Family.nunique() == 7


def test_each_family_has_one_business_unit(panel):
    assert panel.groupby("Product_Family").Business_Unit.nunique().max() == 1


def test_missing_rows_are_nan_not_zero(panel):
    m = panel[panel.row_status == "missing"]
    assert len(m) > 0 and m.Units_Clean.isna().all()


def test_unconstrained_demand_is_at_least_shipped_when_no_carry_in(panel):
    s = panel[panel.Requested_Units.notna() & (panel.Carried_In_Units.fillna(0) == 0)]
    assert (s.Demand_Unconstrained >= s.Units_Clean - 1e-9).all()


def test_forecast_intervals_ordered_and_nonnegative(fc):
    assert (fc.p10 <= fc.p50 + 1e-9).all() and (fc.p50 <= fc.p90 + 1e-9).all() and (fc.p10 >= 0).all()


def test_forecast_level_is_plausible(fc, panel):
    hist = panel[panel.Date >= "2025-11"].Demand_Unconstrained.sum() / 12
    fm = fc.groupby("Date").p50.sum()
    assert 0.8 * hist < fm.mean() < 1.25 * hist
    assert fm.max() < 1.5 * hist and fm.min() > 0.5 * hist


def test_forecast_revenue_uses_a_sane_price(fc, panel):
    last = panel.sort_values("Date").groupby("SKU_ID").Price_Clean.last()
    assert fc.Price_Forecast.notna().all() and fc.Revenue_P50.notna().all()   # launches priced from predecessor
    ratio = (fc.Price_Forecast / fc.SKU_ID.map(last)).dropna()
    assert ratio.between(1.0, 1.25).all()


def test_dq_report_machine_readable():
    j = json.load(open(P / "dq_report.json"))
    assert {"summary", "issues"} <= set(j) or "summary" in j
    assert (pd.read_csv(P / "dq_issues.csv").columns == ["file", "issue", "rows_affected", "action", "severity"]).all()


def test_regression_snapshot_backtest_wape():
    m = pd.read_csv(O / "backtest/metrics_overall.csv")
    m = m[m.origin == "all"].set_index("method").wape
    assert m["lgbm_p50"] < 0.31 and m["lgbm_p50"] < m["snaive"] and m["lgbm_p50"] < m["lvl_season"]
    assert m["tsb"] > m["lgbm_p50"]


def test_anomaly_register_has_reason_and_action():
    r = pd.read_csv(O / "anomaly_register.csv")
    assert r.anomaly_id.is_unique
    assert r.reason.notna().all() and r.action.notna().all()
    assert {"structural_break", "one_off_order", "stockout", "missing_row", "master_conflict_sales_before_launch"} <= set(r.type)


def test_web_export_contract():
    D = ROOT / "web/public/data"
    if not (D / "cube.json").exists():
        pytest.skip("run `make export`")
    import json
    c = json.load(open(D / "cube.json"))
    assert len(c["hist"]["m"]) == len(c["hist"]["d"]) and len(c["fc"]["m"]) == 58219 and c["last_hist"] == c["months"].index("2026-10")
    assert json.load(open(D / "meta.json"))["sample_data"] is False
    ins = json.load(open(D / "insights.json"))
    assert {"headline", "outlook_Product_Family", "macro_leaders", "lifecycle"} <= set(ins["insights"]) and any(l["family"] == "ALL" for l in ins["lags"])
    assert json.load(open(D / "stockouts.json"))["events"] and json.load(open(D / "lifecycle.json"))["skus"]
