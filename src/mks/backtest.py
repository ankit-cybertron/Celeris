"""Rolling-origin backtest (19-month horizon) with strict no-leakage: features and targets are built from a
copy of the series matrix truncated after the origin; truth for scoring comes from the untouched matrix."""
from __future__ import annotations
import numpy as np
import pandas as pd
from .config import load_config
from . import data, features as F, models as M
from .data import HORIZON, N_HIST, midx

LEVELS = {"total": [], "family": ["fam"], "region": ["Region"], "family_region": ["fam", "Region"], "channel": ["Sales_Channel"]}


def wape(a, p) -> float:
    a, p = np.asarray(a, float), np.asarray(p, float)
    return float(np.abs(a - p).sum() / max(np.abs(a).sum(), 1e-9))


def bias(a, p) -> float:
    return float(np.sum(p) / max(np.sum(a), 1e-9) - 1)


def model_matrices(cfg):
    """Returns panel, Ymodel (capped, event-masked), Ytruth (uncapped unconstrained), ctx-ingredients."""
    out, raw = cfg["paths"]["processed"], cfg["paths"]["raw"]
    p = pd.read_parquet(out / "panel_demand.parquet")
    keys = pd.read_parquet(out / "series_keys.parquet")
    events, sku = pd.read_csv(raw / "events_calendar.csv"), pd.read_csv(raw / "sku_master.csv")
    macro = data.load_macro(cfg)
    masked = F.mask_event_cells(p, events, cfg["model_exclude_events"])
    p["Dm"] = p.Demand_Model.where(~masked)
    return p, keys, events, sku, macro, data.to_matrix(p, keys, "Dm"), data.to_matrix(p, keys, "Demand_Unconstrained")


def run(cfg=None, fast: bool = False):
    cfg = cfg or load_config()
    p, keys, events, sku, macro, Ym, Yt = model_matrices(cfg)
    outdir = cfg["paths"]["outputs"] / "backtest"
    outdir.mkdir(parents=True, exist_ok=True)
    origins = [midx(x) for x in cfg["model"]["backtest_origins"]]
    step = cfg["model"]["train_origin_step"] * (2 if fast else 1)
    if fast:
        cfg = {**cfg, "model": {**cfg["model"], "n_estimators": 60}}
    allp = []
    for oi, o in enumerate(origins):
        Yo = Ym.copy(); Yo[:, o + 1:] = np.nan                      # truncate: nothing after origin is visible
        ctx = F.Ctx(Yo, keys, macro, events, sku)
        train = F.training_frame(ctx, o, cfg["model"]["train_origin_start"], step)
        X = F.feature_columns(train)
        last = oi == len(origins) - 1
        mods = M.fit_all(train, X, cfg, with_quantiles=last)
        te = F.build(ctx, o, range(1, HORIZON + 1), with_y=False)
        te["y"] = Yt[te.sid.to_numpy(), te.tm.to_numpy()]            # truth from untouched matrix
        te = te[(te.tm < N_HIST) & te.y.notna() & te.m12.notna()].copy()
        pr = M.predict_all(mods, te, X)
        te["lgbm_p50"] = pr.p50
        if last:
            te["lgbm_p10"], te["lgbm_p90"] = pr.p10, pr.p90
        te["snaive"] = M.baseline_seasonal_naive(te)
        te["lvl_season"] = M.baseline_level_x_season(te)
        te["tsb"] = M.tsb_forecast(Yo, o)[te.sid.to_numpy()]
        te["croston_sba"] = M.croston_sba(Yo, o)[te.sid.to_numpy()]
        te["origin"] = o
        allp.append(te)
        print(f"origin {data.mlabel(o)}: rows {len(te)}  WAPE snaive {wape(te.y, te.snaive):.3f}  lvl*seas {wape(te.y, te.lvl_season):.3f}  tsb {wape(te.y, te.tsb):.3f}  croston {wape(te.y, te.croston_sba):.3f}  lgbm {wape(te.y, te.lgbm_p50):.3f}  bias {bias(te.y, te.lgbm_p50):+.3f}")
    bt = pd.concat(allp, ignore_index=True)
    k = keys.set_index("sid")
    for c in ("fam", "Region", "Sales_Channel", "Customer_Name"):
        bt[c] = bt.sid.map(k[c])
    bt.to_parquet(outdir / "predictions.parquet", index=False)
    metrics(bt, outdir)
    return bt


