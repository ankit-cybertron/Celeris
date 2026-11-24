import { chartAnim } from "@/lib/motion";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, X } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { MissingFile, Panel } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip, yearTicks } from "@/components/dashboard/charts";
import { cn } from "@/lib/utils";

const nice = (s: string) => s.replace(/_/g, " ");

export function MacroView() {
  const { data, names } = useDashboard();
  const f = data.insights;
  const lags = f?.lags ?? [];
  const families = useMemo(() => [...new Set(lags.map((l) => l.family))].sort((a, b) => (a === "ALL" ? -1 : b === "ALL" ? 1 : a.localeCompare(b))), [lags]);
  const indicators = useMemo(() => [...new Set(lags.map((l) => l.indicator))], [lags]);
  const [ind, setInd] = useState<string>("");
  const indicator = ind || indicators[0] || "";
  const histEnd = data.cube.months[data.cube.last_hist];

  const path = useMemo(() => (f?.series ?? []).map((r) => {
    const d = String(r["Date"] ?? "").slice(0, 7);
    const v = typeof r[indicator] === "number" ? (r[indicator] as number) : null;
    const proj = r["projected"] === true || (histEnd ? d > histEnd : false);
    return { Date: d, actual: proj ? null : v, projected: proj || d === histEnd ? v : null };
  }), [f, indicator, histEnd]);

  if (!f) return <MissingFile name="insights.json" />;
  const share = f.insights.powertrain_share_by_year ?? [];
  const shareKeys = share.length ? Object.keys(share[0]!).filter((k) => k !== "year" && typeof share[0]![k] === "number") : [];

  return (
    <div className="space-y-4">
      <Panel title="Lead / lag heatmap" subtitle="Correlation of indicator (shifted by best lag) with family demand · ✓ = lag stable across early and late windows">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th scope="col" className="text-left font-semibold text-muted-foreground">Family</th>
                {indicators.map((i) => <th key={i} scope="col" className="px-1 text-center font-semibold text-muted-foreground">{nice(i)}</th>)}
              </tr>
            </thead>
            <tbody>
              {families.map((fam) => (
                <tr key={fam} className={cn(names.family && fam !== names.family && fam !== "ALL" && "opacity-40")}>
                  <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap">{fam === "ALL" ? "All demand" : fam}</th>
                  {indicators.map((i) => {
                    const l = lags.find((x) => x.family === fam && x.indicator === i);
                    if (!l) return <td key={i} className="rounded bg-muted" />;
                    const pct = Math.round(Math.abs(l.corr) * 75);
                    const base = l.corr >= 0 ? "var(--history)" : "var(--danger)";
                    return (
                      <td
                        key={i}
                        title={`${fam} × ${nice(i)}: r = ${l.corr}, best lag ${l.best_lag}m (early ${l.lag_early}, late ${l.lag_late}), beta ${l.beta}`}
                        className="rounded-md px-2 py-2 text-center"
                        style={{ background: `color-mix(in oklab, ${base} ${pct}%, var(--card))`, color: pct > 45 ? "var(--primary-foreground)" : "var(--foreground)" }}
                      >
                        <div className="tabular font-semibold">{l.corr.toFixed(2)}</div>
                        <div className="flex items-center justify-center gap-1 opacity-90">
                          lag {l.best_lag}m {l.stable ? <Check className="size-3" aria-label="stable" /> : <X className="size-3" aria-label="unstable" />}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title={`${nice(indicator)} path`}
          subtitle="Actual to history end, projection after"
          actions={
            <select aria-label="Indicator" value={indicator} onChange={(e) => setInd(e.target.value)} className="rounded-md border bg-card px-2 py-1 text-xs">
              {indicators.map((i) => <option key={i} value={i}>{nice(i)}</option>)}
            </select>
          }
        >
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={path} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="Date" ticks={yearTicks(path.map((p) => p.Date))} tickFormatter={(m: string) => m.slice(0, 4)} {...axisProps} />
                <YAxis domain={["auto", "auto"]} width={44} {...axisProps} />
                <Tooltip content={<GenericTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                {histEnd && <ReferenceLine x={histEnd} stroke={C.muted} strokeDasharray="4 4" label={{ value: "forecast →", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11, dx: 6, dy: -14 }} />}
                <Line dataKey="actual" name="Actual" stroke={C.history} strokeWidth={2} dot={false} {...chartAnim()} />
                <Line dataKey="projected" name="Projected" stroke={C.forecast} strokeWidth={2} strokeDasharray="6 4" dot={false} {...chartAnim()} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="xl:col-span-2" title="Powertrain share by year" subtitle="Share of new vehicle sales, %">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={share} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" {...axisProps} />
                <YAxis width={40} domain={[0, 100]} {...axisProps} />
                <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                {shareKeys.map((k, n) => <Bar key={k} dataKey={k} stackId="s" fill={[C.series[5], C.series[2], C.series[4], C.series[3]][n % 4]} {...chartAnim()} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
