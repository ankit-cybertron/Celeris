"""Unconstrained demand (business rule 7) and model-ready demand.

1. Listed stockout rows: demand = Requested_Units (file says so).
2. The stockout file is incomplete. For the documented semiconductor-allocation window (events_calendar
   'Supply Constraint', family ELA) unlisted rows are depressed to the same level as listed ones (verified in
   EDA: 0.84x of 2023-24 baseline vs 1.29x demand on listed rows), so demand is estimated as
   Units / month fill-ratio, where the fill-ratio is shipped/requested measured on listed rows of that month.
3. `Demand_Model` additionally caps one-off spikes (real events, kept in history views, but not extrapolated).
"""
from __future__ import annotations
import numpy as np
import pandas as pd


def supply_windows(events: pd.DataFrame):
    ev = events[events.Event_Type == "Supply Constraint"]
    out = []
    for _, r in ev.iterrows():
        out.append((r.Scope_Type, r.Scope_Value, str(r.Start_Date)[:7], str(r.End_Date)[:7] if pd.notna(r.End_Date) else "2099-12"))
    return out


def estimate_unconstrained(panel: pd.DataFrame, events: pd.DataFrame, max_uplift: float = 3.0) -> pd.DataFrame:
    p = panel.copy()
    p["Demand_Source"] = np.where(p.Requested_Units.notna(), "stockout_file_requested", "observed_shipped")
    for scope_type, scope_val, s, e in supply_windows(events):
        if scope_type != "Product_Family":
            continue
        inwin = (p.Product_Family == scope_val) & (p.Date >= s) & (p.Date <= e)
        listed = inwin & p.Requested_Units.notna() & p.Units_Clean.notna()
        # D-1 fix: compute raw fill ratio; NaN where total supply failure (all shipped=0) so unlisted
        # rows in a total-failure month are skipped rather than inflated to 3× max_uplift.
        fill_raw = p[listed].groupby("Date").apply(
            lambda g: g.Units_Clean.sum() / max(g.Requested_Units.sum(), 1), include_groups=False
        )
        fill = fill_raw.where(fill_raw > 0).clip(upper=1.0)   # NaN if total failure; skip those months
        unl = inwin & p.Requested_Units.isna() & p.Units_Clean.notna()
        f = p.Date.map(fill)
        est = unl & f.notna()
        p.loc[est, "Demand_Unconstrained"] = p.loc[est, "Units_Clean"] / f[est]
        p.loc[est, "Demand_Source"] = "estimated_unconstrained"
        # D-2 fix: zero-shipped unlisted rows in supply-constraint window are constrained zeros,
        # not genuine zero demand — mark source so training treats them as NaN.
        est_zero = unl & (p.Units_Clean == 0)
        p.loc[est_zero, "Demand_Source"] = "estimated_zero_stockout"
    return p


def cap_spikes(p: pd.DataFrame, cap_ratio: float, spike_ratio: float) -> pd.DataFrame:
    """Local-level reference (13m centred median of positive demand) per series; flag and cap spikes."""
    p = p.sort_values(["SKU_ID", "Region", "mi"]).copy()
    d = p.Demand_Unconstrained
    lm = p.assign(_d=d.where(d > 0)).groupby(["SKU_ID", "Region"])._d.transform(lambda s: s.rolling(13, center=True, min_periods=4).median())
    p["local_median"] = lm
    p["spike_ratio"] = d / lm
    p["is_spike"] = (p.spike_ratio >= spike_ratio) & lm.notna()
    p["Demand_Model"] = np.where(p.is_spike, lm * cap_ratio, d)
    return p
