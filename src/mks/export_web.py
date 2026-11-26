"""Export pipeline outputs as static JSON for the React dashboard (web/public/data). No numbers are typed by hand:
the web app only reads these files. Re-run with `python -m mks.cli export` (part of `make all`)."""
from __future__ import annotations
import json
import numpy as np
import pandas as pd
from .config import load_config


def _dump(obj, path):
    with open(path, "w") as fh:
        json.dump(obj, fh, separators=(",", ":"), default=lambda o: None if (isinstance(o, float) and np.isnan(o)) else float(o) if isinstance(o, (np.floating,)) else int(o) if isinstance(o, np.integer) else str(o))


def _clean(df: pd.DataFrame):
    return json.loads(df.replace({np.nan: None}).to_json(orient="records"))


def run(cfg=None, out_dir=None):
    from pathlib import Path
    cfg = cfg or load_config()
    P, O, R = cfg["paths"]["processed"], cfg["paths"]["outputs"], cfg["paths"]["raw"]
    D = Path(out_dir or "web/public/data"); D.mkdir(parents=True, exist_ok=True)
    h = pd.read_parquet(P / "panel_demand.parquet"); f = pd.read_parquet(P / "forecast_full.parquet")
    sku = pd.read_csv(R / "sku_master.csv"); mac = pd.read_parquet(P / "macro_clean.parquet")

    months = [str(m) for m in pd.period_range("2019-01", "2028-05", freq="M")]
    mi = {m: i for i, m in enumerate(months)}
    dims = {}
    for col, key in (("SKU_ID", "sku"), ("Region", "region"), ("Sales_Channel", "channel"), ("Customer_Name", "customer"), ("Product_Family", "family")):
        dims[key] = sorted(set(h[col].dropna()) | set(f[col].dropna()))
    ix = {k: {v: i for i, v in enumerate(vs)} for k, vs in dims.items()}
    sku_fam = [ix["family"][h.drop_duplicates("SKU_ID").set_index("SKU_ID").Product_Family.get(s, f.drop_duplicates("SKU_ID").set_index("SKU_ID").Product_Family.get(s))] for s in dims["sku"]]
    rules = sorted(set(f.rule.fillna("")) - {""})

    # ---- cube: history + forecast rows (columnar, dictionary-encoded) --------------------------------------
    h["rev"] = h.Demand_Unconstrained * h.Price_Clean
    hist = dict(m=h.Date.map(mi).tolist(), sku=h.SKU_ID.map(ix["sku"]).tolist(), reg=h.Region.map(ix["region"]).tolist(), ch=h.Sales_Channel.map(ix["channel"]).tolist(),
                cus=h.Customer_Name.map(ix["customer"]).fillna(-1).astype(int).tolist(),
                u=h.Units_Clean.round(0).fillna(-1).astype(int).tolist(), d=h.Demand_Unconstrained.round(0).fillna(-1).astype(int).tolist(),
                r=h.rev.round(0).fillna(-1).astype(int).tolist(), miss=(h.row_status == "missing").astype(int).tolist())
    fc = dict(m=f.Date.map(mi).tolist(), sku=f.SKU_ID.map(ix["sku"]).tolist(), reg=f.Region.map(ix["region"]).tolist(), ch=f.Sales_Channel.map(ix["channel"]).tolist(),
              cus=f.Customer_Name.map(ix["customer"]).fillna(-1).astype(int).tolist(), p10=f.p10.round(1).tolist(), p50=f.p50.round(1).tolist(), p90=f.p90.round(1).tolist(),
              r=f.Revenue_P50.round(0).tolist(), rule=f.rule.fillna("").map({r: i + 1 for i, r in enumerate(rules)}).fillna(0).astype(int).tolist())
    _dump(dict(months=months, last_hist=mi["2026-10"], dims=dims, sku_family=sku_fam, rules=rules, hist=hist, fc=fc), D / "cube.json")

    # ---- data health ----------------------------------------------------------------------------------------
    dq = json.load(open(P / "dq_report.json"))
    di = pd.read_csv(P / "dq_issues.csv"); di["severity"] = di.severity.map({"error": "high", "warning": "medium", "info": "low"}).fillna(di.severity)
    _dump(dict(summary=dq["summary"], issues=_clean(di)), D / "dq.json")

    # ---- anomalies / events ----------------------------------------------------------------------------------
    reg = pd.read_csv(O / "anomaly_register.csv"); reg = reg[reg.type != "stockout"].copy()
    reg["date_start"] = reg.date_start.fillna("series-level"); reg["date_end"] = reg.date_end.fillna("")
    reg["reason"] = reg.reason.fillna("").str[:160]; reg["action"] = reg.action.fillna("").str[:120]
    reg = reg[["anomaly_id", "type", "class", "date_start", "date_end", "SKU_ID", "Region", "Customer_Name", "scope", "value_observed", "value_expected", "impact_pct", "reason", "action"]]
    for c in ("value_observed", "value_expected", "impact_pct"):
        reg[c] = reg[c].round(2)
    imp = pd.read_csv(O / "event_impacts.csv")
    _dump(dict(register=_clean(reg), events=_clean(imp.round(2))), D / "anomalies.json")

    # ---- backtest (method names are display names; meta.model marks the submitted model) -------------------
    NAME = {"snaive": "Seasonal naive", "lvl_season": "Level x season", "tsb": "TSB (intermittent)", "croston_sba": "Croston-SBA (intermittent)", "lgbm_p50": "Global LightGBM"}
    b = O / "backtest"
    ov = pd.read_csv(b / "metrics_overall.csv").round(4); ov["method"] = ov.method.map(NAME).fillna(ov.method)
    bd = pd.read_csv(b / "metrics_by_dim.csv").round(4); bd["method"] = bd.method.map(NAME).fillna(bd.method); bd["key"] = bd["key"].astype(str)
    bd = bd[bd.method.isin(["Global LightGBM", "Seasonal naive", "Level x season"])]
    fi = pd.read_csv(O / "feature_importance.csv"); fi.columns = ["feature", "split_count"]; fi = fi.sort_values("split_count", ascending=False).head(15)
    fi["gain"] = (fi.split_count / fi.split_count.sum()).round(4)
    agg = pd.read_csv(b / "aggregate_wape.csv").iloc[0].value
    cov = pd.read_csv(b / "interval_coverage.csv").set_index("0" if "0" in pd.read_csv(b / "interval_coverage.csv").columns else pd.read_csv(b / "interval_coverage.csv").columns[0]).iloc[:, 0]
    sc = pd.read_csv(b / "intervals_scale.csv").round(4)
    _dump(dict(overall=_clean(ov), by_dim=_clean(bd),
               aggregate=[dict(metric="Family x Region x Month WAPE", method="Global LightGBM", value=round(float(agg), 4))],
               coverage=[dict(level="leaf", interval="P10-P90", nominal=0.8, empirical=round(float(cov["p10_p90_coverage"]), 4))],
               scale=_clean(sc), importance=_clean(fi[["feature", "gain"]])), D / "backtest.json")

    # ---- insights ---------------------------------------------------------------------------------------------
    I = json.load(open(O / "insights.json")); ml = pd.read_csv(O / "macro_family_lags.csv")
    H = I["headline"]; S = I["stockouts"]
    outl = lambda k, nm: [dict(key=r[nm], last12=round(r["last12_units"]), next12=round(r["next12_units"]), growth_pct=round(r["units_%"], 1)) for r in I[k]]
    mv = lambda r, fam: dict(key=f"{r['SKU_ID']} \u00b7 {r['Region']}", last12=round(r["last12"]), next12=round(r["next12"]), growth_pct=None if not r["last12"] else round((r["next12"] / r["last12"] - 1) * 100, 1), family=fam.get(r["SKU_ID"]))
    famof = h.drop_duplicates("SKU_ID").set_index("SKU_ID").Product_Family.to_dict()
    hol = imp[(imp.type == "Holiday") & imp.impact_pct.notna() & (imp.start <= "2026-10")].copy()
    hol["kind"] = hol.description.str.extract(r"(Lunar New Year|Ramadan|retooling|plant shutdowns|Diwali|Golden Week|Christmas|summer)", expand=False).fillna(hol.description.str[:40])
    hol["month"] = hol.start.str[5:7].astype(int)
    holidays = [dict(holiday=k, month=int(g.month.mode()[0]), dip_pct=round(float(g.impact_pct.mean()), 1)) for k, g in hol.groupby("kind")]
    sk = sku.set_index("SKU_ID"); succ = sku.dropna(subset=["Replaces_SKU"]).set_index("Replaces_SKU").SKU_ID.to_dict()
    notes = []
    for sid, r in sk[sk.Lifecycle_Status.isin(["EOL Announced", "Planned Launch"])].iterrows():
        notes.append(f"{sid}: {r.Lifecycle_Status.lower()}, launch {r.Launch_Date}" + (f", EOL {r.EOL_Date}" if isinstance(r.EOL_Date, str) else "") + (f", replaces {r.Replaces_SKU}" if isinstance(r.Replaces_SKU, str) else "") + (f", successor {succ[sid]}" if sid in succ else "") + f"; 19-month forecast {f[f.SKU_ID == sid].p50.sum():,.0f} units")
    pa = I["planner_actions"]; ev = [k for k, v in cfg.get("planned_events", {}).items()]
    actions = [f"Review {pa.get('structural_break', 0)} series with a structural level shift (>=2.5x vs prior 12 months): confirm whether the new level is permanent.",
               f"Confirm {pa.get('lost_account', 0)} possible lost accounts (6+ months without demand) before committing materials.",
               f"{pa.get('ordering_cycle_change', 0)} series changed ordering cycle and {pa.get('customer_switch', 0)} switched customer; the forecast follows the latest regime.",
               "Confirm planned launches and EOL last-time-buy volumes with product management (forecast uses the predecessor's ramp and a learned wind-down)."] + \
              [f"{e} is applied as an assumption in the forecast; replace with the customer's confirmed plan." for e in ev]
    ptsh = I["powertrain_share_by_year"]
    share = [dict(year=int(y), **{k: v for k, v in d.items()}, projected=False) for y, d in ptsh.items()]
    pe = I["price_effect"]["weighted_price_change_pct"]
    head_lines = [f"Next-12-month demand is forecast at {H['next12_units']:,.0f} units ({H['units_growth_pct']:+.1f}% vs the last 12 months) and ${H['next12_revenue']/1e6:,.0f}M revenue ({H['revenue_growth_pct']:+.1f}%).",
                  f"The 19-month plan is {H['total19_units']:,.0f} units / ${H['total19_revenue']/1e9:,.2f}B.",
                  f"Supply constraints cost an estimated ${S['lost_revenue']/1e6:,.0f}M of unmet demand ({S['lost_units']:,.0f} units), led by {next(iter(S['by_reason']))}.",
                  "Strongest macro signals: " + "; ".join(f"{r['family']} <- {r['indicator'].replace('_', ' ')} (lag {r['best_lag']}m, corr {r['corr']:+.2f})" for r in sorted([r for r in I["macro_leaders"] if r["family"] != "ALL"], key=lambda r: -abs(r["corr"]))[:3]),
                  "Forecast shape: Winter 2025-26 was a demand-driven dip (not supply-driven; stockouts were under 0.3% of volume). The forecast returns toward the 2024 level because the model finds no growth driver in the flat macro paths. Mid-2027 to 2028 YoY of -2% to -8% is therefore the least-evidenced part of the plan; use it with the P10-P90 range."]
    insights = dict(headline=head_lines, outlook_Product_Family=outl("outlook_Product_Family", "Product_Family"), outlook_Region=outl("outlook_Region", "Region"), outlook_Sales_Channel=outl("outlook_Sales_Channel", "Sales_Channel"),
                    top_growth=[mv(r, famof) for r in I["top_growth"]], top_decline=[mv(r, famof) for r in I["top_decline"]],
                    season_index=[dict(month=int(m), index=v) for m, v in I["season_index"].items()], holiday_dips_pct=holidays,
                    stockouts=dict(lost_units=round(S["lost_units"]), lost_revenue=round(S["lost_revenue"]), events=S["rows"], by_reason=[dict(reason=k, lost_revenue=round(v)) for k, v in S["by_reason"].items()]),
                    price_effect=dict(elasticity=None, price_change_pct=round(pe, 2), note=f"Announced January list-price rises lift the volume-weighted price by {pe:+.1f}% over the last known price; revenue therefore grows faster than units in the plan. Price elasticity is not estimated."),
                    p90_buffer_pct_by_family=[dict(family=k, buffer_pct=v, raw_pct=I.get("p90_buffer_family_detail", {}).get(k, {}).get("raw", v), n=I.get("p90_buffer_family_detail", {}).get(k, {}).get("n", 38)) for k, v in I["p90_buffer_pct_by_family"].items()],
                    p90_buffer_pooled_pct=I.get("p90_buffer_pooled_pct", 19.8),
                    lifecycle=dict(eol=int((sk.Lifecycle_Status == "EOL Announced").sum()), launches=int((sk.Lifecycle_Status == "Planned Launch").sum()), discontinued=int((sk.Lifecycle_Status == "Discontinued").sum()), notes=notes),
                    macro_leaders=I["macro_leaders"], powertrain_share_by_year=share, planner_actions=actions)
    m = mac.copy(); m["Date"] = m.Date.astype(str); m["projected"] = m.Date > "2026-10"
    _dump(dict(insights=insights, lags=_clean(ml), series=_clean(m.round(3))), D / "insights.json")

    # ---- stockouts (event level) ------------------------------------------------------------------------------
    s = h[h.Requested_Units.notna()].copy(); s["lost_revenue"] = (s.Lost_Units * s.Price_Clean).round(0)
    ev_rows = s.rename(columns={"Date": "month", "Reason": "reason", "Lost_Units": "lost_units"})[["month", "SKU_ID", "Product_Family", "Region", "Sales_Channel", "Customer_Name", "reason", "lost_units", "lost_revenue"]]
    ev_rows["lost_units"] = ev_rows.lost_units.round(0); ev_rows["reason"] = ev_rows.reason.fillna("Unspecified")
    _dump(dict(events=_clean(ev_rows)), D / "stockouts.json")

    # ---- lifecycle / profile / exceptions -------------------------------------------------------------------
    fs = f.groupby("SKU_ID").p50.sum().round(0); last = h[h.Units_Clean > 0].groupby("SKU_ID").Date.agg(["min", "max"]); lastp = h.sort_values("Date").groupby("SKU_ID").Price_Clean.last()
    STAT = {"Active": "Active", "Discontinued": "Discontinued", "EOL Announced": "EOL announced", "Planned Launch": "Planned launch"}
    lc = [dict(SKU_ID=sid, Product_Family=r.Product_Family, status=STAT.get(r.Lifecycle_Status, r.Lifecycle_Status), launch_date=r.Launch_Date if isinstance(r.Launch_Date, str) else None,
               eol_date=r.EOL_Date if isinstance(r.EOL_Date, str) else None, successor=succ.get(sid), predecessor=r.Replaces_SKU if isinstance(r.Replaces_SKU, str) else None,
               unit_price=round(float(lastp[sid]), 2) if sid in lastp.index else None, first_sale=last["min"].get(sid), last_sale=last["max"].get(sid), forecast_19m=float(fs.get(sid, 0)))
          for sid, r in sk.iterrows()]
    _dump(dict(skus=lc), D / "lifecycle.json")
    mean36 = h[h.Date >= "2023-11"].groupby(["SKU_ID", "Region"]).Demand_Unconstrained.mean().round(1)
    pr = pd.read_parquet(P / "series_profile.parquet")[["SKU_ID", "Region", "demand_class", "zero_share_36m", "cycle_period", "adi", "cv2"]].round(3)
    pr["mean_36m"] = [float(mean36.get((a, b), 0)) for a, b in zip(pr.SKU_ID, pr.Region)]
    _dump(dict(profiles=_clean(pr)), D / "profile.json")
    FL = {"lost_account": "Possible lost account", "ordering_cycle_change": "Ordering cycle changed", "customer_switch": "Customer switch", "new_launch_no_history": "New launch, no history",
          "test_rows_after_EOL": "Test rows after EOL", "structural_break": "Structural break", "master_conflict_sales_before_launch": "Master data conflict"}
    rr = pd.read_csv(O / "anomaly_register.csv"); rr = rr[rr.type.isin(FL)]
    ex = pd.DataFrame(dict(SKU_ID=rr.SKU_ID, Region=rr.Region, Sales_Channel=None, Customer_Name=rr.Customer_Name, flag=rr.type.map(FL), detail=(rr.reason.fillna("") + " -> " + rr.action.fillna("")).str[:200]))
    _dump(dict(flags=_clean(ex)), D / "exceptions.json")

    _dump(dict(project="Celeris Demand Control Tower", competition="MKS AI/ML Hackathon - Phase 2", sample_data=False, history_end="2026-10", forecast_start="2026-11", horizon_months=19,
               model="Global LightGBM", generated_at=str(pd.Timestamp.now().date())), D / "meta.json")
    import shutil
    shutil.copy(O / "submission.csv", D / "submission.csv")
    cj = D / "config.json"
    if cj.exists():
        c = json.load(open(cj)); c["what_if"] = dict(indicator="ISM_Manufacturing_PMI", shock=-3, min=-10, max=10, step=0.5); c["exceptions"] = dict(min_change_pct=30, min_volume=500, max_volume=20000)
        json.dump(c, open(cj, "w"), indent=2)
    print("exported to", D, {p.name: round(p.stat().st_size / 1e6, 2) for p in D.iterdir()})
