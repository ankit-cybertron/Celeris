import type { Cube, DimKey, Filters, ScaleRow } from "./types";

export type IntervalLevel = "total" | "family" | "region" | "channel" | "family_region";

/** Interval rule: aggregate selections use backtest scale ratios; SKU/customer selections sum leaves. */
export function intervalLevel(f: Filters): IntervalLevel | null {
  if (f.sku != null || f.customer != null) return null;
  if (f.family != null && f.region != null) return "family_region";
  if (f.family != null) return "family";
  if (f.region != null) return "region";
  if (f.channel != null) return "channel";
  return "total";
}
export function horizonBucket(h: number): "h1-6" | "h7-12" | "h13-19" {
  return h <= 6 ? "h1-6" : h <= 12 ? "h7-12" : "h13-19";
}

export interface MonthPoint {
  idx: number;
  month: string;
  isFc: boolean;
  shipped: number | null;
  demand: number | null;
  shippedRev: number | null;
  demandRev: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  rev50: number | null;
  rev10: number | null;
  rev90: number | null;
  missing: number;
  zero: number;
  lost: number;
  lostRev: number;
}

export interface SeriesStat {
  id: number;
  sku: number;
  reg: number;
  ch: number;
  cus: number;
  fam: number;
  last12: number;
  next12: number;
  fc19: number;
  p90_19: number;
  rules: Set<number>;
}

const DIM_FIELD: Record<Exclude<DimKey, "family">, "sku" | "reg" | "ch" | "cus"> = {
  sku: "sku",
  region: "reg",
  channel: "ch",
  customer: "cus",
};

export class Engine {
  readonly cube: Cube;
  readonly nSeries: number;
  readonly sSku: Int32Array;
  readonly sReg: Int32Array;
  readonly sCh: Int32Array;
  readonly sCus: Int32Array;
  readonly sFam: Int32Array;
  readonly histS: Int32Array;
  readonly fcS: Int32Array;
  readonly scale: ScaleRow[];
  readonly lh: number;

  constructor(cube: Cube, scale: ScaleRow[] = []) {
    this.cube = cube;
    this.scale = scale;
    this.lh = cube.last_hist;
    const map = new Map<string, number>();
    const sku: number[] = [], reg: number[] = [], ch: number[] = [], cus: number[] = [];
    const idOf = (a: number, b: number, c: number, d: number) => {
      const k = `${a}|${b}|${c}|${d}`;
      let id = map.get(k);
      if (id === undefined) {
        id = sku.length;
        map.set(k, id);
        sku.push(a); reg.push(b); ch.push(c); cus.push(d);
      }
      return id;
    };
    const H = cube.hist, F = cube.fc;
    this.histS = new Int32Array(H.m.length);
    for (let i = 0; i < H.m.length; i++) this.histS[i] = idOf(H.sku[i]!, H.reg[i]!, H.ch[i]!, H.cus[i]!);
    this.fcS = new Int32Array(F.m.length);
    for (let i = 0; i < F.m.length; i++) this.fcS[i] = idOf(F.sku[i]!, F.reg[i]!, F.ch[i]!, F.cus[i]!);
    this.nSeries = sku.length;
    this.sSku = Int32Array.from(sku);
    this.sReg = Int32Array.from(reg);
    this.sCh = Int32Array.from(ch);
    this.sCus = Int32Array.from(cus);
    this.sFam = Int32Array.from(sku.map((s) => cube.sku_family[s] ?? -1));
  }

  private seriesValue(dim: DimKey, s: number): number {
    if (dim === "family") return this.sFam[s]!;
    const f = DIM_FIELD[dim];
    return f === "sku" ? this.sSku[s]! : f === "reg" ? this.sReg[s]! : f === "ch" ? this.sCh[s]! : this.sCus[s]!;
  }

  private matches(s: number, f: Filters, skip?: DimKey): boolean {
    for (const k of ["family", "sku", "region", "channel", "customer"] as DimKey[]) {
      if (k === skip) continue;
      const v = f[k];
      if (v != null && this.seriesValue(k, s) !== v) return false;
    }
    return true;
  }

