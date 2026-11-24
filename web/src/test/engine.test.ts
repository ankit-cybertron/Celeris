import { describe, expect, it } from "vitest";
import { Engine, horizonBucket, intervalLevel } from "@/lib/engine";
import { whatIfFactor } from "@/lib/whatif";
import { isException } from "@/lib/exceptions";
import { EMPTY_FILTERS, type Cube } from "@/lib/types";

// 4 months: 0,1 history (last_hist = 1), 2,3 forecast. Two series: sku0 (family 0, region 0), sku1 (family 1, region 1).
const cube: Cube = {
  months: ["2026-09", "2026-10", "2026-11", "2026-12"],
  last_hist: 1,
  dims: { sku: ["A", "B"], region: ["R0", "R1"], channel: ["C0"], customer: ["K0"], family: ["F0", "F1"] },
  sku_family: [0, 1],
  rules: [],
  hist: { m: [0, 1, 0, 1], sku: [0, 0, 1, 1], reg: [0, 0, 1, 1], ch: [0, 0, 0, 0], cus: [0, 0, -1, -1], u: [10, 8, 5, 5], d: [10, 10, 5, 5], r: [100, 100, 50, 50], miss: [0, 0, 0, 0] },
  fc: { m: [2, 3, 2, 3], sku: [0, 0, 1, 1], reg: [0, 0, 1, 1], ch: [0, 0, 0, 0], cus: [0, 0, -1, -1], p10: [1, 1, 1, 1], p50: [10, 10, 5, 5], p90: [30, 30, 20, 20], r: [100, 100, 50, 50], rule: [0, 0, 0, 0] },
};
const scale = [
  { level: "total", h_bucket: "h1-6", q10: 0.9, q50: 1, q90: 1.1 },
  { level: "family", h_bucket: "h1-6", q10: 0.8, q50: 1, q90: 1.2 },
];

describe("interval rule", () => {
  it("uses the total level with no filters and the family level with a family filter", () => {
    expect(intervalLevel(EMPTY_FILTERS)).toBe("total");
    expect(intervalLevel({ ...EMPTY_FILTERS, family: 0 })).toBe("family");
    expect(intervalLevel({ ...EMPTY_FILTERS, family: 0, region: 0 })).toBe("family_region");
  });
  it("sums leaf P10/P90 when a SKU or customer is selected", () => {
    expect(intervalLevel({ ...EMPTY_FILTERS, sku: 0 })).toBeNull();
    expect(intervalLevel({ ...EMPTY_FILTERS, customer: 0 })).toBeNull();
  });
  it("buckets horizons into 1-6, 7-12 and 13-19", () => {
    expect(horizonBucket(6)).toBe("h1-6");
    expect(horizonBucket(7)).toBe("h7-12");
    expect(horizonBucket(13)).toBe("h13-19");
  });
  it("scales aggregate P50 by q10/q90 and sums leaves for a SKU", () => {
    const e = new Engine(cube, scale);
    const total = e.monthly(EMPTY_FILTERS, e.seriesMask(EMPTY_FILTERS))[2]!;
    expect(total.p50).toBe(15);
    expect(total.p10).toBeCloseTo(13.5);
    expect(total.p90).toBeCloseTo(16.5);
    const f = { ...EMPTY_FILTERS, sku: 0 };
    const leaf = e.monthly(f, e.seriesMask(f))[2]!;
    expect(leaf.p10).toBe(1);
    expect(leaf.p90).toBe(30);
  });
  it("guarantees p10 <= p50 <= p90 across all forecast points", () => {
    const e = new Engine(cube, scale);
    const pts = e.monthly(EMPTY_FILTERS, e.seriesMask(EMPTY_FILTERS));
    for (const pt of pts) {
      if (pt.isFc && pt.p50 != null) {
        expect(pt.p10).toBeLessThanOrEqual(pt.p50);
        expect(pt.p50).toBeLessThanOrEqual(pt.p90!);
      }
    }
  });
});

describe("cascading filters", () => {
  it("only lists SKUs compatible with the selected family", () => {
    const e = new Engine(cube, scale);
    expect(e.options("sku", { ...EMPTY_FILTERS, family: 1 })).toEqual([1]);
  });
  it("counts lost sales as demand minus shipped", () => {
    const e = new Engine(cube, scale);
    const pts = e.monthly(EMPTY_FILTERS, e.seriesMask(EMPTY_FILTERS));
    expect(pts[1]!.lost).toBe(2);
  });
});

describe("what-if", () => {
  it("applies beta × change only from the best lag onward", () => {
    expect(whatIfFactor(2, 3, 0.012, -3)).toBe(1);
    expect(whatIfFactor(3, 3, 0.012, -3)).toBeCloseTo(0.964);
  });
});

describe("planner exceptions", () => {
  it("flags series moving at least the threshold", () => {
    expect(isException({ last12: 100, next12: 130 }, 30, 0)).toBe(true);
    expect(isException({ last12: 100, next12: 125 }, 30, 0)).toBe(false);
    expect(isException({ last12: 10, next12: 50 }, 30, 100)).toBe(false);
  });
});
