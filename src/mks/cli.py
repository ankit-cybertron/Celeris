"""Command line: python -m mks.cli {clean|anomalies|backtest|forecast|all} [--fast]"""
from __future__ import annotations
import argparse
import time
import warnings

warnings.filterwarnings("ignore", category=RuntimeWarning)
from .config import load_config


def main(argv=None):
    ap = argparse.ArgumentParser(prog="mks")
    ap.add_argument("stage", choices=["clean", "anomalies", "backtest", "forecast", "insights", "export", "all"])
    ap.add_argument("--fast", action="store_true", help="small/fast models for smoke tests")
    a = ap.parse_args(argv)
    cfg = load_config()
    stages = ["clean", "anomalies", "backtest", "forecast", "insights", "export"] if a.stage == "all" else [a.stage]
    for s in stages:
        t0 = time.time()
        print(f"== {s} ==", flush=True)
        if s == "clean":
            from .clean.pipeline import clean_all
            r = clean_all(cfg); print(r["dq"].frame().groupby("severity").rows_affected.sum().to_dict())
        elif s == "anomalies":
            from .pipeline_anom import run
            run(cfg)
        elif s == "backtest":
            from .backtest import run
            run(cfg, fast=a.fast)
        elif s == "forecast":
            from .forecast import run
            run(cfg, fast=a.fast)
        elif s == "export":
            from .export_web import run
            run(cfg)
        elif s == "insights":
            from .insights import run
            run(cfg)
        print(f"   {s} done in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
