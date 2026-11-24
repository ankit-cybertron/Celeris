"""Config loading. Paths are resolved relative to the repo root."""
from __future__ import annotations
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]


def load_config(path: str | Path | None = None) -> dict:
    p = Path(path) if path else ROOT / "configs" / "config.yaml"
    cfg = yaml.safe_load(p.read_text())
    for k, v in cfg["paths"].items():
        cfg["paths"][k] = ROOT / v
    return cfg


def ensure_dirs(cfg: dict) -> None:
    for k in ("processed", "outputs"):
        cfg["paths"][k].mkdir(parents=True, exist_ok=True)
