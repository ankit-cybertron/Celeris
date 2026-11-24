"""One-command cleaning pipeline: raw CSVs -> clean panel + DQ report.   Run: python -m mks.cli clean"""
from __future__ import annotations
import json
import numpy as np
import pandas as pd
from ..config import load_config, ensure_dirs
from . import dates, labels, units, macro
from .dq import DQLog

MONTH0 = pd.Period("2019-01", "M")


def month_index(p: pd.Series) -> pd.Series:
    return p.map(lambda x: x.ordinal - MONTH0.ordinal)


def load_raw(raw) -> dict[str, pd.DataFrame]:
    return {
        "train": pd.read_csv(raw / "train.csv", dtype=str),
        "test": pd.read_csv(raw / "test.csv"),
        "sku": pd.read_csv(raw / "sku_master.csv"),
        "events": pd.read_csv(raw / "events_calendar.csv"),
        "stock": pd.read_csv(raw / "inventory_stockouts.csv"),
        "macro": pd.read_csv(raw / "macro_indicators.csv"),
    }


def clean_all(cfg: dict | None = None) -> dict:
    cfg = cfg or load_config()
    ensure_dirs(cfg)
    dq = DQLog()
    raw = load_raw(cfg["paths"]["raw"])
    t, sku, stock = raw["train"], raw["sku"], raw["stock"]
    n_raw = len(t)
    hist_end = cfg["history_end"]
    raw_units = units.to_number(t.Units_Sold)
    stats_before = {"rows": n_raw, "duplicate_record_ids": int(t.Record_ID.duplicated().sum()), "distinct_region_labels": int(t.Region.nunique(dropna=True)),
              "distinct_channel_labels": int(t.Sales_Channel.nunique()), "distinct_customer_labels": int(t.Customer_Name.nunique()),
              "distinct_sku_labels": int(t.SKU_ID.nunique()), "distinct_date_strings": int(t.Date.nunique()), "missing_region": int(t.Region.isna().sum()),
              "missing_family": int(t.Product_Family.isna().sum()), "missing_or_nonnumeric_units": int(raw_units.isna().sum()),
              "negative_units": int((raw_units < 0).sum()), "units_sum": float(raw_units.sum()), "units_max": float(raw_units.max())}

    # ---- dates ---------------------------------------------------------------------------------
    fmt_nonstd = ~t.Date.str.match(r"^\d{4}-\d{2}$")
    dq.add("train.csv", "non-standard date format", fmt_nonstd.sum(), "parsed to YYYY-MM", severity="warning")
    per = dates.parse_month_series(t.Date)
    t["Date"], bad = dates.repair_out_of_range(per, t.Load_Timestamp, "2019-01", hist_end)
    dq.add("train.csv", "date outside history (e.g. year 2062)", bad.sum(), "Date = Load_Timestamp month - 1")
    ym_bad = (pd.to_numeric(t.Year, errors="coerce") != t.Date.map(lambda p: p.year)) | (pd.to_numeric(t.Month, errors="coerce") != t.Date.map(lambda p: p.month))
    dq.add("train.csv", "Year/Month disagree with Date", (ym_bad & ~bad).sum(), "trusted Date (rule 1); Year/Month dropped")

    # ---- keys & labels -------------------------------------------------------------------------
    sk = t.SKU_ID.map(labels.norm_sku)
    dq.add("train.csv", "malformed SKU_ID (case/underscore/padding)", (sk != t.SKU_ID).sum(), "normalised to AAA-NNN")
    t["SKU_ID"] = sk
    for col, fn, name in (("Region", labels.norm_region, "region"), ("Sales_Channel", labels.norm_channel, "channel")):
        before = t[col].copy()
        t[col] = fn(t[col])
        dq.add("train.csv", f"inconsistent {name} labels", ((before != t[col]) & before.notna()).sum(), "mapped to canonical")
    cust_before = t.Customer_Name.copy()
    t["Customer_Name"] = labels.norm_customer(t.Customer_Name)
    dq.add("train.csv", "customer name variants/typos", (cust_before != t.Customer_Name).sum(), "case/whitespace/Inc + fuzzy match to 12 canonical")
    dq.add("train.csv", "missing Product_Family", t.Product_Family.isna().sum(), "derived from SKU prefix via sku_master", severity="warning")
    sku_m = sku.set_index("SKU_ID").copy()
    # Rule: each family belongs to exactly one BU. Transactions agree with this; master contradicts for a few SKUs.
    fam_bu = t.dropna(subset=["Product_Family", "Business_Unit"]).groupby("Product_Family").Business_Unit.agg(lambda x: x.mode()[0])
    bad_bu = sku_m.Business_Unit != sku_m.Product_Family.map(fam_bu)
    dq.add("sku_master.csv", "Business_Unit contradicts family's single BU (" + ", ".join(sku_m.index[bad_bu]) + ")", int(bad_bu.sum()),
           "master BU overridden by the family's BU observed in transactions", severity="warning")
    sku_m["Business_Unit"] = sku_m.Product_Family.map(fam_bu)
    t["Product_Family"] = t.SKU_ID.map(sku_m.Product_Family)
    t["Business_Unit"] = t.SKU_ID.map(sku_m.Business_Unit)
    t["SKU_Description"] = t.SKU_ID.map(sku_m.SKU_Description)
    unknown = ~t.SKU_ID.isin(sku_m.index)
    dq.add("train.csv", "SKU not in sku_master", unknown.sum(), "dropped")
    t = t[~unknown]

    # ---- duplicates ----------------------------------------------------------------------------
    t = t.sort_values("Load_Timestamp")
    dup_mask = t.duplicated("Record_ID", keep="last")
    dq.add("train.csv", "duplicate Record_ID (loaded twice)", dup_mask.sum(), "kept latest Load_Timestamp (rule 2)")
    t = t[~dup_mask]

    # ---- region imputation ---------------------------------------------------------------------
    t = t.reset_index(drop=True)
    miss_reg = int(t.Region.isna().sum())
    fixed = labels.impute_region(t)
    dq.add("train.csv", "missing Region", miss_reg, f"imputed {fixed} from SKU+customer slot; rest dropped", severity="warning")
    t = t[t.Region.notna()]
    kd = t.duplicated(["Date", "SKU_ID", "Region"], keep="last")
    dq.add("train.csv", "duplicate Date-SKU-Region after cleaning", kd.sum(), "kept latest load")
    t = t[~kd]

    # ---- units / price / revenue ---------------------------------------------------------------
    t = units.fix_units(t, cfg, dq)

    # ---- stockouts: shipped is what train should show; requested is true demand ----------------
    stock = stock.copy()
    stock["Date"] = stock.Date.map(dates.parse_month)
    ident = (stock.Requested_Units + stock.Carried_In_Units - stock.Shipped_Units - stock.Backordered_Units - stock.Lost_Units).abs()
    dq.add("inventory_stockouts.csv", "identity Requested+CarriedIn-Shipped-Backordered-Lost != 0", (ident > 0).sum(), "n/a (file is consistent)", severity="info")
    sk = stock.rename(columns={"SKU_ID": "SKU_ID", "Region": "Region"})[["Date", "SKU_ID", "Region", "Requested_Units", "Carried_In_Units", "Shipped_Units", "Backordered_Units", "Lost_Units", "Fill_Rate_Pct", "Stockout_Days", "Reason"]]
    t = t.merge(sk, on=["Date", "SKU_ID", "Region"], how="left")
    ov = t.Shipped_Units.notna() & (t.Units_Clean.isna() | (t.Units_Clean != t.Shipped_Units))
    t["fix_flags"] = units.add_flag(t.fix_flags, ov, "stockout_shipped_override")
    dq.add("train.csv", "Units_Sold disagrees with stockout Shipped_Units", ov.sum(), "Units = Shipped_Units")
    t.loc[ov, "Units_Clean"] = t.loc[ov, "Shipped_Units"]
    t["Revenue_Clean"] = t.Units_Clean * t.Price_Clean
    t["row_status"] = "observed"

    # ---- complete grid: missing row != zero (rule 3) -------------------------------------------
    test = raw["test"]
    attr = (pd.concat([t[["SKU_ID", "Region", "Customer_Name", "Sales_Channel"]].drop_duplicates(["SKU_ID", "Region"], keep="last"),
                       test[["SKU_ID", "Region", "Customer_Name", "Sales_Channel"]].drop_duplicates(["SKU_ID", "Region"], keep="last")])
            .drop_duplicates(["SKU_ID", "Region"], keep="last"))
    first = t.groupby(["SKU_ID", "Region"]).Date.min().rename("first")
    eol = pd.to_datetime(sku_m.EOL_Date).dt.to_period("M")
    grid = []
    end = pd.Period(hist_end, "M")
    for (s, r), f in first.items():
        e = min(end, eol[s]) if pd.notna(eol.get(s)) else end
        if f <= e:
            grid.append(pd.DataFrame({"Date": pd.period_range(f, e, freq="M"), "SKU_ID": s, "Region": r}))
    grid = pd.concat(grid, ignore_index=True)
    p = grid.merge(t, on=["Date", "SKU_ID", "Region"], how="left")
    p["row_status"] = p.row_status.fillna("missing")
    # rows present only in the stockout file (absent from train): recover from shipped/requested
    absent = sk.merge(p[["Date", "SKU_ID", "Region"]], on=["Date", "SKU_ID", "Region"], how="left", indicator=True)
    absent = absent[absent._merge == "left_only"]
    dq.add("inventory_stockouts.csv", "stockout months with no train row", len(absent), "row recovered: Units = Shipped_Units, demand = Requested_Units", severity="warning")
    for c in ("Requested_Units", "Carried_In_Units", "Shipped_Units", "Backordered_Units", "Lost_Units", "Fill_Rate_Pct", "Stockout_Days", "Reason"):
        p[c] = p[c].where(p[c].notna(), p[["Date", "SKU_ID", "Region"]].merge(sk, on=["Date", "SKU_ID", "Region"], how="left")[c].values)
    rec = (p.row_status == "missing") & p.Shipped_Units.notna()
    p.loc[rec, "Units_Clean"] = p.loc[rec, "Shipped_Units"]
    p.loc[rec, "row_status"] = "from_stockout_file"
    dq.add("train.csv", "missing rows inside series lifetime (not zero)", (p.row_status == "missing").sum(), "kept as NaN (unknown), never zero-filled", severity="warning")
    # forward/back-fill descriptive attributes on missing rows
    for c in ("Customer_Name", "Sales_Channel"):
        p[c] = p.groupby(["SKU_ID", "Region"])[c].transform(lambda s: s.ffill().bfill())
    p["Product_Family"] = p.SKU_ID.map(sku_m.Product_Family)
    p["Business_Unit"] = p.SKU_ID.map(sku_m.Business_Unit)
    p["Price_Clean"] = p.Price_Clean.fillna(p.groupby(["SKU_ID", "Date"]).Price_Clean.transform("median"))   # rule 4: same price in every region
    p["Price_Clean"] = p.Price_Clean.fillna(p.groupby(["SKU_ID"]).Price_Clean.transform(lambda s: s.ffill().bfill()))
    p["Demand_Unconstrained"] = np.where(p.Requested_Units.notna(), p.Requested_Units, p.Units_Clean)
    p["Revenue_Clean"] = p.Units_Clean * p.Price_Clean
    p["fix_flags"] = p.fix_flags.fillna("")
    p["mi"] = month_index(p.Date)
    p = p.sort_values(["SKU_ID", "Region", "Date"]).reset_index(drop=True)
    p["Date"] = p.Date.astype(str)

    mac = macro.clean_macro(raw["macro"], dq)
    mac["Date"] = mac.Date.astype(str)

    keep = ["Date", "mi", "SKU_ID", "Region", "Product_Family", "Business_Unit", "Customer_Name", "Sales_Channel",
            "Units_Clean", "Demand_Unconstrained", "Price_Clean", "Revenue_Clean", "row_status", "fix_flags",
            "Requested_Units", "Carried_In_Units", "Shipped_Units", "Backordered_Units", "Lost_Units", "Fill_Rate_Pct", "Stockout_Days", "Reason"]
    p = p[keep]
    out = cfg["paths"]["processed"]
    p.to_parquet(out / "panel_clean.parquet", index=False)
    mac.to_parquet(out / "macro_clean.parquet", index=False)
    after = {"rows": int((p.row_status != "missing").sum()), "duplicate_record_ids": 0, "distinct_region_labels": int(p.Region.nunique()),
             "distinct_channel_labels": int(p.Sales_Channel.nunique()), "distinct_customer_labels": int(p.Customer_Name.nunique()),
             "distinct_sku_labels": int(p.SKU_ID.nunique()), "distinct_date_strings": int(p.Date.nunique()), "missing_region": 0, "missing_family": 0,
             "missing_or_nonnumeric_units": int(p.Units_Clean.isna().sum()), "negative_units": int((p.Units_Clean < 0).sum()),
             "units_sum": float(p.Units_Clean.sum()), "units_max": float(p.Units_Clean.max())}
    dq.summary = {"before": stats_before, "after": after, "raw_rows": n_raw, "clean_observed_rows": int((p.row_status != "missing").sum()), "panel_rows": len(p),
                  "series": int(p.groupby(["SKU_ID", "Region"]).ngroups)}
    dq.to_json(out / "dq_report.json")
    dq.frame().sort_values("rows_affected", ascending=False).to_csv(out / "dq_issues.csv", index=False)
    return {"panel": p, "macro": mac, "dq": dq, "sku": sku, "events": raw["events"], "test": test}


if __name__ == "__main__":
    r = clean_all()
    print(r["dq"].frame().to_string())
