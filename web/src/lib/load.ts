import type { Dataset } from "./types";

async function getJson(name: string): Promise<unknown> {
  const res = await fetch(`/data/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return res.json();
}

/** Accepts either a bare array or an object wrapping one array (e.g. {skus:[...]}). */
function asArray<T>(v: unknown): T[] | null {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const arr = Object.values(v as Record<string, unknown>).find(Array.isArray);
    if (arr) return arr as T[];
  }
  return null;
}

export async function loadDataset(): Promise<Dataset> {
  const names = ["cube", "dq", "anomalies", "backtest", "insights", "stockouts", "lifecycle", "profile", "exceptions", "meta"] as const;
  const settled = await Promise.allSettled(names.map(getJson));
  const failed: string[] = [];
  const val = (i: number): unknown => {
    const s = settled[i];
    if (s && s.status === "fulfilled") return s.value;
    failed.push(`${names[i]}.json`);
    return null;
  };
  const cube = val(0);
  if (!cube) {
    const reason = settled[0]?.status === "rejected" ? String((settled[0] as PromiseRejectedResult).reason) : "";
    throw new Error(`cube.json could not be loaded. ${reason}`);
  }
  return {
    cube: cube as Dataset["cube"],
    dq: val(1) as Dataset["dq"],
    anomalies: val(2) as Dataset["anomalies"],
    backtest: val(3) as Dataset["backtest"],
    insights: val(4) as Dataset["insights"],
    stockouts: asArray(val(5)),
    lifecycle: asArray(val(6)),
    profile: asArray(val(7)),
    exceptions: asArray(val(8)),
    meta: val(9) as Dataset["meta"],
    failed,
  };
}
