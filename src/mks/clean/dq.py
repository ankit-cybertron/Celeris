"""Data-quality log: every cleaning action records issue, file, rows affected, action taken."""
from __future__ import annotations
import json
import pandas as pd


class DQLog:
    def __init__(self) -> None:
        self.rows: list[dict] = []
        self.summary: dict = {}

    def add(self, file: str, issue: str, rows: int, action: str, severity: str = "error", **extra) -> None:
        rows = int(rows)
        if rows > 0:
            self.rows.append({"file": file, "issue": issue, "rows_affected": rows, "action": action,
                              "severity": severity, **extra})

    def frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.rows, columns=["file", "issue", "rows_affected", "action", "severity"])

    def to_json(self, path, extra: dict | None = None) -> None:
        payload = {"issues": self.rows, "summary": {**self.summary, **(extra or {})}}
        with open(path, "w") as f:
            json.dump(payload, f, indent=2, default=str)
