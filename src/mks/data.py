"""Shared data access: load clean artefacts, build the series x month matrix used by features/models."""
from __future__ import annotations
import numpy as np
import pandas as pd
from .config import load_config

MONTH0 = pd.Period("2019-01", "M")
N_HIST = 94          # 2019-01 .. 2026-10
HORIZON = 19         # 2026-11 .. 2028-05
T_ALL = N_HIST + HORIZON


def midx(date_str: str) -> int:
    return pd.Period(date_str, "M").ordinal - MONTH0.ordinal


def mlabel(i: int) -> str:
    return str(MONTH0 + int(i))


def load_panel(cfg=None) -> pd.DataFrame:
    cfg = cfg or load_config()
    return pd.read_parquet(cfg["paths"]["processed"] / "panel_clean.parquet")


def load_macro(cfg=None) -> pd.DataFrame:
    cfg = cfg or load_config()
    return pd.read_parquet(cfg["paths"]["processed"] / "macro_clean.parquet")


def series_keys(panel: pd.DataFrame, test: pd.DataFrame, sku: pd.DataFrame) -> pd.DataFrame:
    """One row per SKU-Region series (history U test). Customer/channel from test when present (known future)."""
    last = panel.sort_values("Date").groupby(["SKU_ID", "Region"]).agg(Customer_Name=("Customer_Name", "last"), Sales_Channel=("Sales_Channel", "last")).reset_index()
    tk = test.groupby(["SKU_ID", "Region"]).agg(Customer_Name=("Customer_Name", "last"), Sales_Channel=("Sales_Channel", "last")).reset_index()
    k = pd.concat([last, tk]).drop_duplicates(["SKU_ID", "Region"], keep="last").sort_values(["SKU_ID", "Region"]).reset_index(drop=True)
    sm = sku.set_index("SKU_ID")
    k["fam"] = k.SKU_ID.str[:3]
    k["Product_Family"] = k.SKU_ID.map(sm.Product_Family)
    k["Business_Unit"] = k.Product_Family.map(panel.groupby("Product_Family").Business_Unit.agg(lambda x: x.mode()[0]))  # family has exactly one BU (master has 4 contradictions)
    k["pt"] = k.SKU_ID.map(sm.Powertrain_Application)
    k["sz"] = k.SKU_ID.map(sm.Size_Class)
    for c in ["Region", "Customer_Name", "Sales_Channel", "fam", "pt", "sz"]:
        k[c + "_c"] = k[c].astype("category").cat.codes
    k["sid"] = np.arange(len(k))
    return k


def to_matrix(panel: pd.DataFrame, keys: pd.DataFrame, col: str, n: int = T_ALL) -> np.ndarray:
    """Series x month matrix; NaN = unknown (never zero-filled)."""
    sid = keys.set_index(["SKU_ID", "Region"]).sid
    idx = pd.MultiIndex.from_frame(panel[["SKU_ID", "Region"]])
    s = sid.reindex(idx).to_numpy()
    ok = ~np.isnan(s.astype(float))
    Y = np.full((len(keys), n), np.nan)
    Y[s[ok].astype(int), panel.mi.to_numpy()[ok]] = panel[col].to_numpy()[ok]
    return Y