  seriesMask(f: Filters): Uint8Array {
    const m = new Uint8Array(this.nSeries);
    for (let s = 0; s < this.nSeries; s++) m[s] = this.matches(s, f) ? 1 : 0;
    return m;
  }

  /** Values of `dim` compatible with the other selected filters (cascading dropdowns). */
  options(dim: DimKey, f: Filters): number[] {
    const set = new Set<number>();
    for (let s = 0; s < this.nSeries; s++) {
      if (!this.matches(s, f, dim)) continue;
      const v = this.seriesValue(dim, s);
      if (v >= 0) set.add(v);
    }
    return [...set].sort((a, b) => a - b);
  }

  dimLabel(dim: DimKey, v: number): string {
    const d = this.cube.dims;
    const arr = dim === "family" ? d.family : dim === "sku" ? d.sku : dim === "region" ? d.region : dim === "channel" ? d.channel : d.customer;
    return v < 0 ? "(none)" : (arr[v] ?? String(v));
  }

  scaleFor(level: IntervalLevel, h: number): ScaleRow | undefined {
    const b = horizonBucket(h);
    return this.scale.find((r) => r.level === level && r.h_bucket === b);
  }

  monthly(f: Filters, mask: Uint8Array): MonthPoint[] {
    const c = this.cube, n = c.months.length, lh = this.lh;
    const pts: MonthPoint[] = c.months.map((month, idx) => ({
      idx, month, isFc: idx > lh,
      shipped: null, demand: null, shippedRev: null, demandRev: null,
      p10: null, p50: null, p90: null, rev50: null, rev10: null, rev90: null,
      missing: 0, zero: 0, lost: 0, lostRev: 0,
    }));
    const H = c.hist;
    const sh = new Float64Array(n), dm = new Float64Array(n), shr = new Float64Array(n), dmr = new Float64Array(n);
    const has = new Uint8Array(n);
    for (let i = 0; i < H.m.length; i++) {
      if (!mask[this.histS[i]!]) continue;
      const m = H.m[i]!;
      has[m] = 1;
      const pt = pts[m]!;
      if (H.miss[i] === 1) { pt.missing++; continue; }
      const u = H.u[i]!, d = H.d[i]!, r = H.r[i]!;
      if (d < 0) pt.missing++;
      if (d === 0) pt.zero++;
      if (u >= 0) sh[m]! += u;
      if (d >= 0) { dm[m]! += d; dmr[m]! += r; }
      if (u >= 0 && d > 0) {
        shr[m]! += (r * u) / d;
        if (d > u) { pt.lost += d - u; pt.lostRev += (r * (d - u)) / d; }
      } else if (u >= 0 && d < 0) {
        shr[m]! += 0;
      }
    }
    for (let m = 0; m <= lh && m < n; m++) {
      if (!has[m]) continue;
      const pt = pts[m]!;
      pt.shipped = sh[m]!; pt.demand = dm[m]!; pt.shippedRev = shr[m]!; pt.demandRev = dmr[m]!;
    }
    const F = c.fc;
    const p10 = new Float64Array(n), p50 = new Float64Array(n), p90 = new Float64Array(n), rv = new Float64Array(n);
    const hasF = new Uint8Array(n);
    for (let i = 0; i < F.m.length; i++) {
      if (!mask[this.fcS[i]!]) continue;
      const m = F.m[i]!;
      hasF[m] = 1;
      p10[m]! += F.p10[i]!; p50[m]! += F.p50[i]!; p90[m]! += F.p90[i]!; rv[m]! += F.r[i]!;
    }
    const level = intervalLevel(f);
    for (let m = lh + 1; m < n; m++) {
      if (!hasF[m]) continue;
      const pt = pts[m]!;
      let lo = p10[m]!, hi = p90[m]!;
      const mid = p50[m]!;
      if (level) {
        const sc = this.scaleFor(level, m - lh);
        if (sc) {
          lo = mid * sc.q10;
          hi = mid * sc.q90;
        }
      }
      // Final safety check: log console warning if ordering is violated
      if (lo > mid || mid > hi) {
        console.warn(`[engine] Interval ordering violation for month ${pt.month} at level ${level}: p10=${lo}, p50=${mid}, p90=${hi}. Adjusting for safety.`);
        lo = Math.min(lo, mid);
        hi = Math.max(hi, mid);
      }
      pt.p50 = mid; pt.p10 = lo; pt.p90 = hi; pt.rev50 = rv[m]!;
      pt.rev10 = mid > 0 ? (rv[m]! * lo) / mid : 0;
      pt.rev90 = mid > 0 ? (rv[m]! * hi) / mid : 0;
    }
    return pts;
  }

