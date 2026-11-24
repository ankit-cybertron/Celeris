import { chartAnim } from "@/lib/motion";
import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { Badge, Empty, Kpi, KpiGrid, MissingFile, Panel, SortableTable } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip, yearTicks } from "@/components/dashboard/charts";
import { lifecycleTone } from "./DemandExplorerView";
import { fmtNum } from "@/lib/format";
import type { LifecycleSku } from "@/lib/types";

export function LifecycleView() {
  const { data, engine, filters, names, matchRow } = useDashboard();
  const { months, last_hist: lh, dims } = data.cube;
  const all = data.lifecycle;
  const rows = useMemo(() => (all ?? []).filter((r) => matchRow({ SKU_ID: r.SKU_ID, Product_Family: r.Product_Family })), [all, matchRow]);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = names.sku ?? picked ?? rows.find((r) => r.predecessor || r.successor)?.SKU_ID ?? rows[0]?.SKU_ID ?? null;
  const cur = all?.find((r) => r.SKU_ID === sel);

  const chart = useMemo(() => {
    if (!cur) return { data: [] as Array<Record<string, number | string | null>>, skus: [] as string[] };
    const skus = [cur.predecessor, cur.SKU_ID, cur.successor].filter((s): s is string => !!s && dims.sku.includes(s));
    const out: Array<Record<string, number | string | null>> = months.map((m) => ({ month: m }));
    for (const s of skus) {
      const f = { ...filters, sku: dims.sku.indexOf(s), family: null };
      const pts = engine.monthly(f, engine.seriesMask(f));
      pts.forEach((p, i) => {
        const row = out[i]!;
        row[`${s} history`] = p.idx <= lh ? p.demand : null;
        row[`${s} forecast`] = p.idx >= lh ? (p.idx === lh ? p.demand : p.p50) : null;
      });
    }
    return { data: out, skus };
  }, [cur, dims.sku, months, filters, engine, lh]);

  if (!all) return <MissingFile name="lifecycle.json" />;
  const count = (re: RegExp) => rows.filter((r) => re.test(r.status)).length;
  const role = (s: string) => (s === cur?.predecessor ? "predecessor" : s === cur?.successor ? "successor" : "selected");

  return (
    <div className="space-y-4">
      <KpiGrid>
        <Kpi tone="success" label="Active SKUs" value={count(/active/i)} />
        <Kpi tone="warning" label="End-of-life" value={count(/eol/i)} />
        <Kpi tone="forecast" label="New launches" value={count(/launch|new/i)} />
        <Kpi tone="danger" label="Discontinued" value={count(/discont/i)} />
      </KpiGrid>

      <Panel title={cur ? `${cur.SKU_ID} lifecycle timeline` : "SKU timeline"} subtitle={cur ? `${cur.status}${cur.predecessor ? ` · predecessor ${cur.predecessor}` : ""}${cur.successor ? ` · successor ${cur.successor}` : ""} — click a row below to switch` : undefined}>
        {chart.skus.length ? (
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={chart.data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" ticks={yearTicks(months)} tickFormatter={(m: string) => m.slice(0, 4)} {...axisProps} />
                <YAxis tickFormatter={(v: number) => fmtNum(v, 0)} width={48} {...axisProps} />
                <Tooltip content={<GenericTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine x={months[lh] ?? ""} stroke={C.muted} strokeDasharray="4 4" label={{ value: "forecast →", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11, dx: 6, dy: -14 }} />
                {cur?.eol_date && <ReferenceLine x={cur.eol_date} stroke={C.danger} strokeDasharray="2 3" label={{ value: "EOL", position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }} />}
                {chart.skus.map((s) => {
                  const r = role(s);
                  const hc = r === "selected" ? C.history : r === "predecessor" ? C.series[5] : C.series[2];
                  const fc = r === "selected" ? C.forecast : hc;
                  return [
                    <Line key={`${s}h`} dataKey={`${s} history`} stroke={hc} strokeWidth={r === "selected" ? 2.25 : 1.5} dot={false} {...chartAnim()} />,
                    <Line key={`${s}f`} dataKey={`${s} forecast`} stroke={fc} strokeWidth={r === "selected" ? 2.25 : 1.5} strokeDasharray="6 4" dot={false} {...chartAnim()} />,
                  ];
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty>No demand data for this SKU in the current selection.</Empty>}
      </Panel>

      <Panel title="SKU master" subtitle="Status, launch / EOL dates and successor chain">
        <SortableTable<LifecycleSku>
          rows={rows}
          rowKey={(r) => r.SKU_ID}
          selectedKey={sel}
          onRowClick={(r) => setPicked(r.SKU_ID)}
          initialSort="fc"
          cols={[
            { key: "sku", label: "SKU", value: (r) => r.SKU_ID, render: (r) => <span className="font-medium">{r.SKU_ID}</span> },
            { key: "fam", label: "Family", value: (r) => r.Product_Family },
            { key: "status", label: "Status", value: (r) => r.status, render: (r) => <Badge tone={lifecycleTone(r.status)}>{r.status}</Badge> },
            { key: "launch", label: "Launch", value: (r) => r.launch_date },
            { key: "eol", label: "EOL", value: (r) => r.eol_date },
            { key: "pred", label: "Predecessor", value: (r) => r.predecessor },
            { key: "succ", label: "Successor", value: (r) => r.successor },
            { key: "first", label: "First sale", value: (r) => r.first_sale },
            { key: "last", label: "Last sale", value: (r) => r.last_sale },
            { key: "fc", label: "Forecast 19m", align: "right", value: (r) => r.forecast_19m, render: (r) => fmtNum(r.forecast_19m) },
          ]}
        />
      </Panel>
    </div>
  );
}
