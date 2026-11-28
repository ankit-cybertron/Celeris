"""Contract tests on generated outputs (skipped until `make all` has been run)."""
import pandas as pd
import pytest
from mks.config import load_config

cfg = load_config()
SUB, RAW = cfg["paths"]["outputs"] / "submission.csv", cfg["paths"]["raw"]
pytestmark = pytest.mark.skipif(not SUB.exists(), reason="run `make all` first")


def test_submission_matches_test_keys_and_sample_format():
    sub, test, ss = pd.read_csv(SUB), pd.read_csv(RAW / "test.csv"), pd.read_csv(RAW / "sample_submission.csv")
    assert list(sub.columns) == list(ss.columns)
    assert len(sub) == len(test)
    assert (sub[["Date", "SKU_ID", "Region"]].values == test[["Date", "SKU_ID", "Region"]].values).all()
    assert sub.Units_Sold_Forecast.notna().all() and (sub.Units_Sold_Forecast >= 0).all()
    assert sub.Units_Sold_Forecast.dtype.kind == "i"


def test_no_sales_after_eol():
    sub = pd.read_csv(SUB)
    sku = pd.read_csv(RAW / "sku_master.csv").dropna(subset=["EOL_Date"])
    for _, r in sku.iterrows():
        x = sub[(sub.SKU_ID == r.SKU_ID) & (sub.Date > r.EOL_Date)]
        assert (x.Units_Sold_Forecast == 0).all(), r.SKU_ID


def test_panel_never_zero_fills_missing_rows():
    p = pd.read_parquet(cfg["paths"]["processed"] / "panel_clean.parquet")
    miss = p[p.row_status == "missing"]
    assert len(miss) > 0 and miss.Units_Clean.isna().all()
    assert not p.duplicated(["Date", "SKU_ID", "Region"]).any()
    assert (p.Units_Clean.dropna() >= 0).all()


def test_web_cube_p50_matches_submission():
    import json
    cube_path = cfg["paths"]["outputs"].parent / "web" / "public" / "data" / "cube.json"
    if not cube_path.exists():
        pytest.skip("cube.json not generated yet")
    with open(cube_path) as f:
        cube = json.load(f)
    sub = pd.read_csv(SUB)
    assert sum(cube["fc"]["p50"]) == sub.Units_Sold_Forecast.sum()