  /** Per-series 12m/19m stats for the current mask. */
  seriesStats(mask: Uint8Array): SeriesStat[] {
    const lh = this.lh;
    const out = new Map<number, SeriesStat>();
    const get = (s: number) => {
      let st = out.get(s);
      if (!st) {
        st = { id: s, sku: this.sSku[s]!, reg: this.sReg[s]!, ch: this.sCh[s]!, cus: this.sCus[s]!, fam: this.sFam[s]!, last12: 0, next12: 0, fc19: 0, p90_19: 0, rules: new Set() };
        out.set(s, st);
      }
      return st;
    };
    const H = this.cube.hist;
    for (let i = 0; i < H.m.length; i++) {
      const s = this.histS[i]!;
      if (!mask[s]) continue;
      const m = H.m[i]!;
      if (m > lh - 12 && m <= lh && H.d[i]! > 0) get(s).last12 += H.d[i]!;
    }
    const F = this.cube.fc;
    for (let i = 0; i < F.m.length; i++) {
      const s = this.fcS[i]!;
      if (!mask[s]) continue;
      const st = get(s), m = F.m[i]!;
      if (m <= lh + 12) st.next12 += F.p50[i]!;
      st.fc19 += F.p50[i]!;
      st.p90_19 += F.p90[i]!;
      if (F.rule[i]! > 0) st.rules.add(F.rule[i]!);
    }
    return [...out.values()];
  }

  /** last-12m history demand vs next-12m P50, grouped by a dimension. */
  mix(stats: SeriesStat[], dim: DimKey): Array<{ key: string; last12: number; next12: number }> {
    const g = new Map<number, { last12: number; next12: number }>();
    for (const s of stats) {
      const v = dim === "family" ? s.fam : dim === "sku" ? s.sku : dim === "region" ? s.reg : dim === "channel" ? s.ch : s.cus;
      const e = g.get(v) ?? { last12: 0, next12: 0 };
      e.last12 += s.last12; e.next12 += s.next12;
      g.set(v, e);
    }
    return [...g.entries()].map(([k, v]) => ({ key: this.dimLabel(dim, k), ...v })).sort((a, b) => b.next12 + b.last12 - (a.next12 + a.last12));
  }
}

export function sumRange(pts: MonthPoint[], from: number, to: number, key: keyof MonthPoint): number {
  let s = 0;
  for (let i = Math.max(0, from); i <= to && i < pts.length; i++) {
    const v = pts[i]?.[key];
    if (typeof v === "number") s += v;
  }
  return s;
}

export function growthPct(prev: number, next: number): number | null {
  return prev > 0 ? (next / prev - 1) * 100 : null;
}

/** Seasonality index by calendar month over complete history years. */
export function seasonality(pts: MonthPoint[], lh: number): Array<{ month: number; index: number | null }> {
  const byYear = new Map<string, number[]>();
  for (const p of pts) {
    if (p.idx > lh || p.demand == null) continue;
    const y = p.month.slice(0, 4);
    const arr = byYear.get(y) ?? new Array<number>(12).fill(NaN);
    arr[Number(p.month.slice(5, 7)) - 1] = p.demand;
    byYear.set(y, arr);
  }
  const acc: number[][] = Array.from({ length: 12 }, () => []);
  for (const arr of byYear.values()) {
    if (arr.some((v) => Number.isNaN(v))) continue;
    const mean = arr.reduce((a, b) => a + b, 0) / 12;
    if (mean <= 0) continue;
    arr.forEach((v, i) => acc[i]!.push(v / mean));
  }
  return acc.map((a, i) => ({ month: i + 1, index: a.length ? a.reduce((x, y) => x + y, 0) / a.length : null }));
}
