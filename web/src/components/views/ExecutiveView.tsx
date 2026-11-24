import { chartAnim } from "@/lib/motion";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Delta, Kpi, KpiGrid, Panel, Segmented } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip, Timeline, timelineRows, type Mode } from "@/components/dashboard/charts";
import { growthPct, sumRange } from "@/lib/engine";
import { fmtMoney, fmtNum } from "@/lib/format";
import type { DimKey } from "@/lib/types";

export function MixChart({ rows, height = 240 }: { rows: Array<{ key: string; last12: number; next12: number }>; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="key" {...axisProps} interval={0} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: string) => (v.length > 11 ? `${v.slice(0, 10)}…` : v)} />
          <YAxis tickFormatter={(v: number) => fmtNum(v, 0)} width={48} {...axisProps} />
          <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="last12" name="Last 12m (history)" fill={C.history} radius={[3, 3, 0, 0]} {...chartAnim()} />
          <Bar dataKey="next12" name="Next 12m (forecast)" fill={C.forecast} radius={[3, 3, 0, 0]} {...chartAnim()} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExecutiveView() {
  const { data, engine, pts, stats, names } = useDashboard();
  const { months, last_hist: lh } = data.cube;
  const end = months.length - 1;
  const [mode, setMode] = useState<Mode>("units");
  const rows = useMemo(() => timelineRows(pts, lh, mode), [pts, lh, mode]);

  const k = useMemo(() => {
    const u19 = sumRange(pts, lh + 1, end, "p50");
    const r19 = sumRange(pts, lh + 1, end, "rev50");
    const uL = sumRange(pts, lh - 11, lh, "demand"), uN = sumRange(pts, lh + 1, lh + 12, "p50");
    const rL = sumRange(pts, lh - 11, lh, "demandRev"), rN = sumRange(pts, lh + 1, lh + 12, "rev50");
    return { u19, r19, uL, uN, rL, rN };
  }, [pts, lh, end]);

  const mixes = useMemo(
    () => (["family", "region", "channel"] as DimKey[]).map((d) => ({ d, rows: engine.mix(stats, d) })),
    [engine, stats],
  );
  const titles: Record<string, string> = { family: "By product family", region: "By region", channel: "By sales channel" };

  return (
    <div className="space-y-4">
      <KpiGrid>
        <Kpi tone="forecast" label={`${end - lh}-month forecast units`} value={fmtNum(k.u19)} sub={`${months[lh + 1]} → ${months[end]}`} />
        <Kpi tone="forecast" label={`${end - lh}-month forecast revenue`} value={fmtMoney(k.r19)} sub="P50 revenue" />
        <Kpi tone="history" label="Units: next 12m vs last 12m" value={<Delta v={growthPct(k.uL, k.uN)} />} sub={`${fmtNum(k.uL)} → ${fmtNum(k.uN)}`} />
        <Kpi tone="history" label="Revenue: next 12m vs last 12m" value={<Delta v={growthPct(k.rL, k.rN)} />} sub={`${fmtMoney(k.rL)} → ${fmtMoney(k.rN)}`} />
      </KpiGrid>

      <Panel
        title="Demand history and forecast"
        subtitle={`${selectionLabel(names)} · shipped vs unconstrained demand, P50 with P10–P90 band · P10-P90 bands are calibrated on 2 backtest origins (12-14 months per horizon bucket); treat as indicative, not a guaranteed 80% interval.`}
        actions={<Segmented label="Measure" value={mode} onChange={setMode} options={[{ value: "units", label: "Units" }, { value: "revenue", label: "Revenue" }]} />}
      >
        <Timeline rows={rows} months={months} lh={lh} mode={mode} height={340} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        {mixes.map((m) => (
          <Panel key={m.d} title={titles[m.d]} subtitle="Units: last 12 months history vs next 12 months forecast">
            <MixChart rows={m.rows.slice(0, 10)} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
