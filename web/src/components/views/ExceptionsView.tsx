import { useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { Badge, Delta, Empty, Kpi, KpiGrid, Panel, SortableTable } from "@/components/dashboard/ui";
import { Slider } from "@/components/ui/slider";
import { growthPct } from "@/lib/engine";
import { isException } from "@/lib/exceptions";
import { fmtNum } from "@/lib/format";
import type { ExceptionFlag } from "@/lib/types";

export function useExceptionRows(threshold: number, minVol: number) {
  const { engine, stats, data } = useDashboard();
  return useMemo(() => stats.filter((s) => isException(s, threshold, minVol)).map((s) => ({
    id: s.id,
    SKU_ID: engine.dimLabel("sku", s.sku),
    Product_Family: engine.dimLabel("family", s.fam),
    Region: engine.dimLabel("region", s.reg),
    Sales_Channel: engine.dimLabel("channel", s.ch),
    Customer_Name: s.cus >= 0 ? engine.dimLabel("customer", s.cus) : "",
    last12: Math.round(s.last12),
    next12: Math.round(s.next12),
    change_pct: growthPct(s.last12, s.next12),
    rules: [...s.rules].map((r) => data.cube.rules[r - 1] ?? `rule ${r}`).join("; "),
  })), [stats, threshold, minVol, engine, data]);
}

export function ExceptionsView() {
  const { data, matchRow, stats, config } = useDashboard();
  const ecfg = config.exceptions;
  const [threshold, setThreshold] = useState(ecfg.min_change_pct);
  const [minVol, setMinVol] = useState(ecfg.min_volume);
  const rows = useExceptionRows(threshold, minVol);
  const flags = useMemo(() => (data.exceptions ?? []).filter((f) => matchRow(f)), [data.exceptions, matchRow]);
  const up = rows.filter((r) => (r.change_pct ?? 1) > 0).length;

  return (
    <div className="space-y-4">
      <Panel title="Exception rules" subtitle="Flag series whose next-12-month forecast moves sharply vs the last 12 months">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Minimum change</span><span className="tabular text-base text-foreground">±{threshold}%</span></div>
            <Slider aria-label="Minimum change percent" min={5} max={100} step={5} value={[threshold]} onValueChange={(v) => setThreshold(v[0] ?? ecfg.min_change_pct)} />
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Minimum 12-month volume</span><span className="tabular text-base text-foreground">{fmtNum(minVol)} units</span></div>
            <Slider aria-label="Minimum volume" min={0} max={ecfg.max_volume} step={25} value={[minVol]} onValueChange={(v) => setMinVol(v[0] ?? 0)} />
          </div>
        </div>
      </Panel>
      <KpiGrid>
        <Kpi tone="warning" label="Exceptions" value={rows.length} sub={`of ${stats.length} series in view`} />
        <Kpi tone="success" label="Moving up" value={up} />
        <Kpi tone="danger" label="Moving down" value={rows.length - up} />
        <Kpi tone="history" label="Structural flags" value={flags.length} />
      </KpiGrid>
      <Panel title="Series exceptions" subtitle="Click headers to sort">
        <SortableTable
          rows={rows}
          rowKey={(r) => String(r.id)}
          initialSort="abs"
          limit={80}
          cols={[
            { key: "sku", label: "SKU", value: (r) => r.SKU_ID },
            { key: "reg", label: "Region", value: (r) => r.Region },
            { key: "ch", label: "Channel", value: (r) => r.Sales_Channel },
            { key: "cus", label: "Customer", value: (r) => r.Customer_Name || null },
            { key: "last", label: "Last 12m", align: "right", value: (r) => r.last12, render: (r) => fmtNum(r.last12) },
            { key: "next", label: "Next 12m", align: "right", value: (r) => r.next12, render: (r) => fmtNum(r.next12) },
            { key: "abs", label: "Change", align: "right", value: (r) => (r.change_pct == null ? Infinity : Math.abs(r.change_pct)), render: (r) => (r.change_pct == null ? <Badge tone="forecast">new</Badge> : <Delta v={r.change_pct} />) },
            { key: "rules", label: "Forecast rule", value: (r) => r.rules || null },
          ]}
        />
      </Panel>
      <Panel title="Structural flags" subtitle="From exceptions.json">
        {data.exceptions == null ? <Empty>exceptions.json is unavailable.</Empty> : (
          <SortableTable<ExceptionFlag>
            rows={flags}
            rowKey={(r, i) => `${r.SKU_ID}-${r.flag}-${i}`}
            initialSort="flag"
            initialDir="asc"
            cols={[
              { key: "flag", label: "Flag", value: (r) => r.flag, render: (r) => <Badge tone="warning">{r.flag}</Badge> },
              { key: "sku", label: "SKU", value: (r) => r.SKU_ID },
              { key: "reg", label: "Region", value: (r) => r.Region ?? "all" },
              { key: "ch", label: "Channel", value: (r) => r.Sales_Channel ?? "all" },
              { key: "cus", label: "Customer", value: (r) => r.Customer_Name ?? "all" },
              { key: "detail", label: "Detail", value: (r) => r.detail },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}
