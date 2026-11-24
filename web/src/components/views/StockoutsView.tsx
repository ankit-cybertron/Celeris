import { chartAnim } from "@/lib/motion";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Empty, Kpi, KpiGrid, Panel, SortableTable } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip, yearTicks } from "@/components/dashboard/charts";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import type { StockoutEvent } from "@/lib/types";

function group(rows: StockoutEvent[], key: (r: StockoutEvent) => string) {
  const g = new Map<string, { key: string; lost_units: number; lost_revenue: number; events: number }>();
  for (const r of rows) {
    const k = key(r);
    const e = g.get(k) ?? { key: k, lost_units: 0, lost_revenue: 0, events: 0 };
    e.lost_units += r.lost_units; e.lost_revenue += r.lost_revenue; e.events += 1;
    g.set(k, e);
  }
  return [...g.values()].sort((a, b) => b.lost_revenue - a.lost_revenue);
}

export function StockoutsView() {
  const { data, pts, names, matchRow } = useDashboard();
  const { months, last_hist: lh } = data.cube;
  const hist = useMemo(() => pts.slice(0, lh + 1), [pts, lh]);
  const k = useMemo(() => {
    let lost = 0, lostRev = 0, dem = 0, mths = 0;
    for (const p of hist) { lost += p.lost; lostRev += p.lostRev; dem += p.demand ?? 0; if (p.lost > 0) mths++; }
    return { lost, lostRev, share: dem > 0 ? (lost / dem) * 100 : null, mths };
  }, [hist]);
  const events = useMemo(() => (data.stockouts ?? []).filter((r) => matchRow(r)), [data.stockouts, matchRow]);
  const byReason = useMemo(() => group(events, (r) => r.reason), [events]);
  const byFamily = useMemo(() => group(events, (r) => r.Product_Family), [events]);
  const monthly = hist.map((p) => ({ month: p.month, lost: p.lost }));

  return (
    <div className="space-y-4">
      <KpiGrid>
        <Kpi tone="danger" label="Lost units (demand − shipped)" value={fmtNum(k.lost)} sub={selectionLabel(names)} />
        <Kpi tone="danger" label="Lost revenue" value={fmtMoney(k.lostRev)} />
        <Kpi tone="warning" label="Share of demand lost" value={fmtPct(k.share, 2)} />
        <Kpi label="Months with stockouts" value={k.mths} sub={`of ${lh + 1} history months`} />
      </KpiGrid>
      <Panel title="Lost sales by month" subtitle="Unconstrained demand minus shipped units">
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" ticks={yearTicks(months.slice(0, lh + 1))} tickFormatter={(m: string) => m.slice(0, 4)} {...axisProps} />
              <YAxis tickFormatter={(v: number) => fmtNum(v, 0)} width={44} {...axisProps} />
              <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="lost" name="Lost units" fill={C.danger} {...chartAnim()} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        {([["By reason", byReason], ["By product family", byFamily]] as const).map(([t, rows]) => (
          <Panel key={t} title={t} subtitle="Lost revenue from stockouts.json events">
            {data.stockouts == null ? <Empty>stockouts.json is unavailable.</Empty> : rows.length ? (
              <div style={{ height: Math.max(180, rows.length * 36) }}>
                <ResponsiveContainer>
                  <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v: number) => fmtMoney(v, 0)} {...axisProps} />
                    <YAxis type="category" dataKey="key" width={160} {...axisProps} />
                    <Tooltip content={<GenericTip money />} cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="lost_revenue" name="Lost revenue" fill={C.danger} radius={[0, 3, 3, 0]} {...chartAnim()} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty />}
          </Panel>
        ))}
      </div>
      <Panel title="Stockout events" subtitle={`${events.length} events`}>
        <SortableTable<StockoutEvent>
          rows={events}
          rowKey={(r, i) => `${r.month}-${r.SKU_ID}-${i}`}
          initialSort="rev"
          limit={60}
          cols={[
            { key: "month", label: "Month", value: (r) => r.month },
            { key: "sku", label: "SKU", value: (r) => r.SKU_ID },
            { key: "reg", label: "Region", value: (r) => r.Region },
            { key: "ch", label: "Channel", value: (r) => r.Sales_Channel },
            { key: "cus", label: "Customer", value: (r) => r.Customer_Name },
            { key: "reason", label: "Reason", value: (r) => r.reason },
            { key: "units", label: "Lost units", align: "right", value: (r) => r.lost_units, render: (r) => fmtNum(r.lost_units) },
            { key: "rev", label: "Lost revenue", align: "right", value: (r) => r.lost_revenue, render: (r) => fmtMoney(r.lost_revenue) },
          ]}
        />
      </Panel>
    </div>
  );
}
