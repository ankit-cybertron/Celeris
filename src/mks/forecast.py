"""Final forecast: global LightGBM (P10/P50/P90) + business-rule overlays -> submission.csv.

Rule overlays (each documented in docs/adr/0004-forecast-rules.md):
  R1  EOL: zero after EOL month (business rule 5); learned wind-down curve inside the last 5 months before EOL
  R2  New launches with no history: ramp learned from historical successor/predecessor pairs (Replaces_SKU)
  R3  Planned customer events in the forecast window (config.planned_events)
  R4  Unconstrained demand: model is trained on unconstrained demand, no supply cap in the window (rule 7)
"""
from __future__ import annotations
import json
import numpy as np
import pandas as pd
from .config import load_config
from . import data, features as F, models as M, backtest as B
from .data import HORIZON, N_HIST, midx, mlabel
from .anomalies import _scope_mask


def learn_eol_decay(panel: pd.DataFrame, sku: pd.DataFrame, n: int = 6) -> np.ndarray:
    """Median ratio demand(EOL-k) / mean demand(EOL-17..EOL-6), k=0..n-1, over SKUs already discontinued."""
    sm = sku[(sku.Lifecycle_Status == "Discontinued") & sku.EOL_Date.notna()]
    rat = []
    for _, r in sm.iterrows():
        d = panel[panel.SKU_ID == r.SKU_ID].groupby("mi").Demand_Model.sum()
        e = midx(r.EOL_Date)
        base = d.reindex(range(e - 17, e - 5)).mean()
        if base and base > 0:
            rat.append([d.get(e - k, np.nan) / base for k in range(n)])
    if not rat:
        return np.ones(n)
    d = np.clip(np.nanmedian(np.array(rat), axis=0), 0, 1.0)
    return np.minimum.accumulate(d[::-1])[::-1]      # monotone wind-down: closer to EOL => lower


def learn_ramp(panel: pd.DataFrame, sku: pd.DataFrame, K: int = HORIZON):
    """Successor demand in month k since launch relative to the predecessor's last-12-month level (same region)."""
    pairs = sku[sku.Replaces_SKU.notna() & (sku.Lifecycle_Status == "Active")]
    curves = [[] for _ in range(K)]
    for _, r in pairs.iterrows():
        L = midx(r.Launch_Date)
        for reg, g in panel[panel.SKU_ID == r.SKU_ID].groupby("Region"):
            pg = panel[(panel.SKU_ID == r.Replaces_SKU) & (panel.Region == reg)]
            if pg.empty:
                continue
            base = pg[pg.mi.between(L - 12, L - 1)].Demand_Model.mean()
            if not base or np.isnan(base) or base <= 0:
                base = pg.sort_values("mi").Demand_Model.tail(12).mean()
            s = g.set_index("mi").Demand_Model
            for k in range(K):
                if (L + k) in s.index and not np.isnan(s[L + k]):
                    curves[k].append(s[L + k] / base)
    q = lambda v, a: np.nanquantile(v, a) if len(v) else np.nan
    med = pd.Series([q(c, .5) for c in curves]).interpolate(limit_direction="both").rolling(3, min_periods=1, center=True).mean().to_numpy()
    lo = pd.Series([q(c, .1) for c in curves]).interpolate(limit_direction="both").rolling(3, min_periods=1, center=True).mean().to_numpy()
    hi = pd.Series([q(c, .9) for c in curves]).interpolate(limit_direction="both").rolling(3, min_periods=1, center=True).mean().to_numpy()
    return med, lo, hi, [len(c) for c in curves]


