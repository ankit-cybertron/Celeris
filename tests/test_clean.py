import numpy as np
import pandas as pd
import pytest
from mks.clean import dates, labels, units, macro
from mks.clean.dq import DQLog
from mks.config import load_config


def test_parse_month_formats():
    for s in ["2021-03", "03-2021", "Mar-2021", "Mar 2021", "2021-03-01", "2021/03", "03/2021"]:
        assert dates.parse_month(s) == pd.Period("2021-03", "M"), s
    assert pd.isna(dates.parse_month("garbage"))


def test_out_of_range_dates_repaired_from_load_timestamp():
    per = pd.Series([pd.Period("2062-01", "M"), pd.Period("2020-05", "M")])
    load = pd.Series(["2020-06-04 10:00:00", "2020-06-04 10:00:00"])
    fixed, bad = dates.repair_out_of_range(per, load, "2019-01", "2026-10")
    assert list(bad) == [True, False]
    assert fixed[0] == pd.Period("2020-05", "M") and fixed[1] == pd.Period("2020-05", "M")


def test_label_normalisation():
    assert labels.norm_sku("pmp_7") == "PMP-007" and labels.norm_sku("PMP-007") == "PMP-007" and labels.norm_sku("bad") is None
    r = labels.norm_region(pd.Series(["APAC", " eu ", "N. America", "Latin-America", "Nowhere"]))
    assert r.tolist()[:4] == ["Asia Pacific", "Europe", "North America", "Latin America"] and pd.isna(r.iloc[4])
    assert labels.norm_channel(pd.Series(["T1 Distributor", "after-market"])).tolist() == ["Tier-1 Distributor", "Aftermarket"]


def test_customer_fuzzy_typos():
    names = ["Vantara Auto"] * 1200 + ["Orion Driveline"] * 1200 + ["Vntara Auto", " vantara  auto ", "Orion Drivelin", "ORION DRIVELINE INC."]
    out = labels.norm_customer(pd.Series(names))
    assert set(out.unique()) == {"Vantara Auto", "Orion Driveline"}


def _frame(rows):
    df = pd.DataFrame(rows, columns=["SKU_ID", "Region", "Date", "Units_Sold", "Unit_Price_USD", "Revenue_USD"])
    df["Date"] = pd.PeriodIndex(df.Date, freq="M")
    return df


def test_unit_fixes_cover_error_taxonomy():
    cfg = load_config()
    base = [("AAA-001", "India", f"2022-{m:02d}", "100", "10.0", "1000.0") for m in range(1, 13)]
    # extra reference rows from other regions so SKU-month reference price exists
    ref = [("AAA-001", r, f"2022-{m:02d}", "100", "10.0", "1000.0") for r in ("Europe", "Asia Pacific", "North America") for m in range(1, 13)]
    bad = {
        0: ("-100", "10.0", "-1000.0"),     # negative sign flip
        1: ("10000", "10.0", "1000.0"),     # x100 inflated units
        2: ("100", "1000.0", "1000.0"),     # price in cents -> revenue/(U*P) = 0.01 but pr ~100
        3: ("100", "0.00", "0.0"),          # price zero with units
        4: ("-", "10.0", "1000.0"),         # units missing, revenue present
    }
    for i, (u, p, r) in bad.items():
        base[i] = ("AAA-001", "India", f"2022-{i + 1:02d}", u, p, r)
    out = fix_and_index(cfg, _frame(base + ref))
    assert out.loc[0, "Units_Clean"] == 100 and "negative_sign" in out.loc[0, "fix_flags"]
    assert out.loc[1, "Units_Clean"] == 100 and "unit_scale_0.01" in out.loc[1, "fix_flags"]
    assert out.loc[2, "Units_Clean"] == 100 and "price_cents" in out.loc[2, "fix_flags"] and out.loc[2, "Price_Clean"] == 10.0
    assert out.loc[3, "Units_Clean"] == 100 and "price_zero" in out.loc[3, "fix_flags"]
    assert out.loc[4, "Units_Clean"] == 100 and "units_from_revenue" in out.loc[4, "fix_flags"]
    assert (out.loc[5:11, "Units_Clean"] == 100).all() and (out.loc[5:11, "fix_flags"] == "").all()


def fix_and_index(cfg, df):
    out = units.fix_units(df, cfg, DQLog())
    out = out[out.Region == "India"].sort_values("Date").reset_index(drop=True)
    return out


def test_add_flag_joins_with_pipe():
    f = pd.Series(["", "a"], dtype=object)
    f = units.add_flag(f, [True, True], "b")
    assert f.tolist() == ["b", "a|b"]


def test_macro_cleaning():
    n = 20
    d = pd.DataFrame({"Date": [str(pd.Period("2019-01", "M") + i) for i in range(n)]})
    for c in macro.COLS:
        d[c] = 50.0
    d["Auto_Production_YoY_Pct"] = [-0.02] * 12 + [1.5] * 8
    d.loc[5, "ISM_Manufacturing_PMI"] = 4.8
    dup = d.iloc[[10]].copy(); dup["ISM_Manufacturing_PMI"] = 70.0
    d = pd.concat([d, dup]).sort_values("Date").reset_index(drop=True)
    m = macro.clean_macro(d, DQLog())
    assert len(m) == n and m.Date.is_unique
    assert m.ISM_Manufacturing_PMI.between(40, 60).all()
    assert m.Auto_Production_YoY_Pct.iloc[0] == pytest.approx(-2.0)
