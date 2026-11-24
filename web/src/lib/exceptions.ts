import { growthPct, type SeriesStat } from "./engine";

/** A series is an exception when its next-12m P50 moves at least `thresholdPct` vs last-12m demand. */
export function isException(s: Pick<SeriesStat, "last12" | "next12">, thresholdPct: number, minVolume: number): boolean {
  if (Math.max(s.last12, s.next12) < minVolume) return false;
  const g = growthPct(s.last12, s.next12);
  if (g == null) return s.next12 > 0; // new demand with no recent history
  return Math.abs(g) >= thresholdPct;
}
