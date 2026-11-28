import numpy as np
import pandas as pd
from mks.cycles import detect_cycle
from mks import demand, features as F
from mks.data import T_ALL


def test_detect_cycle_finds_biweekly_and_quarterly():
    w = 24
    bi = np.where(np.arange(w) % 2 == 1, 100.0, 0.0)
    q = np.where(np.arange(w) % 3 == 0, 100.0, 0.0)
    m = np.where(np.arange(w) >= 0, 50.0, 0.0)
    p, ph, acc = detect_cycle(np.vstack([bi, q, m]))
    assert list(p) == [2, 3, 1] and list(ph[:2]) == [1, 0] and acc.min() > .99


def test_cap_spikes_flags_and_caps():
    rows = [{"SKU_ID": "A", "Region": "X", "mi": i, "Demand_Unconstrained": 100.0} for i in range(30)]
    rows[15]["Demand_Unconstrained"] = 2000.0
    out = demand.cap_spikes(pd.DataFrame(rows), cap_ratio=3.0, spike_ratio=4.0).sort_values("mi")
    assert out.is_spike.sum() == 1 and out.Demand_Model.max() == 300.0


def _ctx(Y):
    n = Y.shape[0]
    keys = pd.DataFrame({"SKU_ID": [f"AAA-{i:03d}" for i in range(n)], "Region": "India", **{c: 0 for c in F.CATS}})
    macro = pd.DataFrame(np.random.default_rng(0).normal(size=(T_ALL, 2)), columns=["a", "b"])
    sku = pd.DataFrame({"SKU_ID": keys.SKU_ID, "EOL_Date": np.nan, "Launch_Date": "2019-01"})
    ev = pd.DataFrame(columns=["Event_Type", "Scope_Type", "Scope_Value", "Start_Date", "End_Date", "Description"])
    return F.Ctx(Y, keys, macro, ev, sku)


def test_features_have_no_lookahead():
    rng = np.random.default_rng(1)
    Y = rng.uniform(50, 150, size=(5, T_ALL))
    o = 60
    a = F.build(_ctx(Y), o, range(1, 7), with_y=False)
    Y2 = Y.copy(); Y2[:, o + 1:] = 9e9         # poison everything after the origin
    b = F.build(_ctx(Y2), o, range(1, 7), with_y=False)
    cols = [c for c in F.feature_columns(a)]
    pd.testing.assert_frame_equal(a[cols], b[cols])


def test_since_nz_handles_all_zero_and_nan():
    # Series 0: all zeros; Series 1: all NaNs; Series 2: recent demand at t=23 (0 steps back)
    w = 24
    Y = np.zeros((3, T_ALL))
    Y[1, :] = np.nan
    Y[2, 23] = 100.0
    f, _, _ = F._stats(_ctx(Y), 23)
    assert np.isnan(f["since_nz"][0]), "All-zero series since_nz should be NaN, not -1"
    assert np.isnan(f["since_nz"][1]), "All-NaN series since_nz should be NaN, not -1"
    assert f["since_nz"][2] == 0.0, "Recent nonzero demand should have steps_from_end = 0"


def test_estimate_unconstrained_guards_zero_shipped_month():
    # If a month in a supply constraint window had 0 shipped on all listed rows,
    # fill is NaN / skipped rather than forcing a 3x uplift on unlisted rows.
    events = pd.DataFrame([{
        "Event_Type": "Supply Constraint", "Scope_Type": "Product_Family", "Scope_Value": "FAM_A",
        "Start_Date": "2021-01", "End_Date": "2021-03", "Description": "Test"
    }])
    panel = pd.DataFrame([
        {"Date": "2021-01", "Product_Family": "FAM_A", "Requested_Units": 100.0, "Units_Clean": 0.0},
        {"Date": "2021-01", "Product_Family": "FAM_A", "Requested_Units": np.nan, "Units_Clean": 50.0},
        {"Date": "2021-01", "Product_Family": "FAM_A", "Requested_Units": np.nan, "Units_Clean": 0.0},
    ])
    panel["Demand_Unconstrained"] = np.where(panel.Requested_Units.notna(), panel.Requested_Units, panel.Units_Clean)
    res = demand.estimate_unconstrained(panel, events)
    # The positive unlisted row should NOT be inflated by 3x when listed shipments were 0
    assert res.loc[1, "Demand_Source"] == "observed_shipped"
    assert res.loc[1, "Demand_Unconstrained"] == 50.0
    # The zero unlisted row in the window is marked as estimated_zero_stockout
    assert res.loc[2, "Demand_Source"] == "estimated_zero_stockout"
