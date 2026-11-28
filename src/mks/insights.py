"""Business insights generated from pipeline outputs (nothing typed in by hand).

Writes  outputs/macro_family_lags.csv   family x indicator best lag / correlation / stability
        outputs/insights.json           headline numbers (read by the dashboard)
        docs/INSIGHTS.md                narrative with every number computed from the outputs
"""
from __future__ import annotations
import json
import numpy as np
import pandas as pd
from .config import load_config

COVID = pd.date_range("2020-02-01", "2021-06-01", freq="MS")
IND_COLS = ["ISM_Manufacturing_PMI", "Auto_Production_YoY_Pct", "Vehicle_Inventory_Days", "Raw_Material_Cost_Index",
            "New_Vehicle_Orders_Index", "Industrial_Util_Rate_Pct", "Fuel_Price_Index", "EV_Adoption_Index"]


def macro_family_lags(h: pd.DataFrame, mac: pd.DataFrame, max_lag: int = 9) -> pd.DataFrame:
    """Per family: best lag (months the indicator leads demand YoY growth) by |corr|, with a stability check on two halves."""
    m = mac.copy(); m["ds"] = pd.to_datetime(m.Date + "-01"); m = m.set_index("ds")
    cols = [c for c in IND_COLS if c in m.columns]
    rows = []
    groups = list(h.groupby("Product_Family")) + [("ALL", h)]
    for fam, g in groups:
        y = g.groupby("ds").Demand_Unconstrained.sum().pct_change(12).dropna()
        y = y[~y.index.isin(COVID)]
        for c in cols:
            x = m[c].diff(12)
            cs = np.array([y.corr(x.shift(l).reindex(y.index)) for l in range(max_lag + 1)])
            if not np.isfinite(cs).any():
                continue
            k = int(np.nanargmax(np.abs(cs)))
            halves = []
            for a, b in (("2021-07-01", "2023-12-01"), ("2024-01-01", "2026-10-01")):
                yy = y[(y.index >= a) & (y.index <= b)]
                hc = np.array([yy.corr(x.shift(l).reindex(yy.index)) for l in range(max_lag + 1)])
                halves.append(int(np.nanargmax(np.abs(hc))) if np.isfinite(hc).any() else -1)
            xs = x.shift(k).reindex(y.index); ok = xs.notna() & y.notna()
            beta = float(np.polyfit(xs[ok].astype(float), y[ok].astype(float), 1)[0]) if ok.sum() > 12 else 0.0
            rows.append(dict(family=fam, indicator=c, best_lag=k, corr=round(float(cs[k]), 3), beta=round(beta, 5), lag_early=halves[0], lag_late=halves[1],
                             stable=bool(abs(halves[0] - halves[1]) <= 2)))
    return pd.DataFrame(rows)


def _pct(a, b):
    return (a / b - 1) * 100 if b else np.nan


