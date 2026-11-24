import type { Backtest, DimMetricRow, Meta } from "./types";

export const isNaive = (m: string) => /naive/i.test(m);

export function methodSummary(bt: Backtest) {
  const g = new Map<string, { method: string; wape: number; bias: number; n: number; k: number }>();
  for (const r of bt.overall) {
    const e = g.get(r.method) ?? { method: r.method, wape: 0, bias: 0, n: 0, k: 0 };
    e.wape += r.wape; e.bias += r.bias; e.n += r.n ?? 0; e.k += 1;
    g.set(r.method, e);
  }
  const rows = [...g.values()].map((e) => ({ method: e.method, wape: e.wape / e.k, bias: e.bias / e.k, n: e.n, origins: e.k }));
  const naive = rows.find((r) => isNaive(r.method));
  return rows.map((r) => ({ ...r, vsNaive: naive && naive.wape > 0 ? (1 - r.wape / naive.wape) * 100 : null })).sort((a, b) => a.wape - b.wape);
}

/** The submitted model: meta.model when present in the backtest, else the best non-naive method. */
export function primaryMethod(bt: Backtest, meta: Meta | null): string | null {
  const rows = methodSummary(bt);
  if (meta?.model && rows.some((r) => r.method === meta.model)) return meta.model;
  return rows.find((r) => !isNaive(r.method))?.method ?? rows[0]?.method ?? null;
}

/** Pivot by_dim rows for one dimension into chart rows {key, [method]: wape, [method + "_bias"]: bias}. */
export function pivotDim(rows: DimMetricRow[], dim: string) {
  const methods = [...new Set(rows.filter((r) => r.dim === dim).map((r) => r.method))];
  const g = new Map<string, Record<string, string | number>>();
  for (const r of rows) {
    if (r.dim !== dim) continue;
    const e = g.get(r.key) ?? { key: r.key };
    e[r.method] = r.wape;
    e[`${r.method}_bias`] = r.bias;
    g.set(r.key, e);
  }
  const out = [...g.values()];
  if (dim === "h") out.sort((a, b) => Number(a["key"]) - Number(b["key"]));
  return { methods, rows: out };
}
