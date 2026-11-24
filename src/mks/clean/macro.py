"""Macro-indicator cleaning: dedupe month, unit slips, scale mismatch, gaps."""
from __future__ import annotations
import numpy as np
import pandas as pd
from .dq import DQLog

COLS = ["ISM_Manufacturing_PMI", "Auto_Production_YoY_Pct", "Vehicle_Inventory_Days", "Raw_Material_Cost_Index",
        "New_Vehicle_Orders_Index", "Industrial_Util_Rate_Pct", "Fuel_Price_Index", "EV_Adoption_Index"]


def clean_macro(m: pd.DataFrame, dq: DQLog) -> pd.DataFrame:
    m = m.copy()
    m["Date"] = pd.PeriodIndex(m["Date"].astype(str).str.slice(0, 7), freq="M")
    m = m.sort_values("Date").reset_index(drop=True)
    # duplicate month: keep the row closest to the average of its neighbours
    dups = m[m.Date.duplicated(keep=False)]
    for d in dups.Date.unique():
        idx = m.index[m.Date == d]
        prev, nxt = m[m.Date == d - 1][COLS], m[m.Date == d + 1][COLS]
        ref = pd.concat([prev, nxt]).mean()
        score = ((m.loc[idx, COLS] - ref).abs() / (m[COLS].std() + 1e-9)).sum(axis=1)
        m = m.drop(index=[i for i in idx if i != score.idxmin()])
        dq.add("macro_indicators.csv", "duplicate month", len(idx) - 1, f"kept row closest to neighbours ({d})")
    m = m.reset_index(drop=True)
    bad = m.ISM_Manufacturing_PMI < 20
    m.loc[bad, "ISM_Manufacturing_PMI"] *= 10
    dq.add("macro_indicators.csv", "PMI decimal slip (<20)", bad.sum(), "x10")
    # leading block recorded as fractions instead of percent
    lead = 0
    for v in m.Auto_Production_YoY_Pct:
        if abs(v) < 0.1:
            lead += 1
        else:
            break
    if lead >= 6:
        m.loc[: lead - 1, "Auto_Production_YoY_Pct"] *= 100
        dq.add("macro_indicators.csv", "YoY growth stored as fraction not percent", lead, "x100")
    nulls = int(m[COLS].isna().sum().sum())
    m[COLS] = m[COLS].interpolate(limit_direction="both")
    dq.add("macro_indicators.csv", "missing indicator values", nulls, "linear interpolation", severity="warning")
    return m