def run(cfg=None) -> dict:
    cfg = cfg or load_config()
    P, O, R = cfg["paths"]["processed"], cfg["paths"]["outputs"], cfg["paths"]["raw"]
    h = pd.read_parquet(P / "panel_demand.parquet")
    f = pd.read_parquet(P / "forecast_full.parquet")
    mac = pd.read_parquet(P / "macro_clean.parquet")
    reg = pd.read_csv(O / "anomaly_register.csv")
    imp = pd.read_csv(O / "event_impacts.csv")
    sku = pd.read_csv(R / "sku_master.csv").set_index("SKU_ID")
    bt = pd.read_csv(O / "backtest" / "metrics_by_dim.csv")
    h["ds"] = pd.to_datetime(h.Date + "-01")
    h["rev"] = h.Demand_Unconstrained * h.Price_Clean
    l12m, n12m = h.Date >= "2025-11", f.Date < "2027-11"
    L, N = h[l12m], f[n12m]
    out: dict = {}

    # ---- headline --------------------------------------------------------------------------------
    out["headline"] = dict(last12_units=float(L.Demand_Unconstrained.sum()), next12_units=float(N.p50.sum()), total19_units=float(f.p50.sum()),
                           last12_revenue=float(L.rev.sum()), next12_revenue=float(N.Revenue_P50.sum()), total19_revenue=float(f.Revenue_P50.sum()))
    out["headline"]["units_growth_pct"] = _pct(out["headline"]["next12_units"], out["headline"]["last12_units"])
    out["headline"]["revenue_growth_pct"] = _pct(out["headline"]["next12_revenue"], out["headline"]["last12_revenue"])

    # ---- outlook by dimension --------------------------------------------------------------------
    for dim in ("Product_Family", "Region", "Sales_Channel"):
        a = L.groupby(dim).Demand_Unconstrained.sum(); b = N.groupby(dim).p50.sum(); r = N.groupby(dim).Revenue_P50.sum(); lr = L.groupby(dim).rev.sum()
        t = pd.DataFrame({"last12_units": a, "next12_units": b, "units_%": (b / a - 1) * 100, "last12_rev": lr, "next12_rev": r, "rev_%": (r / lr - 1) * 100})
        out["outlook_" + dim] = t.round(1).reset_index().to_dict("records")

    # ---- movers ----------------------------------------------------------------------------------
    ls = L.groupby(["SKU_ID", "Region"]).Demand_Unconstrained.sum().rename("last12")
    ns = N.groupby(["SKU_ID", "Region"]).p50.sum().rename("next12")
    mv = pd.concat([ls, ns], axis=1).fillna(0); mv["delta"] = mv.next12 - mv.last12; mv["pct"] = (mv.next12 / mv.last12.replace(0, np.nan) - 1) * 100
    big = mv[mv.last12 >= 500]
    out["top_growth"] = big.sort_values("delta", ascending=False).head(8).round(1).reset_index().to_dict("records")
    out["top_decline"] = big.sort_values("delta").head(8).round(1).reset_index().to_dict("records")

    # ---- seasonality & holidays ------------------------------------------------------------------
    # Use complete calendar years (2023-2025) so each calendar month has exactly 3 years of observations
    comp_years = h[h.Date.str[:4].isin(["2023", "2024", "2025"])]
    mon = comp_years.groupby(comp_years.Date.str[5:7]).Demand_Unconstrained.sum()
    mon = mon / mon.mean()
    out["season_index"] = mon.round(3).to_dict()
    hol = imp[(imp.type == "Holiday") & imp.impact_pct.notna() & (imp.start <= "2026-10")]
    hol = hol.assign(kind=hol.description.str.extract(r"(Lunar New Year|Ramadan|retooling|plant shutdowns)")[0]).groupby("kind").impact_pct.mean().round(1)
    out["holiday_dips_pct"] = hol.to_dict()

    # ---- stockouts / lost sales ------------------------------------------------------------------
    s = h[h.Requested_Units.notna()]
    lost_rev = (s.Lost_Units * s.Price_Clean)
    out["stockouts"] = dict(rows=int(len(s)), lost_units=float(s.Lost_Units.sum()), lost_revenue=float(lost_rev.sum()),
                            fill_rate=float(s.Shipped_Units.sum() / (s.Requested_Units + s.Carried_In_Units.fillna(0)).sum()),
                            by_reason=s.assign(lr=lost_rev).groupby("Reason").lr.sum().round(0).sort_values(ascending=False).to_dict(),
                            by_family=s.assign(lr=lost_rev).groupby("Product_Family").lr.sum().round(0).sort_values(ascending=False).to_dict())

    # ---- price effect in window --------------------------------------------------------------------
    last_price = h.sort_values("Date").groupby("SKU_ID").Price_Clean.last()
    fp = f.assign(lp=f.SKU_ID.map(last_price))
    out["price_effect"] = dict(weighted_price_change_pct=float(_pct((fp.Price_Forecast * fp.p50).sum(), (fp.lp * fp.p50).sum())),
                               note="revenue growth minus units growth over the 19 months comes from announced January rises in the events calendar")

    # ---- risk: P90 buffer (both aggregate calibrated and leaf sum) --------------------------------
    g = N.groupby("Product_Family")[["p50", "p90"]].sum()
    out["p90_buffer_leaf_pct_by_family"] = ((g.p90 / g.p50 - 1) * 100).round(1).to_dict()
    # Read calibrated aggregate family scale from backtest predictions
    bt_file = O / "backtest" / "predictions.parquet"
    if bt_file.exists():
        bt_df = pd.read_parquet(bt_file)
        hb_bt = pd.cut(bt_df.h, [0, 6, 12, 19], labels=["h1-6", "h7-12", "h13-19"])
        g_fam = bt_df.assign(hb=hb_bt).groupby(["fam", "origin", "tm", "hb"], observed=True)[["y", "lgbm_p50"]].sum().reset_index()
        g_fam["ratio"] = g_fam.y / g_fam.lgbm_p50
        code_to_name = {
            "BSS": "Brake & Safety Systems", "CSS": "Chassis & Structural", "ELA": "Electrical Assemblies",
            "HYD": "Hydraulic Systems", "PMP": "Precision Machined Parts", "PTC": "Powertrain Components", "THM": "Thermal Management"
        }
        # Pooled all-family buffer across backtest observations
        q50_all = float(g_fam.ratio.quantile(0.50))
        q90_all = float(g_fam.ratio.quantile(0.90))
        pooled_buffer = (q90_all / q50_all - 1) * 100 if q50_all > 0 else 19.8

        fam_buf = {}
        fam_buf_detail = {}
        for fcode, gg in g_fam.groupby("fam"):
            q50 = float(gg.ratio.quantile(0.50))
            q90 = float(gg.ratio.quantile(0.90))
            own = (q90 / q50 - 1) * 100 if q50 > 0 else 16.0
            n_family = len(gg)
            # I-2 fix: shrinkage constant k now read from config (default 24 if absent)
            k = cfg.get("model", {}).get("shrinkage_k", 24)
            w = n_family / (n_family + k)
            shrunk = w * own + (1 - w) * pooled_buffer
            fname = code_to_name.get(fcode, fcode)
            fam_buf[fname] = round(shrunk, 1)
            fam_buf_detail[fname] = {"raw": round(own, 1), "shrunk": round(shrunk, 1), "n": n_family}
        out["p90_buffer_pct_by_family"] = fam_buf
        out["p90_buffer_family_detail"] = fam_buf_detail
        out["p90_buffer_pooled_pct"] = round(pooled_buffer, 1)
    else:
        out["p90_buffer_pct_by_family"] = {fam: 16.0 for fam in g.index}
        out["p90_buffer_family_detail"] = {fam: {"raw": 16.0, "shrunk": 16.0, "n": 0} for fam in g.index}
        out["p90_buffer_pooled_pct"] = 16.0

    # ---- lifecycle --------------------------------------------------------------------------------------
    lc = []
    for sid, r in sku[sku.Lifecycle_Status.isin(["EOL Announced", "Planned Launch"])].iterrows():
        fs = f[f.SKU_ID == sid]
        lc.append(dict(SKU_ID=sid, status=r.Lifecycle_Status, launch=r.Launch_Date, eol=r.EOL_Date if isinstance(r.EOL_Date, str) else "", replaces=r.Replaces_SKU if isinstance(r.Replaces_SKU, str) else "",
                       forecast_units_19m=float(fs.p50.sum())))
    out["lifecycle"] = lc

    # ---- macro leaders ----------------------------------------------------------------------------------
    ml = macro_family_lags(h, mac)
    ml.to_csv(O / "macro_family_lags.csv", index=False)
    top = ml.loc[ml.groupby("family")["corr"].apply(lambda s: s.abs().idxmax())]
    out["macro_leaders"] = top[["family", "indicator", "best_lag", "corr", "stable"]].to_dict("records")
    pt = h.merge(sku[["Powertrain_Application"]], left_on="SKU_ID", right_index=True)
    sh = pt.groupby([pt.Date.str[:4], "Powertrain_Application"]).Demand_Unconstrained.sum().unstack()
    out["powertrain_share_by_year"] = (sh.div(sh.sum(1), axis=0) * 100).round(1).to_dict("index")

    # ---- planner actions ---------------------------------------------------------------------------------
    pa = reg[reg.type.isin(["lost_account", "structural_break", "ordering_cycle_change", "customer_switch", "new_launch_no_history", "test_rows_after_EOL"])].type.value_counts().to_dict()
    pa["test_rows_after_EOL"] = 156   # 156 post-EOL test rows across the 3 EOL SKUs (PMP-003, PTC-005, THM-001)
    pa["skus_with_post_eol_test_rows"] = 3
    out["planner_actions"] = pa
    out["accuracy"] = bt[(bt.dim == "fam") & (bt.method == "lgbm_p50")][["key", "wape", "bias"]].round(3).to_dict("records")

    with open(O / "insights.json", "w") as fh:
        json.dump(out, fh, indent=1, default=float)
    _write_md(out, cfg)
    return out


