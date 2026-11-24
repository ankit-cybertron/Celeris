"""Date parsing. `Date` is authoritative (business rule 1); impossible dates fall back to Load_Timestamp - 1 month."""
from __future__ import annotations
import numpy as np
import pandas as pd

_FORMATS = ("%Y-%m", "%m-%Y", "%b-%Y", "%b %Y", "%Y-%m-%d", "%Y/%m", "%m/%Y")


def parse_month(value) -> pd.Period | pd.NaT:
    s = str(value).strip()
    for fmt in _FORMATS:
        try:
            return pd.Period(pd.to_datetime(s, format=fmt), freq="M")
        except (ValueError, TypeError):
            continue
    return pd.NaT


def parse_month_series(s: pd.Series) -> pd.Series:
    """Parse by unique value (fast: ~700 unique strings)."""
    uniq = {v: parse_month(v) for v in s.dropna().unique()}
    return s.map(uniq)


def repair_out_of_range(periods: pd.Series, load_ts: pd.Series, lo: str, hi: str) -> tuple[pd.Series, pd.Series]:
    """Rows outside [lo, hi] (e.g. 2062-01) are typos. Orders are loaded the month after delivery month,
    so true month = load month - 1. Returns (fixed periods, boolean mask of repaired rows)."""
    bad = periods.isna() | (periods < pd.Period(lo, "M")) | (periods > pd.Period(hi, "M"))
    ts = pd.to_datetime(load_ts, errors="coerce").dt.to_period("M") - 1
    fixed = periods.where(~bad, ts)
    return fixed, bad
