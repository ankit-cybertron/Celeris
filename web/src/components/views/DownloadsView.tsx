import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Panel } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { useExceptionRows } from "./ExceptionsView";

export function DownloadsView() {
  const { data, engine, pts, stats, mask, names, matchRow, config } = useDashboard();
  const { cube } = data;
  const exc = useExceptionRows(config.exceptions.min_change_pct, config.exceptions.min_volume);
  const slug = [names.family, names.sku, names.region, names.channel, names.customer].filter(Boolean).join("_").replace(/[^\w-]+/g, "-") || "all";

  const exports: Array<{ name: string; desc: string; run: () => void }> = [
    {
      name: "Monthly timeline",
      desc: "History (shipped, demand, revenue) and forecast P10/P50/P90 by month",
      run: () => downloadCsv(`timeline_${slug}.csv`, pts.map((p) => ({ month: p.month, type: p.isFc ? "forecast" : "history", shipped: p.shipped, demand: p.demand, demand_revenue: p.demandRev, p10: p.p10, p50: p.p50, p90: p.p90, revenue_p50: p.rev50 }))),
    },
    {
      name: "Leaf forecast",
      desc: "Every series × month forecast row in the selection",
      run: () => {
        const F = cube.fc, d = cube.dims, out: Array<Record<string, unknown>> = [];
        for (let i = 0; i < F.m.length; i++) {
          if (!mask[engine.fcS[i]!]) continue;
          out.push({ month: cube.months[F.m[i]!], SKU_ID: d.sku[F.sku[i]!], Region: d.region[F.reg[i]!], Sales_Channel: d.channel[F.ch[i]!], Customer_Name: F.cus[i]! >= 0 ? d.customer[F.cus[i]!] : "", p10: F.p10[i], p50: F.p50[i], p90: F.p90[i], revenue_p50: F.r[i], rule: F.rule[i]! > 0 ? cube.rules[F.rule[i]! - 1] : "" });
        }
        downloadCsv(`forecast_${slug}.csv`, out);
      },
    },
    {
      name: "Mix by dimension",
      desc: "Last 12m vs next 12m by family, region and channel",
      run: () => downloadCsv(`mix_${slug}.csv`, (["family", "region", "channel"] as const).flatMap((dim) => engine.mix(stats, dim).map((r) => ({ dimension: dim, ...r })))),
    },
    {
      name: "Anomalies",
      desc: "Anomaly register rows in the selection",
      run: () => downloadCsv(`anomalies_${slug}.csv`, (data.anomalies?.register ?? []).filter((r) => matchRow(r)) as unknown as Array<Record<string, unknown>>),
    },
    {
      name: "Planner exceptions",
      desc: `Series moving ≥${config.exceptions.min_change_pct}% (min ${config.exceptions.min_volume} units)`,
      run: () => downloadCsv(`exceptions_${slug}.csv`, exc),
    },
  ];
  const sources = ["cube", "dq", "anomalies", "backtest", "insights", "stockouts", "lifecycle", "profile", "exceptions", "meta"];

  return (
    <div className="space-y-4">
      <Panel title="Competition submission" subtitle="The forecast file submitted for scoring">
        <Button asChild>
          <a href="/data/submission.csv" download>
            <Download aria-hidden /> Download submission.csv
          </a>
        </Button>
      </Panel>
      <Panel title="Export the current view" subtitle={`CSV files for: ${selectionLabel(names)}`}>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {exports.map((e) => (
            <li key={e.name} className="flex items-start justify-between gap-3 rounded-lg border p-4">
              <div className="flex gap-3">
                <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <div className="text-sm font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{e.desc}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={e.run} aria-label={`Export ${e.name}`}><Download aria-hidden /></Button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Source data files">
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => (
            <a key={s} href={`/data/${s}.json`} download className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
              <FileJson className="size-3.5 text-muted-foreground" aria-hidden /> {s}.json
              {data.failed.includes(`${s}.json`) && <span className="text-danger">(missing)</span>}
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );
}
