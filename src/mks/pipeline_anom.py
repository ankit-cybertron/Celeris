"""Stage runner: panel_clean -> unconstrained demand -> anomaly register, profiles. python -m mks.cli anomalies"""
from __future__ import annotations
from .config import load_config
from . import data, demand, anomalies
import pandas as pd


def run(cfg=None):
    cfg = cfg or load_config()
    out = cfg["paths"]["processed"]
    raw = cfg["paths"]["raw"]
    p = data.load_panel(cfg)
    events, sku, test = pd.read_csv(raw / "events_calendar.csv"), pd.read_csv(raw / "sku_master.csv"), pd.read_csv(raw / "test.csv")
    p = demand.estimate_unconstrained(p, events)
    p = demand.cap_spikes(p, cfg["anomaly"]["spike_cap_ratio"], cfg["anomaly"]["spike_ratio"])
    keys = data.series_keys(p, test, sku)
    Y = data.to_matrix(p, keys, "Units_Clean")
    prof = anomalies.series_profile(p, keys, Y, sku)
    reg, imp = anomalies.build_register(p, events, sku, test, prof, cfg)
    p.to_parquet(out / "panel_demand.parquet", index=False)
    keys.to_parquet(out / "series_keys.parquet", index=False)
    prof.to_parquet(out / "series_profile.parquet", index=False)
    reg.to_csv(cfg["paths"]["outputs"] / "anomaly_register.csv", index=False)
    imp.to_csv(cfg["paths"]["outputs"] / "event_impacts.csv", index=False)
    return p, reg, imp, prof


if __name__ == "__main__":
    p, reg, imp, prof = run()
    print(reg.groupby(["class", "type"]).size())
    print(imp.round(1).to_string())
    print(prof.demand_class.value_counts().to_dict(), prof.cycle_period.value_counts().to_dict())
