import { chartAnim } from "@/lib/motion";
import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Badge, Kpi, KpiGrid, Panel, SortableTable } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip } from "@/components/dashboard/charts";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";

export function ProcurementView() {
  const { data, engine, pts, stats, names, horizon } = useDashboard();
  const lh = data.cube.last_hist;
  const plan = useMemo(() => pts.filter((p) => p.idx > lh && p.p50 != null).map((p) => {
    const p50 = p.p50 ?? 0;
    const p90 = Math.max(p50, p.p90 ?? p50);
    const cover = p90 - p50;
    const rev50 = p.rev50 ?? 0;
    const rev90 = Math.max(rev50, p.rev90 ?? rev50);
    return {
      month: p.month,
      p50,
      cover,
      p90,
      rev50,
      rev90,
    };
  }), [pts, lh]);
  const tot = plan.reduce((a, r) => ({ p50: a.p50 + r.p50, p90: a.p90 + r.p90, rev50: a.rev50 + r.rev50, rev90: a.rev90 + r.rev90 }), { p50: 0, p90: 0, rev50: 0, rev90: 0 });

  const bySku = useMemo(() => {
    const g = new Map<number, { sku: string; family: string; p50: number; p90: number }>();
    for (const s of stats) {
      const e = g.get(s.sku) ?? { sku: engine.dimLabel("sku", s.sku), family: engine.dimLabel("family", s.fam), p50: 0, p90: 0 };
      e.p50 += s.fc19; e.p90 += s.p90_19;
      g.set(s.sku, e);
    }
    return [...g.values()].filter((r) => r.p50 > 0).map((r) => ({ ...r, buffer: r.p90 - r.p50, pct: (r.p90 / r.p50 - 1) * 100 }));
  }, [stats, engine]);
  const famBuf = data.insights?.insights.p90_buffer_pct_by_family ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        P10-P90 bands are calibrated on 2 backtest origins (12-14 months per horizon bucket); treat as indicative, not a guaranteed 80% interval.
      </div>
      <KpiGrid>
        <Kpi tone="forecast" label={`P50 plan (${horizon} months)`} value={fmtNum(tot.p50)} sub={fmtMoney(tot.rev50)} />
        <Kpi tone="warning" label="Cover to P90" value={fmtNum(tot.p90 - tot.p50)} sub={`+${fmtPct(tot.p50 ? (tot.p90 / tot.p50 - 1) * 100 : null)} buffer`} />
        <Kpi tone="history" label="P90 procurement total" value={fmtNum(tot.p90)} sub={fmtMoney(tot.rev90)} />
        <Kpi label="Buffer value at P90" value={fmtMoney(tot.rev90 - tot.rev50)} />
      </KpiGrid>
      <Panel title="Monthly procurement plan" subtitle={`${selectionLabel(names)} · Aggregate P50 demand plus backtest-calibrated P90 cover buffer`}>
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={plan} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis tickFormatter={(v: number) => fmtNum(v, 0)} width={52} {...axisProps} />
              <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="p50" name="P50 plan" stackId="a" fill={C.forecast} {...chartAnim()} />
              <Bar dataKey="cover" name="Cover to P90" stackId="a" fill={C.band} radius={[3, 3, 0, 0]} {...chartAnim()} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="SKU-level (unpooled) P90 cover, order only for long lead-time or single-source parts" subtitle="Direct leaf quantile P90 minus P50 (sums exceed aggregate P90 due to portfolio diversification)">
          <SortableTable
            rows={bySku}
            rowKey={(r) => r.sku}
            initialSort="buffer"
            cols={[
              { key: "sku", label: "SKU", value: (r) => r.sku },
              { key: "fam", label: "Family", value: (r) => r.family },
              { key: "p50", label: "P50", align: "right", value: (r) => r.p50, render: (r) => fmtNum(r.p50) },
              { key: "p90", label: "P90", align: "right", value: (r) => r.p90, render: (r) => fmtNum(r.p90) },
              { key: "buffer", label: "Buffer units", align: "right", value: (r) => r.buffer, render: (r) => fmtNum(r.buffer) },
              { key: "pct", label: "Buffer %", align: "right", value: (r) => r.pct, render: (r) => fmtPct(r.pct) },
            ]}
          />
        </Panel>
        <Panel title="P90 buffer by family" subtitle="shrunk toward pooled buffer; small samples">
          <ul className="space-y-2 text-sm">
            {famBuf.map((b) => (
              <li key={b.family} className="flex items-center justify-between">
                <span className={names.family === b.family ? "font-semibold" : ""}>{b.family}</span>
                <Badge tone="forecast" title={`n=${b.n ?? 38} (raw +${b.raw_pct ?? b.buffer_pct}%)`}>
                  +{b.buffer_pct}%
                  <span className="ml-1 text-[10px] opacity-70">n={b.n ?? 38}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
