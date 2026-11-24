import { chartAnim } from "@/lib/motion";
import { useId, type ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthPoint } from "@/lib/engine";
import { fmtMoney, fmtNum } from "@/lib/format";

export const C = {
  history: "var(--history)",
  historySoft: "var(--history-soft)",
  forecast: "var(--forecast)",
  band: "var(--band)",
  grid: "var(--border)",
  muted: "var(--muted-foreground)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  series: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"],
};

export const DOT = { r: 4, strokeWidth: 2, stroke: "var(--card)" } as const;

export const axisProps = { stroke: "var(--border)", tickLine: false, tick: { fill: "var(--muted-foreground)", fontSize: 11 } } as const;

export function TipBox({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-xs rounded-xl border bg-popover/85 px-3 py-2 text-xs text-popover-foreground shadow-xl backdrop-blur-md">
      {title && <div className="mb-1 font-semibold">{title}</div>}
      {children}
    </div>
  );
}
export function TipRow({ color, label, value }: { color?: string | undefined; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color && <span className="inline-block size-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="tabular text-foreground">{value}</span>
    </div>
  );
}

interface GenericTipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | [number, number]; color?: string; dataKey?: string | number }>;
  money?: boolean;
}
export function GenericTip({ active, label, payload, money }: GenericTipProps) {
  if (!active || !payload?.length) return null;
  const f = money ? fmtMoney : fmtNum;
  return (
    <TipBox title={label}>
      {payload.map((p, i) => (
        <TipRow key={i} color={p.color} label={String(p.name ?? p.dataKey)} value={Array.isArray(p.value) ? `${f(p.value[0])} – ${f(p.value[1])}` : f(p.value)} />
      ))}
    </TipBox>
  );
}

export type Mode = "units" | "revenue";

export interface TimelineRow {
  month: string;
  shipped: number | null;
  demand: number | null;
  p50: number | null;
  band: [number, number] | null;
  [k: string]: unknown;
}

export function timelineRows(pts: MonthPoint[], lh: number, mode: Mode): TimelineRow[] {
  const rev = mode === "revenue";
  return pts.map((p) => {
    const demand = rev ? p.demandRev : p.demand;
    const shipped = rev ? p.shippedRev : p.shipped;
    let p50 = rev ? p.rev50 : p.p50;
    let band: [number, number] | null = null;
    const lo = rev ? p.rev10 : p.p10, hi = rev ? p.rev90 : p.p90;
    if (lo != null && hi != null) band = [lo, hi];
    if (p.idx === lh && demand != null) { p50 = demand; band = [demand, demand]; } // stitch history → forecast
    return { month: p.month, shipped, demand, p50, band };
  });
}

export function yearTicks(months: string[]): string[] {
  return months.filter((m) => m.endsWith("-01"));
}

/** Shared history→forecast timeline with P10–P90 band and a dashed forecast marker. */
export function Timeline({
  rows,
  months,
  lh,
  mode = "units",
  height = 320,
  showShipped = true,
  showDemand = true,
  children,
  extraTooltip,
}: {
  rows: TimelineRow[];
  months: string[];
  lh: number;
  mode?: Mode;
  height?: number;
  showShipped?: boolean;
  showDemand?: boolean;
  children?: ReactNode;
  extraTooltip?: (month: string) => ReactNode;
}) {
  const f = mode === "revenue" ? fmtMoney : fmtNum;
  const marker = months[lh];
  const uid = useId().replace(/:/g, "");
  const gBand = `band-${uid}`, gHist = `hist-${uid}`;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gBand} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.band} stopOpacity={0.8} />
              <stop offset="100%" stopColor={C.band} stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id={gHist} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.history} stopOpacity={0.22} />
              <stop offset="100%" stopColor={C.history} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" ticks={yearTicks(months)} tickFormatter={(m: string) => m.slice(0, 4)} {...axisProps} />
          <YAxis tickFormatter={(v: number) => f(v, 0)} width={56} {...axisProps} />
          <Tooltip
            content={({ active, label, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload.find((p) => p.payload && "p50" in (p.payload as object))?.payload as TimelineRow | undefined;
              if (!row) return null;
              return (
                <TipBox title={label}>
                  {showDemand && row.demand != null && <TipRow color={C.history} label="Unconstrained demand" value={f(row.demand)} />}
                  {showShipped && row.shipped != null && <TipRow color={C.historySoft} label="Shipped" value={f(row.shipped)} />}
                  {row.p50 != null && String(label) !== marker && <TipRow color={C.forecast} label="Forecast P50" value={f(row.p50)} />}
                  {row.band && String(label) !== marker && <TipRow color={C.band} label="P10 – P90" value={`${f(row.band[0])} – ${f(row.band[1])}`} />}
                  {extraTooltip?.(String(label))}
                </TipBox>
              );
            }}
          />
          <Legend verticalAlign="bottom" height={28} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="band" name="P10–P90 band" stroke="none" fill={`url(#${gBand})`} fillOpacity={1} {...chartAnim()} connectNulls={false} />
          {showDemand && <Area type="monotone" dataKey="demand" stroke="none" fill={`url(#${gHist})`} legendType="none" tooltipType="none" activeDot={false} {...chartAnim()} />}
          {showShipped && <Line type="monotone" dataKey="shipped" name="Shipped" stroke={C.historySoft} strokeWidth={1.5} dot={false} activeDot={DOT} {...chartAnim()} connectNulls />}
          {showDemand && <Line type="monotone" dataKey="demand" name="Unconstrained demand" stroke={C.history} strokeWidth={2} dot={false} activeDot={DOT} {...chartAnim()} connectNulls />}
          <Line type="monotone" dataKey="p50" name="Forecast P50" stroke={C.forecast} strokeWidth={2.25} strokeDasharray="6 4" dot={false} activeDot={DOT} {...chartAnim()} />
          {marker && (
            <ReferenceLine x={marker} stroke={C.muted} strokeDasharray="4 4" label={{ value: "forecast →", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11, dx: 6, dy: -14 }} />
          )}
          {children}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export { Scatter };
