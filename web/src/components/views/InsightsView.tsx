import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { Badge, Delta, Empty, Kpi, KpiGrid, MissingFile, Panel, SortableTable } from "@/components/dashboard/ui";
import { fmtMoney, fmtNum, fmtPct, MONTH_NAMES } from "@/lib/format";
import type { OutlookRow } from "@/lib/types";
import { cn } from "@/lib/utils";

function Outlook({ rows, sel }: { rows: OutlookRow[]; sel: string | null }) {
  return (
    <SortableTable<OutlookRow>
      rows={rows}
      rowKey={(r) => r.key}
      initialSort="next"
      maxHeight={260}
      selectedKey={sel}
      cols={[
        { key: "key", label: "Segment", value: (r) => r.key },
        { key: "last", label: "Last 12m", align: "right", value: (r) => r.last12, render: (r) => fmtNum(r.last12) },
        { key: "next", label: "Next 12m", align: "right", value: (r) => r.next12, render: (r) => fmtNum(r.next12) },
        { key: "g", label: "Growth", align: "right", value: (r) => r.growth_pct, render: (r) => <Delta v={r.growth_pct} /> },
      ]}
    />
  );
}

export function InsightsView() {
  const { data, names, matchRow } = useDashboard();
  const f = data.insights;
  if (!f) return <MissingFile name="insights.json" />;
  const i = f.insights;
  const headline = Array.isArray(i.headline) ? i.headline : [i.headline];
  const movers = (rows: OutlookRow[]) => rows.filter((r) => matchRow({ SKU_ID: r.key, Product_Family: r.family ?? null }));
  const growth = movers(i.top_growth ?? []), decline = movers(i.top_decline ?? []);
  const leaders = (i.macro_leaders ?? []).filter((l) => !names.family || l.family === names.family || l.family === "ALL");

  return (
    <div className="space-y-4">
      <section className="card-surface overflow-hidden">
        <div className="border-l-4 border-l-forecast p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><Lightbulb className="size-4 text-forecast" aria-hidden /> Headline insights</div>
          <ul className="grid gap-3 md:grid-cols-2">
            {headline.map((h, n) => (
              <li key={n} className="flex gap-3 text-sm leading-relaxed">
                <span className="tabular mt-0.5 text-xs text-forecast">{String(n + 1).padStart(2, "0")}</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <KpiGrid>
        <Kpi tone="danger" label="Stockout lost revenue" value={fmtMoney(i.stockouts?.lost_revenue)} sub={`${fmtNum(i.stockouts?.lost_units)} units lost`} />
        <Kpi tone="history" label="Price effect in plan" value={i.price_effect?.price_change_pct != null ? `${i.price_effect.price_change_pct > 0 ? "+" : ""}${i.price_effect.price_change_pct.toFixed(1)}%` : "–"} sub="announced January price rises" />
        <Kpi tone="warning" label="Lifecycle changes" value={`${i.lifecycle?.eol ?? 0} EOL · ${i.lifecycle?.launches ?? 0} new`} sub={`${i.lifecycle?.discontinued ?? 0} discontinued`} />
        <Kpi tone="forecast" label="Strongest macro leader" value={leaders[0]?.indicator.replace(/_/g, " ") ?? "–"} sub={leaders[0] ? `${leaders[0].family} · lag ${leaders[0].best_lag}m · r ${leaders[0].corr.toFixed(2)}` : undefined} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel title="Outlook by product family"><Outlook rows={i.outlook_Product_Family ?? []} sel={names.family} /></Panel>
        <Panel title="Outlook by region"><Outlook rows={i.outlook_Region ?? []} sel={names.region} /></Panel>
        <Panel title="Outlook by sales channel"><Outlook rows={i.outlook_Sales_Channel ?? []} sel={names.channel} /></Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {([["Top growth SKUs", growth, TrendingUp, "text-success"], ["Top declining SKUs", decline, TrendingDown, "text-danger"]] as const).map(([t, rows, Icon, cls]) => (
          <Panel key={t} title={<span className="flex items-center gap-2"><Icon className={cn("size-4", cls)} aria-hidden />{t}</span>} subtitle="Next 12m vs last 12m">
            {rows.length ? (
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.key} className="flex items-center justify-between py-2 text-sm">
                    <span><span className="font-medium">{r.key}</span> <span className="text-xs text-muted-foreground">{r.family}</span></span>
                    <span className="flex items-center gap-4"><span className="tabular text-xs text-muted-foreground">{fmtNum(r.last12)} → {fmtNum(r.next12)}</span><Delta v={r.growth_pct} /></span>
                  </li>
                ))}
              </ul>
            ) : <Empty />}
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Seasonality & holiday dips">
          <div className="mb-3 grid grid-cols-6 gap-1">
            {(i.season_index ?? []).map((s) => (
              <div key={s.month} className={cn("rounded-md px-1 py-1.5 text-center", s.index >= 1 ? "bg-history-tint" : "bg-forecast-tint")}>
                <div className="text-[10px] text-muted-foreground">{MONTH_NAMES[s.month - 1]}</div>
                <div className="tabular text-xs">{s.index.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <ul className="space-y-1.5 text-sm">
            {(i.holiday_dips_pct ?? []).map((h) => (
              <li key={h.holiday} className="flex justify-between"><span>{h.holiday}</span><span className="tabular text-danger">{fmtPct(h.dip_pct, 1, true)}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Stockouts, price & buffers">
          <ul className="space-y-1.5 text-sm">
            {(i.stockouts?.by_reason ?? []).map((r) => (
              <li key={r.reason} className="flex justify-between"><span>{r.reason}</span><span className="tabular">{fmtMoney(r.lost_revenue)}</span></li>
            ))}
          </ul>
          <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{i.price_effect?.note}</p>
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            {(i.p90_buffer_pct_by_family ?? []).map((b) => (
              <Badge key={b.family} tone={names.family === b.family ? "forecast" : "muted"} title={`n=${b.n ?? 38} (raw +${b.raw_pct ?? b.buffer_pct}%)`}>
                {b.family}: +{b.buffer_pct}% to P90 <span className="ml-1 text-[10px] opacity-70">n={b.n ?? 38}</span>
              </Badge>
            ))}
          </div>
        </Panel>
        <Panel title="Macro leaders & lifecycle">
          <ul className="space-y-1.5 text-sm">
            {leaders.slice(0, 5).map((l) => (
              <li key={`${l.family}-${l.indicator}`} className="flex justify-between gap-2"><span>{l.indicator.replace(/_/g, " ")} <span className="text-xs text-muted-foreground">→ {l.family}</span></span><span className="tabular text-xs">lag {l.best_lag}m · r {l.corr.toFixed(2)}</span></li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 border-t pt-3 text-sm text-muted-foreground">
            {(i.lifecycle?.notes ?? []).map((n) => <li key={n}>• {n}</li>)}
          </ul>
        </Panel>
      </div>

      <Panel title="Planner actions">
        <ol className="grid gap-2 md:grid-cols-2">
          {(i.planner_actions ?? []).map((a, n) => (
            <li key={n} className="flex gap-3 rounded-lg bg-muted p-3 text-sm"><span className="tabular font-semibold text-primary">{n + 1}</span>{a}</li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
