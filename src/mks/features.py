"""Feature engineering for the global direct multi-horizon model (origin o, horizon h -> target month o+h).

All features are computed from information available at origin `o` plus *known-future* inputs
(calendar, macro forecast window, events calendar, SKU master, test-file customer/channel).
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from .data import T_ALL, N_HIST, HORIZON, midx
from .cycles import detect_cycle
from .anomalies import _scope_mask

CATS = ["Region_c", "Customer_Name_c", "Sales_Channel_c", "fam_c", "pt_c", "sz_c"]
REGIONS = ["Asia Pacific", "Europe", "India", "Latin America", "Middle East & Africa", "North America"]


def nm(a, ax=1):
    with np.errstate(all="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return np.nanmean(a, axis=ax)


def mask_event_cells(panel: pd.DataFrame, events: pd.DataFrame, ids: list[str]) -> pd.Series:
    """Boolean mask of panel rows inside (scope x window) of events we do not want the model to learn from."""
    m = pd.Series(False, index=panel.index)
    for _, e in events[events.Event_ID.isin(ids)].iterrows():
        s, en = str(e.Start_Date)[:7], str(e.End_Date)[:7]
        m |= _scope_mask(panel, e.Scope_Type, e.Scope_Value, e.Description) & (panel.Date >= s) & (panel.Date <= en)
    return m


def holiday_matrix(events: pd.DataFrame) -> np.ndarray:
    """region x month: fraction of the month covered by Region-scoped Holiday events."""
    H = np.zeros((len(REGIONS), T_ALL))
    ev = events[(events.Event_Type == "Holiday") & (events.Scope_Type == "Region")]
    for _, e in ev.iterrows():
        s = pd.to_datetime(str(e.Start_Date)); en = pd.to_datetime(str(e.End_Date)) if pd.notna(e.End_Date) else s
        if len(str(e.End_Date)) == 7: en = en + pd.offsets.MonthEnd(0)
        if len(str(e.Start_Date)) == 7: s = s.replace(day=1)
        r = REGIONS.index(e.Scope_Value)
        for d in pd.date_range(s, en):
            i = midx(str(d.to_period("M")))
            if 0 <= i < T_ALL:
                H[r, i] += 1 / d.days_in_month
    return np.clip(H, 0, 1)


def price_rise_vector(events: pd.DataFrame) -> np.ndarray:
    """pct list-price rise effective in January of the year of each month index (0 for other months)."""
    v = np.zeros(T_ALL)
    ev = events[(events.Event_Type == "Price Change") & events.Description.str.contains("Annual list-price")]
    for _, e in ev.iterrows():
        pct = float(e.Description.split("about")[1].split("%")[0])
        i = midx(str(e.Start_Date)[:7])
        if 0 <= i < T_ALL:
            v[i] = pct
    return v


class Ctx:
    """Everything needed to build features; construct once, reuse across origins."""

    def __init__(self, Y: np.ndarray, keys: pd.DataFrame, macro: pd.DataFrame, events: pd.DataFrame, sku: pd.DataFrame):
        self.Y, self.K, self.N = Y, keys.reset_index(drop=True), len(keys)
        self.mc = [c for c in macro.columns if c not in ("Date", "Year", "Month")]
        self.MM = macro[self.mc].to_numpy()
        self.HOL = holiday_matrix(events)
        self.rise = price_rise_vector(events)
        self.reg_idx = self.K.Region.map({r: i for i, r in enumerate(REGIONS)}).to_numpy()
        sm = sku.set_index("SKU_ID")
        eol = pd.to_datetime(sm.EOL_Date).dt.to_period("M")
        self.eol = self.K.SKU_ID.map(lambda s: (eol[s].ordinal - pd.Period("2019-01", "M").ordinal) if pd.notna(eol.get(s)) else 999).to_numpy()
        self.launch = self.K.SKU_ID.map(lambda s: midx(sm.Launch_Date[s])).to_numpy()


def _stats(ctx: Ctx, o: int):
    h = ctx.Y[:, : o + 1]
    N = ctx.N
    f = {}
    for w in (1, 3, 6, 12, 24):
        f[f"m{w}"] = nm(h[:, -w:])
    with np.errstate(all="ignore"):
        f["sd12"] = np.nanstd(h[:, -12:], axis=1)
        f["z12"] = nm(np.where(np.isnan(h[:, -12:]), np.nan, (h[:, -12:] == 0).astype(float)))
        f["g6"] = f["m6"] / (nm(h[:, -12:-6]) + 1)
        f["g12"] = f["m12"] / (nm(h[:, -24:-12]) + 1)
    first = np.where((~np.isnan(h)).any(1), np.argmax(~np.isnan(h), axis=1), o)
    f["age"] = o - first
    prof = np.full((N, 12), np.nan)
    for mo in range(12):
        vals = []
        for yb in (0, 1, 2):
            idxs = [i for i in range(o - 12 * yb - 11, o - 12 * yb + 1) if i >= 0 and i % 12 == mo]
            if idxs:
                i = idxs[0]
                base = nm(ctx.Y[:, max(0, i - 6): min(i + 6, o + 1)])   # never look past the origin
                vals.append(ctx.Y[:, i] / (base + .5))
        prof[:, mo] = nm(np.array(vals).T) if vals else np.nan
    W = 24
    seg = h[:, -W:] if o + 1 >= W else np.pad(h, ((0, 0), (W - h.shape[1], 0)), constant_values=np.nan)
    bp, bph, bacc = detect_cycle(seg)
    f["cyc_p"], f["cyc_acc"], ph = bp, bacc, bph
    pos = np.where(seg > 0, seg, np.nan)
    for w in (6, 12, 24):
        f[f"mnz{w}"] = nm(pos[:, -w:])
    nz = seg > 0
    last = np.where(nz.any(1), W - 1 - np.argmax(nz[:, ::-1], axis=1), W)
    f["since_nz"] = W - 1 - last
    return f, prof, ph


def build(ctx: Ctx, o: int, hs, with_y: bool = True) -> pd.DataFrame:
    f, prof, ph = _stats(ctx, o)
    N, Y, MM = ctx.N, ctx.Y, ctx.MM
    out = []
    for h in hs:
        tm = o + h
        d = {k: v for k, v in f.items()}
        d["h"] = np.full(N, h); d["tmon"] = np.full(N, tm % 12); d["seas"] = prof[:, tm % 12]
        ly = tm - 12 if tm - 12 <= o else tm - 24
        d["ly"] = Y[:, ly] if ly >= 0 else np.nan
        d["ly2"] = Y[:, ly - 12] if ly - 12 >= 0 else np.nan
        for j, c in enumerate(ctx.mc):
            d["mt_" + c] = np.full(N, MM[tm, j])
            d["mo_" + c] = np.full(N, MM[o, j])
            d["md_" + c] = np.full(N, MM[tm, j] - MM[max(tm - 12, 0), j])
            d["mom3_" + c] = np.full(N, MM[o, j] - MM[max(o - 3, 0), j])
        d["is_ord"] = (((23 + (tm - o)) % f["cyc_p"]) == ph).astype(float)
        d["exp_ord"] = d["is_ord"] * f["mnz12"]
        d["hol"] = ctx.HOL[ctx.reg_idx, tm]
        mo = tm % 12
        jan_next = ctx.rise[tm - mo + 12] if tm - mo + 12 < T_ALL else 0.0
        d["rise_next_jan"] = np.full(N, jan_next if mo >= 8 else 0.0)
        d["rise_this_jan"] = np.full(N, ctx.rise[tm] if mo == 0 else 0.0)
        d["m_to_eol"] = np.clip(ctx.eol - tm, -1, 60)
        d["m_since_launch"] = np.clip(tm - ctx.launch, -1, 120)
        for c in CATS:
            d[c] = ctx.K[c].to_numpy()
        d["y"] = Y[:, tm] if (with_y and tm < Y.shape[1] and tm < N_HIST) else np.nan
        d["sid"] = np.arange(N); d["tm"] = np.full(N, tm); d["o"] = np.full(N, o)
        out.append(pd.DataFrame(d))
    return pd.concat(out, ignore_index=True)


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in ("y", "sid", "tm", "o")]


def training_frame(ctx: Ctx, last_origin: int, start: int, step: int) -> pd.DataFrame:
    """Rolling-origin training rows: every `step` months, all horizons whose target <= last_origin."""
    parts = []
    for o in range(start, last_origin, step):
        d = build(ctx, o, range(1, HORIZON + 1))
        parts.append(d[(d.tm <= last_origin) & d.y.notna() & d.m12.notna()])
    return pd.concat(parts, ignore_index=True)