def metrics(bt: pd.DataFrame, outdir) -> None:
    methods = [c for c in ("snaive", "lvl_season", "tsb", "croston_sba", "lgbm_p50") if c in bt]
    rows = []
    for o, g in list(bt.groupby("origin")) + [("all", bt)]:
        for m in methods:
            rows.append({"origin": o if o == "all" else data.mlabel(o), "method": m, "wape": wape(g.y, g[m]), "bias": bias(g.y, g[m]), "n": len(g)})
    pd.DataFrame(rows).to_csv(outdir / "metrics_overall.csv", index=False)
    rows = []
    for dim in ("h", "fam", "Region", "Sales_Channel"):
        for key, g in bt.groupby(dim):
            for m in methods:
                rows.append({"dim": dim, "key": key, "method": m, "wape": wape(g.y, g[m]), "bias": bias(g.y, g[m]), "n": len(g)})
    pd.DataFrame(rows).to_csv(outdir / "metrics_by_dim.csv", index=False)
    last = bt[bt.origin == bt.origin.max()]
    cov = {"p10_below": float((last.y < last.lgbm_p10).mean()), "p90_above": float((last.y > last.lgbm_p90).mean()),
           "p10_p90_coverage": float(((last.y >= last.lgbm_p10) & (last.y <= last.lgbm_p90)).mean())}
    pd.Series(cov).to_csv(outdir / "interval_coverage.csv", header=["value"])
    # empirical aggregate error ratios pooled across all origins -> intervals that hold at each hierarchy level
    rows = []
    hb = pd.cut(bt.h, [0, 6, 12, 19], labels=["h1-6", "h7-12", "h13-19"])
    for lvl, by in LEVELS.items():
        # group by origin to maintain independent period observations
        g = bt.assign(hb=hb).groupby(by + ["origin", "tm", "hb"], observed=True)[["y", "lgbm_p50"]].sum().reset_index()
        g = g[g.lgbm_p50 > 0]
        g["ratio"] = g.y / g.lgbm_p50
        for b, gg in g.groupby("hb", observed=True):
            q10_raw = float(gg.ratio.quantile(.10))
            q50_raw = float(gg.ratio.quantile(.50))
            q90_raw = float(gg.ratio.quantile(.90))
            # compute ratio relative to median without forced clamps
            q10_rel = float(q10_raw / q50_raw) if q50_raw > 0 else 0.85
            q90_rel = float(q90_raw / q50_raw) if q50_raw > 0 else 1.15
            # envelope: widen using larger of pooled and per-origin quantiles
            for orig, go in gg.groupby("origin"):
                q10_o = float(go.ratio.quantile(.10))
                q50_o = float(go.ratio.quantile(.50))
                q90_o = float(go.ratio.quantile(.90))
                if q50_o > 0:
                    q10_rel = min(q10_rel, float(q10_o / q50_o))
                    q90_rel = max(q90_rel, float(q90_o / q50_o))
            w = wape(gg.y, gg.lgbm_p50)
            rows.append({"level": lvl, "h_bucket": b, "q10": q10_rel, "q50": 1.0, "q90": q90_rel, "wape": w, "n": len(gg)})
    pd.DataFrame(rows).to_csv(outdir / "intervals_scale.csv", index=False)
    agg = last.groupby(["fam", "Region", "tm"])[["y", "lgbm_p50"]].sum()
    pd.Series({"fam_region_month_wape": wape(agg.y, agg.lgbm_p50)}).to_csv(outdir / "aggregate_wape.csv", header=["value"])
    compute_crossorigin_coverage(bt, outdir)


