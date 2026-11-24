"""Ordering-cycle detection: customers order monthly / every 2nd / quarterly month with a fixed phase."""
from __future__ import annotations
import numpy as np

PERIODS = (2, 3, 4, 6)


def detect_cycle(seg: np.ndarray, margin: float = 0.03):
    """seg: series x W (NaN = unknown). Returns (period, phase, accuracy) per series, phase in window frame.
    Period 1 = every month. A larger period is accepted only if it beats the monthly fit by `margin`."""
    N, W = seg.shape
    nz = seg > 0
    valid = ~np.isnan(seg)
    nv = np.maximum(valid.sum(1), 1)
    ar = np.arange(W)
    bp = np.ones(N, int)
    bph = np.zeros(N, int)
    bacc = (nz & valid).sum(1) / nv
    for p in PERIODS:
        for ph in range(p):
            pred = ((ar % p) == ph)[None, :]
            acc = ((pred == nz) & valid).sum(1) / nv
            better = acc > bacc + margin
            bp = np.where(better, p, bp)
            bph = np.where(better, ph, bph)
            bacc = np.where(better, acc, bacc)
    bacc = np.where(valid.sum(1) == 0, 0.0, bacc)
    return bp, bph, bacc