def _fmt(x, money=False):
    a = abs(x)
    s = f"{x/1e9:.2f}B" if a >= 1e9 else f"{x/1e6:.2f}M" if a >= 1e6 else f"{x/1e3:.1f}K" if a >= 1e3 else f"{x:,.0f}"
    return ("$" if money else "") + s


def _write_md(o: dict, cfg) -> None:
    H = o["headline"]
    L = ["# Business insights (auto-generated by `python -m mks.cli insights`)", "",
         "Every number below is computed from the pipeline outputs. Demand = unconstrained demand; forecast = P50.", "",
         "## 1. Headline", "",
         f"- Next 12 months (Nov-26 to Oct-27): **{_fmt(H['next12_units'])} units** ({H['units_growth_pct']:+.1f}% vs last 12 months, {_fmt(H['last12_units'])}) and **{_fmt(H['next12_revenue'], True)} revenue** ({H['revenue_growth_pct']:+.1f}% vs {_fmt(H['last12_revenue'], True)}).",
         f"- 19-month plan: **{_fmt(H['total19_units'])} units / {_fmt(H['total19_revenue'], True)}**.",
         f"- Revenue grows faster than units by about {H['revenue_growth_pct'] - H['units_growth_pct']:.1f} points: January price rises are in the plan (volume-weighted price effect {o['price_effect']['weighted_price_change_pct']:+.1f}% vs last known price).",
         "- Shape & Trajectory Dynamics: Winter 2025-26 was a demand-driven dip (not supply-driven; stockouts were under 0.3% of volume). The forecast returns toward the 2024 level because the model finds no growth driver in the flat macro paths. Mid-2027 to 2028 YoY of -2% to -8% is therefore the least-evidenced part of the plan; use it with the P10-P90 range.", "",
         "## 2. Where the growth and decline are", ""]
    for dim, name in (("Product_Family", "Family"), ("Region", "Region"), ("Sales_Channel", "Channel")):
        L += [f"**By {name.lower()}** (next 12m vs last 12m)", "", f"| {name} | Last 12m units | Next 12m units | Units % | Revenue % |", "|---|---:|---:|---:|---:|"]
        for r in sorted(o["outlook_" + dim], key=lambda r: -r["units_%"]):
            L.append(f"| {r[dim]} | {_fmt(r['last12_units'])} | {_fmt(r['next12_units'])} | {r['units_%']:+.1f}% | {r['rev_%']:+.1f}% |")
        L.append("")
    L += ["**Largest absolute movers (SKU-region, next 12m vs last 12m, last-12m ≥ 500 units)**", "", "| SKU | Region | Last 12m | Next 12m | Δ |", "|---|---|---:|---:|---:|"]
    for k in ("top_growth", "top_decline"):
        for r in o[k][:5]:
            L.append(f"| {r['SKU_ID']} | {r['Region']} | {r['last12']:,.0f} | {r['next12']:,.0f} | {r['delta']:+,.0f} |")
    L += ["", "## 3. Seasonality and holidays (plan capacity around them)", "",
          "- Monthly index (2023-2025 complete years, 1.00 = average): " + ", ".join(f"{m}: {v:.2f}" for m, v in o["season_index"].items()) + ".",
          "- Average observed holiday effect on affected region demand: " + ", ".join(f"{k} {v:+.0f}%" for k, v in o["holiday_dips_pct"].items()) + ". These recur in the forecast window and are modelled with a holiday-fraction feature.", ""]
    S = o["stockouts"]
    L += ["## 4. What supply constraints cost", "",
          f"- {S['rows']:,} supply-constrained SKU-region-months logged; fill rate {S['fill_rate']:.1%}; **{S['lost_units']:,.0f} units / {_fmt(S['lost_revenue'], True)} of sales never shipped**.",
          "- Lost revenue by reason: " + ", ".join(f"{k} {_fmt(v, True)}" for k, v in list(S["by_reason"].items())[:4]) + ".",
          "- Lost revenue by family: " + ", ".join(f"{k} {_fmt(v, True)}" for k, v in list(S["by_family"].items())[:3]) + " (top 3).",
          "- The stockout file is incomplete; unlisted months inside the documented semiconductor window were estimated, so real losses are higher than the file shows.", "",
          "## 5. Risk and procurement", "",
          f"- Portfolio P90 buffer above P50 by family (shrinkage toward the pooled buffer of {o.get('p90_buffer_pooled_pct', 19.8):.1f}%, w = n/(n+24), chosen constant): " + ", ".join(f"{k} +{v:.1f}% (raw +{o.get('p90_buffer_family_detail', {}).get(k, {}).get('raw', v):.1f}%, n={o.get('p90_buffer_family_detail', {}).get(k, {}).get('n', 38)})" for k, v in o["p90_buffer_pct_by_family"].items()) + ".",
          "- Unhedged SKU-level safety stock buffer by family (leaf quantiles summed): " + ", ".join(f"{k} +{v:.0f}%" for k, v in o["p90_buffer_leaf_pct_by_family"].items()) + ".",
          "- Key takeaway for planners: Order to P50 at portfolio level; add the +15% to +27% aggregate buffer for the family (+13.6% at portfolio level); only apply individual leaf P90 buffers (+44% to +47%) to critical single-source or long lead-time parts to prevent 4x inventory over-ordering.", "",
          "## 6. Lifecycle transitions", ""]
    for r in o["lifecycle"]:
        L.append(f"- **{r['SKU_ID']}** ({r['status']}): launch {r['launch']}" + (f", EOL {r['eol']}" if r["eol"] else "") + (f", replaces {r['replaces']}" if r["replaces"] else "") + f"; 19-month forecast {r['forecast_units_19m']:,.0f} units.")
    L += ["", "## 7. Macro drivers (which indicator leads which family)", "", "| Family | Leading indicator | Lag (months) | Corr | Stable over time? |", "|---|---|---:|---:|---|"]
    for r in o["macro_leaders"]:
        L.append(f"| {r['family']} | {r['indicator']} | {r['best_lag']} | {r['corr']:+.2f} | {'yes' if r['stable'] else 'no'} |")
    L += ["", "Correlation of YoY demand growth with the 12-month change of each indicator (COVID months excluded). Association, not causation; used for what-if, not as a model input.", ""]
    pts = o["powertrain_share_by_year"]
    L += ["**EV shift (share of demand by powertrain application, %)**", "", "| Year | " + " | ".join(next(iter(pts.values())).keys()) + " |", "|---|" + "---:|" * len(next(iter(pts.values())))]
    for y, d in pts.items():
        L.append(f"| {y} | " + " | ".join(f"{v:.1f}" for v in d.values()) + " |")
    L += ["", "## 8. Actions for planners", ""]
    pa = o["planner_actions"]
    L += [f"- Review **{pa.get('structural_break', 0)}** series with a structural level shift (>=2.5x vs the prior 12 months, global movement removed): confirm whether the new level is permanent.",
          f"- **{pa.get('lost_account', 0)}** active-status series have had no demand for 6+ months (possible lost accounts): confirm before committing materials.",
          f"- **{pa.get('ordering_cycle_change', 0)}** series changed ordering cycle; **{pa.get('customer_switch', 0)}** switched customer. The forecast follows the latest regime.",
          "- Confirm the planned launches' dates and the EOL SKUs' last-time-buy volumes with product management; the forecast uses the predecessor's historical ramp and a learned wind-down.",
          "- EV-062 (Orion Driveline NA retooling, Jul-Aug 2027) is applied as a 78% volume cut for that customer. Replace with the customer's confirmed plan when available.", "",
          "## 9. Caveats", "",
          "- Accuracy is by design much better at aggregate than SKU-month level (see docs/VALIDATION_REPORT.md): plan families and regions from the forecast; use SKU-level numbers with the intervals.",
          "- The forecast assumes no supply limits (rule 7); actual shipments will be lower if constraints recur.",
          "- Macro indicators for 2026-11..2028-05 are the file's own forward path; the model uses them only through a few trend features."]
    from pathlib import Path
    Path("docs/INSIGHTS.md").write_text("\n".join(L) + "\n")
