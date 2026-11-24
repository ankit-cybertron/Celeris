"""Label standardisation: SKU ids, regions, channels, customers; region imputation."""
from __future__ import annotations
import re
import difflib
import pandas as pd

REGION_MAP = {
    "india": "India", "apac": "Asia Pacific", "asia pacific": "Asia Pacific", "asia-pacific": "Asia Pacific",
    "eu": "Europe", "europe": "Europe", "latam": "Latin America", "latin america": "Latin America",
    "latin-america": "Latin America", "north america": "North America", "n. america": "North America",
    "middle east & africa": "Middle East & Africa", "middle east and africa": "Middle East & Africa",
    "me&a": "Middle East & Africa", "mea": "Middle East & Africa",
}
CHANNEL_MAP = {
    "t1 distributor": "Tier-1 Distributor", "tier 1 distributor": "Tier-1 Distributor",
    "tier-1 distributor": "Tier-1 Distributor", "direct oem": "Direct OEM", "direct-oem": "Direct OEM",
    "oem direct": "Direct OEM", "after-market": "Aftermarket", "aftermarket": "Aftermarket", "export": "Export",
}
_SKU_RE = re.compile(r"^([A-Z]{3})-?(\d+)$")


def norm_sku(s: str) -> str | None:
    m = _SKU_RE.match(str(s).strip().upper().replace("_", "-"))
    return f"{m.group(1)}-{int(m.group(2)):03d}" if m else None


def norm_region(s: pd.Series) -> pd.Series:
    return s.str.strip().str.lower().map(REGION_MAP)


def norm_channel(s: pd.Series) -> pd.Series:
    return s.str.strip().str.lower().map(CHANNEL_MAP)


def norm_customer(s: pd.Series, min_count: int = 1000) -> pd.Series:
    """Collapse whitespace/case/'Inc.' variants, then fuzzy-match typos to canonical names
    (canonical = names occurring at least `min_count` times after basic normalisation)."""
    base = (s.str.replace(r"\s+", " ", regex=True).str.strip()
             .str.replace(r"\s*Inc\.$", "", regex=True).str.title())
    vc = base.value_counts()
    canon = vc[vc >= min_count].index.tolist()
    mapping = {}
    for name in vc.index:
        if name in canon:
            mapping[name] = name
        else:
            hit = difflib.get_close_matches(name, canon, n=1, cutoff=0.7)
            mapping[name] = hit[0] if hit else None
    return base.map(mapping)


def impute_region(df: pd.DataFrame) -> int:
    """Fill missing Region when (SKU, Customer) has exactly one free region slot in that month. In place."""
    known = df.dropna(subset=["Region"])
    cust_regions = known.groupby(["SKU_ID", "Customer_Name"]).Region.agg(lambda x: sorted(x.unique())).to_dict()
    taken = set(zip(known.Date, known.SKU_ID, known.Region))
    fixed = 0
    for i in df.index[df.Region.isna()]:
        r = df.loc[i]
        free = [g for g in cust_regions.get((r.SKU_ID, r.Customer_Name), []) if (r.Date, r.SKU_ID, g) not in taken]
        if len(free) == 1:
            df.at[i, "Region"] = free[0]
            taken.add((r.Date, r.SKU_ID, free[0]))
            fixed += 1
    return fixed
