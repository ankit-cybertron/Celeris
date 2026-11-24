export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(digits)}K`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(Math.max(1, digits)).replace(/\.0$/, "")}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(a < 10 ? 2 : 0);
}
export function fmtMoney(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return (v < 0 ? "-$" : "$") + fmtNum(Math.abs(v), digits);
}
export function fmtPct(v: number | null | undefined, digits = 1, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = v.toFixed(digits);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}
/** ratio (0.236) → "23.6%" */
export function fmtRatio(v: number | null | undefined, digits = 1, signed = false): string {
  return v == null ? "–" : fmtPct(v * 100, digits, signed);
}
export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return Math.round(v).toLocaleString("en-US");
}
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
