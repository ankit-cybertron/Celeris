"""Model zoo: baselines + global LightGBM (median + quantiles)."""
from __future__ import annotations
import numpy as np
import pandas as pd
import lightgbm as lgb
from .features import CATS


def baseline_seasonal_naive(df: pd.DataFrame) -> np.ndarray:
    return df.ly.fillna(df.m12).to_numpy()


def baseline_level_x_season(df: pd.DataFrame) -> np.ndarray:
    return (df.m12 * df.seas.fillna(1.0)).to_numpy()


def tsb_forecast(Y: np.ndarray, o: int, alpha: float = 0.1, beta: float = 0.1) -> np.ndarray:
    """Teunter-Syntetos-Babai intermittent-demand method per series (flat forecast = P(order) x mean size).
    Y: series x time matrix (NaN = unknown, skipped); only columns <= o are used."""
    out = np.zeros(Y.shape[0])
    for i in range(Y.shape[0]):
        y = Y[i, : o + 1]
        y = y[~np.isnan(y)]
        if len(y) == 0 or not (y > 0).any():
            continue
        first = np.argmax(y > 0)
        y = y[first:]
        pr, z = (y > 0).mean(), y[y > 0].mean()
        for v in y:
            pr += alpha * ((v > 0) - pr)
            if v > 0:
                z += beta * (v - z)
        out[i] = pr * z
    return out


def croston_sba(Y: np.ndarray, o: int, alpha: float = 0.1) -> np.ndarray:
    """Croston with Syntetos-Boylan bias correction (1 - alpha/2)."""
    out = np.zeros(Y.shape[0])
    for i in range(Y.shape[0]):
        y = Y[i, : o + 1]
        y = y[~np.isnan(y)]
        nz = np.where(y > 0)[0]
        if len(nz) == 0:
            continue
        z, q, last = y[nz[0]], float(nz[0] + 1), nz[0]
        for j in nz[1:]:
            z += alpha * (y[j] - z)
            q += alpha * ((j - last) - q)
            last = j
        out[i] = (1 - alpha / 2) * z / max(q, 1.0)
    return out


def fit_lgbm(train: pd.DataFrame, X: list[str], cfg: dict, objective: str = "l1", alpha: float | None = None):
    m = cfg["model"]
    params = dict(objective=objective, n_estimators=m["n_estimators"], learning_rate=m["learning_rate"],
                  num_leaves=m["num_leaves"], min_child_samples=m["min_child_samples"], subsample=0.8, subsample_freq=1,
                  colsample_bytree=0.8, random_state=m["seed"], verbose=-1, n_jobs=2)
    if alpha is not None:
        params["alpha"] = alpha
    mdl = lgb.LGBMRegressor(**params)
    mdl.fit(train[X], train.y, categorical_feature=[c for c in CATS if c in X])
    return mdl


def fit_all(train: pd.DataFrame, X: list[str], cfg: dict, with_quantiles: bool = True) -> dict:
    models = {"p50": fit_lgbm(train, X, cfg, "l1")}
    if with_quantiles:
        for q in cfg["model"]["quantiles"]:
            models[f"p{int(q * 100)}"] = fit_lgbm(train, X, cfg, "quantile", alpha=q)
    return models


def predict_all(models: dict, df: pd.DataFrame, X: list[str]) -> pd.DataFrame:
    out = pd.DataFrame({k: np.clip(m.predict(df[X]), 0, None) for k, m in models.items()}, index=df.index)
    if {"p10", "p50", "p90"} <= set(out.columns):   # enforce monotone quantiles
        out["p10"] = np.minimum(out.p10, out.p50)
        out["p90"] = np.maximum(out.p90, out.p50)
    return out