def apply_rules(f: pd.DataFrame, panel: pd.DataFrame, sku: pd.DataFrame, events: pd.DataFrame, cfg: dict, Ym: np.ndarray, keys: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """f: one row per test row with Date, mi, SKU_ID, Region, Customer_Name, p10, p50, p90. Returns adjusted frame + audit."""
    audit = {}
    sm = sku.set_index("SKU_ID")
    f = f.copy()
    f["rule"] = ""
    # R2 new launches (before EOL rule so predecessor curve unaffected)
    med, lo, hi, nobs = learn_ramp(panel, sku)
    audit["ramp_median"] = [round(float(x), 3) for x in med]; audit["ramp_pairs_per_month"] = nobs
    kidx = keys.set_index(["SKU_ID", "Region"]).sid
    for s, r in sm[sm.Lifecycle_Status == "Planned Launch"].iterrows():
        L = midx(r.Launch_Date)
        for reg in f[f.SKU_ID == s].Region.unique():
            pr = r.Replaces_SKU
            sid = kidx.get((pr, reg))
            base = np.nanmean(Ym[sid, N_HIST - 12:N_HIST]) if sid is not None else np.nan
            if np.isnan(base):    # predecessor not sold in this region: use its mean across regions
                base = np.nanmean(Ym[kidx[pr].to_numpy()][:, N_HIST - 12:N_HIST])
            m = (f.SKU_ID == s) & (f.Region == reg)
            k = (f.loc[m, "mi"] - L).clip(lower=0, upper=HORIZON - 1).astype(int).to_numpy()
            f.loc[m, "p50"], f.loc[m, "p10"], f.loc[m, "p90"] = base * med[k], base * lo[k], base * hi[k]
            f.loc[m, "rule"] = f"R2_launch<-{pr}"
    # R1 EOL
    decay = learn_eol_decay(panel, sku)
    audit["eol_decay_k0..5"] = [round(float(x), 3) for x in decay]
    for s, r in sm[sm.EOL_Date.notna() & (sm.Lifecycle_Status != "Discontinued")].iterrows():
        e = midx(r.EOL_Date)
        m = f.SKU_ID == s
        after = m & (f.mi > e)
        f.loc[after, ["p10", "p50", "p90"]] = 0.0
        f.loc[after, "rule"] = "R1_after_EOL=0"
        for k, dk in enumerate(decay):
            mk = m & (f.mi == e - k)
            f.loc[mk, ["p10", "p50", "p90"]] = f.loc[mk, ["p10", "p50", "p90"]].to_numpy() * dk
            f.loc[mk, "rule"] = f"R1_eol_decay_k{k}"
    # R3 planned customer events
    for eid, spec in (cfg.get("planned_events") or {}).items():
        e = events[events.Event_ID == eid].iloc[0]
        s, en = midx(str(e.Start_Date)[:7]), midx(str(e.End_Date)[:7])
        c, rg = [x.strip() for x in e.Scope_Value.split("|")]
        m = (f.Customer_Name == c) & (f.Region == rg) & f.mi.between(s, en)
        f.loc[m, ["p10", "p50", "p90"]] = f.loc[m, ["p10", "p50", "p90"]].to_numpy() * spec["multiplier"]
        f.loc[m, "rule"] = f"R3_{eid}"
        audit[f"R3_{eid}_rows"] = int(m.sum())
    audit["rows_by_rule"] = f.rule.replace("", "model").value_counts().to_dict()
    return f, audit


def run(cfg=None, fast: bool = False):
    cfg = cfg or load_config()
    p, keys, events, sku, macro, Ym, Yt = B.model_matrices(cfg)
    test = pd.read_csv(cfg["paths"]["raw"] / "test.csv")
    out = cfg["paths"]["outputs"]
    mcfg = cfg
    if fast:
        mcfg = {**cfg, "model": {**cfg["model"], "n_estimators": 60}}
    ctx = F.Ctx(Ym, keys, macro, events, sku)
    o = N_HIST - 1
    train = F.training_frame(ctx, o, cfg["model"]["train_origin_start"], cfg["model"]["train_origin_step"] * (2 if fast else 1))
    X = F.feature_columns(train)
    print(f"training rows {len(train)}, features {len(X)}", flush=True)
    mods = M.fit_all(train, X, mcfg)
    fut = F.build(ctx, o, range(1, HORIZON + 1), with_y=False)
    pr = M.predict_all(mods, fut, X)
    fut = pd.concat([fut[["sid", "tm", "h"]], pr], axis=1)
    k = keys.set_index("sid")
    fut["SKU_ID"], fut["Region"] = fut.sid.map(k.SKU_ID), fut.sid.map(k.Region)
    t = test.copy()
    t["mi"] = t.Date.map(midx)
    f = t.merge(fut, left_on=["SKU_ID", "Region", "mi"], right_on=["SKU_ID", "Region", "tm"], how="left")
    assert len(f) == len(test) and f.p50.notna().sum() >= len(test) - 200, "forecast merge lost rows"
    f[["p10", "p50", "p90"]] = f[["p10", "p50", "p90"]].fillna(0.0)
    f, audit = apply_rules(f, p, sku, events, cfg, Ym, keys)
    if cfg["model"]["bias_calibration"] and (out / "backtest" / "metrics_overall.csv").exists():
        mo = pd.read_csv(out / "backtest" / "metrics_overall.csv")
        b = float(mo[(mo.origin == "all") & (mo.method == "lgbm_p50")].bias.iloc[0])
        f[["p10", "p50", "p90"]] = f[["p10", "p50", "p90"]] / (1 + np.clip(b, -.1, .1) * .5)
        audit["bias_calibration_applied"] = b
    # price & revenue: last clean price x announced January rises
    lastp = p.dropna(subset=["Price_Clean"]).sort_values("mi").groupby("SKU_ID").Price_Clean.last()
    rep = sku.set_index("SKU_ID").Replaces_SKU.dropna()          # launches have no price history: start from the predecessor's price
    for new, old in rep.items():
        if new not in lastp.index and old in lastp.index:
            lastp.loc[new] = lastp[old]
    rise = F.price_rise_vector(events)
    pf = np.cumprod([1 + (rise[i] / 100 if (i - 0) % 12 == 0 and i >= N_HIST else 0) for i in range(N_HIST, N_HIST + HORIZON)])
    f["Price_Forecast"] = f.SKU_ID.map(lastp).to_numpy() * pf[(f.mi - N_HIST).to_numpy()]
    f["Revenue_P50"] = f.p50 * f.Price_Forecast
    f["Product_Family"] = f.SKU_ID.map(sku.set_index("SKU_ID").Product_Family)
    for c in ("p10", "p50", "p90"):
        f[c] = f[c].clip(lower=0)
    f["Units_Sold_Forecast"] = np.rint(f.p50).astype(int)
    sub = f[["Date", "SKU_ID", "Region", "Units_Sold_Forecast"]]
    # ---- validation of the submission contract -----------------------------------------------
    ss = pd.read_csv(cfg["paths"]["raw"] / "sample_submission.csv")
    assert list(sub.columns) == list(ss.columns), "submission columns differ from sample"
    assert len(sub) == len(test) and sub.Units_Sold_Forecast.ge(0).all() and not sub.isna().any().any()
    assert (sub[["Date", "SKU_ID", "Region"]].to_numpy() == test[["Date", "SKU_ID", "Region"]].to_numpy()).all(), "order/keys differ from test.csv"
    out.mkdir(parents=True, exist_ok=True)
    sub.to_csv(out / "submission.csv", index=False)
    keep = ["Date", "mi", "SKU_ID", "Region", "Product_Family", "Customer_Name", "Sales_Channel", "p10", "p50", "p90", "Units_Sold_Forecast", "Price_Forecast", "Revenue_P50", "rule", "h"]
    f[keep].to_parquet(cfg["paths"]["processed"] / "forecast_full.parquet", index=False)
    json.dump(audit, open(out / "forecast_audit.json", "w"), indent=2, default=str)
    imp = pd.Series(mods["p50"].feature_importances_, X).sort_values(ascending=False)
    imp.to_csv(out / "feature_importance.csv", header=["split_count"])
    tot = f.groupby("Date").p50.sum()
    print(f"submission rows {len(sub)}; total P50 units {f.p50.sum():,.0f}; monthly mean {tot.mean():,.0f}")
    print("history monthly mean last 12m:", f"{np.nanmean(np.nansum(Yt[:, N_HIST - 12:N_HIST], axis=0)):,.0f}")
    return f


if __name__ == "__main__":
    run()
