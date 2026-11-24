"""Anomaly register: separates ERRORS (fixed) from REAL EVENTS (modelled / excluded) and DATA GAPS.

Register columns: anomaly_id, type, class, date_start, date_end, SKU_ID, Region, Customer_Name, scope,
value_observed, value_expected, impact_pct, reason, action, linked_event
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from .data import T_ALL, N_HIST, to_matrix, midx
from .cycles import detect_cycle

COLS = ["anomaly_id", "type", "class", "date_start", "date_end", "SKU_ID", "Region", "Customer_Name", "scope",
        "value_observed", "value_expected", "impact_pct", "reason", "action", "linked_event"]

FLAG_INFO = {
    "negative_sign": ("sign flip: units and revenue negative", "fixed: abs()"),
    "unit_scale_0.01": ("units inflated x100 vs revenue/price", "fixed: units = revenue/price"),
    "unit_scale_error": ("units off by 10x vs revenue/price", "fixed: units = revenue/price"),
    "revenue_scale_error": ("revenue off by 10x, units plausible", "fixed: revenue recomputed"),
    "price_cents": ("unit price recorded in cents (x100)", "fixed: SKU-month reference price"),
    "price_zero": ("price 0 with positive units", "fixed: SKU-month reference price"),
    "units_from_revenue": ("units blank / '-' but revenue present", "imputed: revenue/price"),
    "stockout_shipped_override": ("train units disagree with stockout Shipped_Units", "fixed: shipped units"),
}


def _scope_mask(p: pd.DataFrame, st: str, sv: str, desc: str) -> pd.Series:
    if st == "Global":
        return pd.Series(True, index=p.index)
    if st == "Region":
        return p.Region == sv
    if st == "Product_Family":
        return p.Product_Family == sv
    if st == "Channel":
        m = p.Sales_Channel == sv
        if "Europe and MEA" in desc:
            m &= p.Region.isin(["Europe", "Middle East & Africa"])
        return m
    if st == "Customer":
        c, r = [x.strip() for x in sv.split("|")]
        return (p.Customer_Name == c) & (p.Region == r)
    return pd.Series(False, index=p.index)


def event_impacts(p: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    """Observed vs counterfactual (same calendar months +/-1 year) for demand-affecting events."""
    rows = []
    kinds = {"Disruption", "Supply Constraint", "Customer Event", "Logistics", "System", "Market Entry", "Holiday"}
    for _, e in events[events.Event_Type.isin(kinds)].iterrows():
        s, en = str(e.Start_Date)[:7], (str(e.End_Date)[:7] if pd.notna(e.End_Date) else None)
        m = _scope_mask(p, e.Scope_Type, e.Scope_Value, e.Description)
        sub = p[m]
        if en is None:   # open-ended step change: 12m before vs 12m after
            a = pd.Period(s, "M")
            after = sub[(sub.Date >= s) & (sub.Date <= str(a + 11))].Units_Clean.sum()
            before = sub[(sub.Date >= str(a - 12)) & (sub.Date < s)].Units_Clean.sum()
            n_after = sub[(sub.Date >= s)].Date.nunique()
            after = sub[(sub.Date >= s)].Units_Clean.sum() / max(n_after, 1) * 12
            exp, obs = before, after
        else:
            months = pd.period_range(s, en, freq="M")
            obs = sub[sub.Date.isin([str(x) for x in months])].Units_Clean.sum()
            refs = []
            for dy in (-12, 12):
                r = sub[sub.Date.isin([str(x + dy) for x in months])].Units_Clean.sum()
                if r > 0:
                    refs.append(r)
            exp = float(np.mean(refs)) if refs else np.nan
        if e.Event_Type == "Holiday" and en is not None:   # moving holidays: compare with the 2 months before/after the window
            months = pd.period_range(s, en, freq="M")
            obs = sub[sub.Date.isin([str(x) for x in months])].Units_Clean.sum() / len(months)
            adj = [str(months[0] - 2), str(months[0] - 1), str(months[-1] + 1), str(months[-1] + 2)]
            exp = sub[sub.Date.isin(adj)].groupby("Date").Units_Clean.sum().mean()
            obs = obs * len(months); exp = exp * len(months) if pd.notna(exp) else np.nan
        rows.append({"event_id": e.Event_ID, "type": e.Event_Type, "scope": f"{e.Scope_Type}:{e.Scope_Value}", "start": s, "end": en,
                     "description": e.Description, "units_observed": obs, "units_expected": exp,
                     "impact_pct": (obs / exp - 1) * 100 if exp and exp > 0 else np.nan})
    return pd.DataFrame(rows)


def series_profile(p: pd.DataFrame, keys: pd.DataFrame, Y: np.ndarray, sku: pd.DataFrame) -> pd.DataFrame:
    import warnings
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    h = Y[:, :N_HIST]
    last36 = h[:, -36:]
    pos = np.where(last36 > 0, last36, np.nan)
    nzc = np.nansum(last36 > 0, axis=1)
    adi = np.where(nzc > 0, np.sum(~np.isnan(last36), axis=1) / np.maximum(nzc, 1), np.nan)
    with np.errstate(all="ignore"):
        cv2 = (np.nanstd(pos, axis=1) / np.nanmean(pos, axis=1)) ** 2
    cls = np.where(adi < 1.32, np.where(cv2 < 0.49, "smooth", "erratic"), np.where(cv2 < 0.49, "intermittent", "lumpy"))
    cls = np.where(nzc == 0, "inactive", cls)
    cp, cph, cacc = detect_cycle(np.where(np.isnan(h[:, -24:]), np.nan, h[:, -24:]))
    cp0, _, _ = detect_cycle(h[:, 12:48])
    out = keys[["sid", "SKU_ID", "Region", "Product_Family", "Customer_Name", "Sales_Channel", "pt"]].copy()
    out["adi"], out["cv2"], out["demand_class"] = adi, cv2, cls
    out["zero_share_36m"] = np.nanmean(np.where(np.isnan(last36), np.nan, (last36 == 0).astype(float)), axis=1)
    out["cycle_period"], out["cycle_fit"], out["cycle_period_early"] = cp, cacc, cp0
    out["first_month"] = [(np.argmax(~np.isnan(r)) if (~np.isnan(r)).any() else -1) for r in h]
    out["last_positive_month"] = [(len(r) - 1 - np.argmax(r[::-1] > 0) if (r > 0).any() else -1) for r in h]
    sm = sku.set_index("SKU_ID")
    out["lifecycle"] = out.SKU_ID.map(sm.Lifecycle_Status)
    return out


def detect_level_shifts(p: pd.DataFrame, min_ratio: float = 2.5, win: int = 12) -> pd.DataFrame:
    """Idiosyncratic structural breaks: best single change point per SKU-region where the mean of the next `win`
    months differs from the previous `win` months, after dividing out the global monthly index (so pandemic,
    chip shortage etc. do not count). Windows of 12 cancel seasonality. Launch/EOL edges are excluded."""
    piv = p.pivot_table(index=["SKU_ID", "Region"], columns="mi", values="Demand_Unconstrained", aggfunc="sum")
    G = piv.sum(axis=0).values; G = G / G.mean()
    A = piv.values / G
    out = []
    for i, (key, row) in enumerate(zip(piv.index, A)):
        pos = np.where(np.nan_to_num(row) > 0)[0]
        if len(pos) < 2 * win + 4:
            continue
        lo, hi = pos.min() + win, pos.max() - win + 1  # keep windows inside the active lifetime
        best = None
        for k in range(lo, hi + 1):
            b, a = row[k - win:k], row[k:k + win]
            if len(a) < win or np.isnan(b).sum() > 3 or np.isnan(a).sum() > 3:
                continue
            mb, ma = np.nanmean(b), np.nanmean(a)
            if min(mb, ma) <= 0 or (b > 0).mean() < .5 or (a > 0).mean() < .5:
                continue
            r = ma / mb
            if best is None or abs(np.log(r)) > abs(np.log(best[1])):
                best = (k, r, mb, ma)
        if best and (best[1] >= min_ratio or best[1] <= 1 / min_ratio):
            out.append(dict(SKU_ID=key[0], Region=key[1], mi=best[0], ratio=best[1], before=best[2] * G.mean(), after=best[3] * G.mean()))
    return pd.DataFrame(out)


def build_register(p: pd.DataFrame, events: pd.DataFrame, sku: pd.DataFrame, test: pd.DataFrame, prof: pd.DataFrame, cfg: dict):
    reg: list[dict] = []

    def add(**kw):
        reg.append({c: kw.get(c) for c in COLS})

    obs = p[p.row_status != "missing"]
    # 1. data errors fixed (row level)
    for _, r in obs[obs.fix_flags != ""].iterrows():
        for f in r.fix_flags.split("|"):
            why, act = FLAG_INFO.get(f, (f, "fixed"))
            add(type=f, **{"class": "data_error"}, date_start=r.Date, date_end=r.Date, SKU_ID=r.SKU_ID, Region=r.Region,
                Customer_Name=r.Customer_Name, scope="row", value_observed=np.nan, value_expected=r.Units_Clean, reason=why, action=act)
    # 2. data gaps
    for _, r in p[p.row_status == "missing"].iterrows():
        add(type="missing_row", **{"class": "data_gap"}, date_start=r.Date, date_end=r.Date, SKU_ID=r.SKU_ID, Region=r.Region,
            Customer_Name=r.Customer_Name, scope="row", reason="row absent inside SKU-region lifetime (missing != zero)", action="left as NaN; not trained on")
    for _, r in obs[obs.Units_Clean.isna()].iterrows():
        add(type="units_unrecoverable", **{"class": "data_gap"}, date_start=r.Date, date_end=r.Date, SKU_ID=r.SKU_ID, Region=r.Region,
            Customer_Name=r.Customer_Name, scope="row", reason="units missing and not recoverable from revenue/price/stockout file", action="left as NaN; not trained on")
    # 3. real events
    for _, r in p[p.Demand_Source == "stockout_file_requested"].iterrows():
        add(type="stockout", **{"class": "real_event"}, date_start=r.Date, date_end=r.Date, SKU_ID=r.SKU_ID, Region=r.Region, Customer_Name=r.Customer_Name,
            scope="row", value_observed=r.Units_Clean, value_expected=r.Requested_Units, impact_pct=(r.Units_Clean / r.Requested_Units - 1) * 100 if r.Requested_Units else np.nan,
            reason=f"supply-constrained: {r.Reason}", action="demand set to Requested_Units")
    est = p[p.Demand_Source == "estimated_unconstrained"]
    for (fam, d), g in est.groupby(["Product_Family", "Date"]):
        add(type="stockout_estimated", **{"class": "real_event"}, date_start=d, date_end=d, scope=f"family:{fam}", value_observed=g.Units_Clean.sum(),
            value_expected=g.Demand_Unconstrained.sum(), impact_pct=(g.Units_Clean.sum() / g.Demand_Unconstrained.sum() - 1) * 100,
            reason=f"{len(g)} unlisted rows in documented supply-constraint window (stockout file incomplete)", action="demand estimated via month fill-ratio", linked_event="EV-019")
    for _, r in p[p.is_spike & (p.Demand_Source == "observed_shipped")].iterrows():
        add(type="one_off_order", **{"class": "real_event"}, date_start=r.Date, date_end=r.Date, SKU_ID=r.SKU_ID, Region=r.Region, Customer_Name=r.Customer_Name,
            scope="row", value_observed=r.Demand_Unconstrained, value_expected=r.local_median, impact_pct=(r.spike_ratio - 1) * 100,
            reason=f"{r.spike_ratio:.1f}x local median, no data error signature", action=f"kept in history; capped at {cfg['anomaly']['spike_cap_ratio']}x for training")
    imp = event_impacts(p, events)
    for _, e in imp.iterrows():
        add(type="event_" + e.type.lower().replace(" ", "_"), **{"class": "real_event"}, date_start=e.start, date_end=e.end, scope=e.scope,
            value_observed=e.units_observed, value_expected=e.units_expected, impact_pct=e.impact_pct, reason=e.description,
            action=("modelled via event features / excluded as level shift" if e.type not in ("Market Entry", "Holiday") else ("series start" if e.type == "Market Entry" else "modelled via holiday_fraction feature")), linked_event=e.event_id)
    # early buying before announced 2022 price rise
    m = p.groupby("Date").Demand_Unconstrained.sum()
    def ratio(y):  # Sep-Dec demand relative to Jan-Aug of the same year
        return m[f"{y}-09":f"{y}-12"].mean() / m[f"{y}-01":f"{y}-08"].mean()
    base = np.mean([ratio(2021), ratio(2023), ratio(2024)])
    add(type="early_buying", **{"class": "real_event"}, date_start="2022-09", date_end="2022-12", scope="Global", value_observed=ratio(2022), value_expected=base,
        impact_pct=(ratio(2022) / base - 1) * 100, reason="9% price rise announced 15-Nov-2022 effective Jan-2023: pull-forward into Q4", action="modelled: pull-forward feature only for rises >= 8%", linked_event="EV-030")
    # 4. structural / master-data
    for _, r in prof[(prof.cycle_period != prof.cycle_period_early) & (prof.cycle_fit > .9)].iterrows():
        add(type="ordering_cycle_change", **{"class": "structural"}, SKU_ID=r.SKU_ID, Region=r.Region, Customer_Name=r.Customer_Name, scope="series",
            reason=f"order period {r.cycle_period_early} -> {r.cycle_period} months", action="use latest-regime cycle for forecast")
    for _, r in detect_level_shifts(p).iterrows():
        add(type="structural_break", **{"class": "structural"}, SKU_ID=r.SKU_ID, Region=r.Region, scope="series", date_start=str(pd.Period("2019-01", "M") + int(r.mi)),
            value_observed=r.after, value_expected=r.before, impact_pct=(r.ratio - 1) * 100,
            reason=f"level shift {r.ratio:.2f}x vs prior 12 months (global index removed)", action="flag for planner; model uses recent level via rolling features")
    ct = p.groupby(["SKU_ID", "Region"]).Customer_Name.nunique()
    for (s, rg), n in ct[ct > 1].items():
        add(type="customer_switch", **{"class": "structural"}, SKU_ID=s, Region=rg, scope="series", reason=f"{n} customers over time", action="trained on series; forecast uses test-file customer")
    last_obs = N_HIST - 1
    lost = prof[(prof.last_positive_month >= 0) & (last_obs - prof.last_positive_month >= cfg["anomaly"]["lost_account_months"]) & (prof.lifecycle == "Active")]
    in_test = set(zip(test.SKU_ID, test.Region))
    for _, r in lost.iterrows():
        add(type="lost_account", **{"class": "structural"}, SKU_ID=r.SKU_ID, Region=r.Region, Customer_Name=r.Customer_Name, scope="series",
            date_start=str(pd.Period("2019-01", "M") + int(r.last_positive_month)), reason=f"no positive demand for {last_obs - r.last_positive_month} months" + ("; present in test" if (r.SKU_ID, r.Region) in in_test else ""),
            action="forecast near zero unless demand resumes")
    sm = sku.set_index("SKU_ID")
    first = p[p.Units_Clean > 0].groupby("SKU_ID").Date.min()
    for s, d in first.items():
        l = sm.Launch_Date.get(s)
        if pd.notna(l) and d < l:
            n = ((p.SKU_ID == s) & (p.Units_Clean > 0) & (p.Date < l)).sum()
            add(type="master_conflict_sales_before_launch", **{"class": "master_conflict"}, SKU_ID=s, scope="sku", date_start=d, reason=f"{n} sales rows before master Launch_Date {l}", action="trust transactions; flag master")
    eol = sm[sm.EOL_Date.notna()]
    for s, r in eol.iterrows():
        tr = test[(test.SKU_ID == s) & (test.Date > r.EOL_Date)]
        if len(tr):
            add(type="test_rows_after_EOL", **{"class": "master_conflict"}, SKU_ID=s, scope="sku", date_start=r.EOL_Date, reason=f"{len(tr)} test rows after EOL {r.EOL_Date} (rule 5)", action="forecast = 0 after EOL")
    for s, r in sm[sm.Lifecycle_Status == "Planned Launch"].iterrows():
        tr = test[test.SKU_ID == s]
        add(type="new_launch_no_history", **{"class": "structural"}, SKU_ID=s, scope="sku", date_start=r.Launch_Date, reason=f"planned launch, replaces {r.Replaces_SKU}, {len(tr)} test rows", action="forecast via predecessor ramp (Replaces_SKU)")
    df = pd.DataFrame(reg, columns=COLS)
    df["anomaly_id"] = [f"AN-{i:06d}" for i in range(len(df))]
    return df, imp