def compute_crossorigin_coverage(bt: pd.DataFrame, outdir: Path) -> pd.DataFrame:
    """Out-of-sample empirical coverage across rolling origins to evaluate interval reliability."""
    hb = pd.cut(bt.h, [0, 6, 12, 19], labels=["h1-6", "h7-12", "h13-19"])
    origins = sorted(bt.origin.unique())
    if len(origins) < 2:
        return pd.DataFrame()
    o0, o1 = origins[0], origins[1]
    b0 = bias(bt[bt.origin == o0].y, bt[bt.origin == o0].lgbm_p50)
    b1 = bias(bt[bt.origin == o1].y, bt[bt.origin == o1].lgbm_p50)
    lbl0 = f"Origin {o0} ({b0:+.1%} bias)"
    lbl1 = f"Origin {o1} ({b1:+.1%} bias)"

    rows = []
    for lvl, by in [("total", []), ("family", ["fam"])]:
        g = bt.assign(hb=hb).groupby(by + ["origin", "tm", "hb"], observed=True)[["y", "lgbm_p50"]].sum().reset_index()
        g = g[g.lgbm_p50 > 0]
        g["ratio"] = g.y / g.lgbm_p50
        g0, g1 = g[g.origin == o0], g[g.origin == o1]

        r0 = {}
        for b, gg in g0.groupby("hb", observed=True):
            q10, q50, q90 = float(gg.ratio.quantile(.10)), float(gg.ratio.quantile(.50)), float(gg.ratio.quantile(.90))
            r0[b] = (q10 / q50 if q50 > 0 else 0.85, q90 / q50 if q50 > 0 else 1.15)
        cov1 = [(r0[r["hb"]][0] * r["lgbm_p50"] <= r["y"] <= r0[r["hb"]][1] * r["lgbm_p50"]) for _, r in g1.iterrows()]
        rows.append({"level": lvl, "calibration": lbl0, "evaluation": lbl1, "coverage": round(sum(cov1) / len(cov1), 4),
                     "n_covered": sum(cov1), "n_eval": len(cov1), "n_calib": len(g0)})

        r1 = {}
        for b, gg in g1.groupby("hb", observed=True):
            q10, q50, q90 = float(gg.ratio.quantile(.10)), float(gg.ratio.quantile(.50)), float(gg.ratio.quantile(.90))
            r1[b] = (q10 / q50 if q50 > 0 else 0.85, q90 / q50 if q50 > 0 else 1.15)
        cov0 = [(r1[r["hb"]][0] * r["lgbm_p50"] <= r["y"] <= r1[r["hb"]][1] * r["lgbm_p50"]) for _, r in g0.iterrows()]
        rows.append({"level": lvl, "calibration": lbl1, "evaluation": lbl0, "coverage": round(sum(cov0) / len(cov0), 4),
                     "n_covered": sum(cov0), "n_eval": len(cov0), "n_calib": len(g1)})

        rp = {}
        for b, gg in g.groupby("hb", observed=True):
            q10, q50, q90 = float(gg.ratio.quantile(.10)), float(gg.ratio.quantile(.50)), float(gg.ratio.quantile(.90))
            rp[b] = (q10 / q50 if q50 > 0 else 0.85, q90 / q50 if q50 > 0 else 1.15)
        covp = [(rp[r["hb"]][0] * r["lgbm_p50"] <= r["y"] <= rp[r["hb"]][1] * r["lgbm_p50"]) for _, r in g.iterrows()]
        rows.append({"level": lvl, "calibration": "Pooled (both origins)", "evaluation": "Both origins",
                     "coverage": round(sum(covp) / len(covp), 4), "n_covered": sum(covp), "n_eval": len(covp), "n_calib": len(g)})

    df = pd.DataFrame(rows)
    df.to_csv(outdir / "interval_coverage_crossorigin.csv", index=False)
    return df
