"""Units / price / revenue reconciliation (business rules 3 & 4).

Error taxonomy (all verified on the raw extract):
  negative_sign            Units < 0 (Revenue also negative)      -> abs()
  unit_scale_0.01          Units inflated x100 (Revenue is right) -> Units = Revenue/Price
  unit_scale_error (10/0.1) Units off by 10x; choose Units vs Revenue/Price by closeness to local level
  revenue_scale_error      Revenue off by 10x, units fine         -> keep Units
  price_cents              Price in cents (x100)                  -> Price = SKU-month reference price
  price_zero               Price 0 but units > 0                  -> reference price
  units_from_revenue       Units blank/'-' but Revenue present    -> Revenue/Price
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from .dq import DQLog


def add_flag(flags: pd.Series, mask, label: str) -> pd.Series:
    """Append `label` to the pipe-joined flag string for rows where mask is True."""
    arr = flags.to_numpy(dtype=object).copy()
    m = np.asarray(mask, dtype=bool)
    arr[m] = [(a + "|" + label) if a else label for a in arr[m]]
    return pd.Series(arr, index=flags.index, dtype=object)


def to_number(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")


def reference_price(df: pd.DataFrame, units_col: str = "U") -> pd.Series:
    """Reference price per SKU-month (rule 4: one price per SKU across regions). Robust to x100 / x0.01 price errors:
    the SKU-year median (many rows) screens out implausible candidates, then the SKU-month median of the plausible
    ones is used (keeps the 2022 H2 surcharge, which is ~6%)."""
    ok = df[(df.P > 0) & (df[units_col].abs() > 0)].copy()
    ok["yr"] = ok.Date.dt.year
    yr = ok.groupby(["SKU_ID", "yr"]).P.median().rename("Pyr")
    ok = ok.join(yr, on=["SKU_ID", "yr"])
    plaus = ok[ok.P.div(ok.Pyr).between(0.5, 2.0)]
    ref = plaus.groupby(["SKU_ID", "Date"]).P.median().rename("Pref")
    out = df.join(ref, on=["SKU_ID", "Date"]).Pref
    yr_all = yr.reset_index().rename(columns={"Pyr": "Pyr_fb"})
    fb = df.assign(yr=df.Date.dt.year).merge(yr_all, on=["SKU_ID", "yr"], how="left").Pyr_fb.to_numpy()
    return out.fillna(pd.Series(fb, index=df.index))


def _local_median(df: pd.DataFrame, col: str) -> pd.Series:
    key = ["SKU_ID", "Region"]
    return df.groupby(key)[col].transform(lambda s: s.where(s > 0).rolling(13, center=True, min_periods=4).median())


def fix_units(df: pd.DataFrame, cfg: dict, dq: DQLog) -> pd.DataFrame:
    """Expects columns: SKU_ID, Region, Date(Period), Units_Sold(raw str), Unit_Price_USD, Revenue_USD."""
    lo, hi = cfg["cleaning"]["price_tolerance"]
    factors = [round(f, 3) for f in cfg["cleaning"]["unit_scale_factors"]]
    df = df.sort_values(["SKU_ID", "Region", "Date"]).copy()
    df["U_raw_text"] = df.Units_Sold
    df["U"] = to_number(df.Units_Sold)
    df["P"] = pd.to_numeric(df.Unit_Price_USD, errors="coerce")
    df["R"] = pd.to_numeric(df.Revenue_USD, errors="coerce")
    dq.add("train.csv", "units non-numeric ('-', text)", (df.Units_Sold.notna() & df.U.isna() & ~df.Units_Sold.isna()).sum(), "set missing; recover from Revenue/Price where possible")
    dq.add("train.csv", "units with thousands separator", df.Units_Sold.astype(str).str.contains(",", regex=False).sum(), "parsed")
    dq.add("train.csv", "units missing", df.Units_Sold.isna().sum(), "set missing; recover from Revenue/Price where possible", severity="warning")
    flags = pd.Series([""] * len(df), index=df.index, dtype=object)

    def flag(mask, label):
        nonlocal flags
        flags = add_flag(flags, mask, label)

    neg = df.U < 0
    df.loc[neg, "U"] = -df.loc[neg, "U"]
    flag(neg, "negative_sign")
    dq.add("train.csv", "negative units (sign flip)", neg.sum(), "abs()")

    df["Pref"] = reference_price(df)
    df["pr"] = df.P / df.Pref
    df["rr"] = (df.R / (df.U * df.P)).round(3)
    df["lm"] = _local_median(df, "U")
    normal_price = df.pr.between(lo, hi)

    U = df.U.copy()
    s100 = normal_price & df.rr.eq(factors[0]) & df.U.notna()
    U[s100] = (df.R / df.P).round()[s100]
    flag(s100, "unit_scale_0.01")
    dq.add("train.csv", "units inflated x100 (Revenue/(Units*Price)=0.01)", s100.sum(), "Units = Revenue/Price")

    amb = normal_price & df.rr.isin(factors[1:]) & (df.U > 0)
    alt = (df.R / df.P).round()
    use_alt = amb & (df.lm > 0) & (np.log(df.U.clip(lower=.5) / df.lm).abs() > np.log(alt.clip(lower=.5) / df.lm).abs())
    U[use_alt] = alt[use_alt]
    flag(use_alt, "unit_scale_error")
    flag(amb & ~use_alt, "revenue_scale_error")
    dq.add("train.csv", "units off by 10x (fixed from Revenue/Price)", use_alt.sum(), "Units = Revenue/Price")
    dq.add("train.csv", "revenue off by 10x (units kept)", (amb & ~use_alt).sum(), "Revenue recomputed = Units*Price")

    miss = df.U.isna() & df.R.notna() & (df.P > 0) & normal_price
    U[miss] = (df.R / df.P).round()[miss]
    flag(miss, "units_from_revenue")
    dq.add("train.csv", "units recovered from Revenue/Price", miss.sum(), "Units = Revenue/Price", severity="info")

    cents = df.pr.between(95, 106)
    flag(cents, "price_cents")
    dq.add("train.csv", "price in cents (x100)", cents.sum(), "Price = SKU-month reference price")
    pz = (df.P == 0) & (df.U > 0)
    flag(pz, "price_zero")
    dq.add("train.csv", "price 0 with units > 0", pz.sum(), "Price = SKU-month reference price")

    df["Units_Clean"] = U
    df["Price_Clean"] = df.Pref.fillna(df.P.where(df.P > 0))
    df["Revenue_Clean"] = df.Units_Clean * df.Price_Clean
    df["fix_flags"] = flags
    mism = (df.R.notna() & df.Units_Clean.notna() & ((df.R - df.Revenue_Clean).abs() > 0.02 * df.Revenue_Clean.abs() + 1))
    dq.add("train.csv", "revenue still not reconciling after fixes (kept recomputed)", mism.sum(), "Revenue recomputed", severity="warning")
    dq.add("train.csv", "revenue missing", df.R.isna().sum(), "Revenue recomputed = Units*Price", severity="info")
    return df.drop(columns=["U", "P", "R", "Pref", "pr", "rr", "lm", "U_raw_text"])
