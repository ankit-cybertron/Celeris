import { chartAnim } from "@/lib/motion";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Delta, Kpi, KpiGrid, MissingFile, Panel } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip, yearTicks } from "@/components/dashboard/charts";
import { Slider } from "@/components/ui/slider";
import { whatIfFactor } from "@/lib/whatif";
import { fmtMoney, fmtNum } from "@/lib/format";

const nice = (s: string) => s.replace(/_/g, " ");

export function WhatIfView() {
  const { data, pts, names, config, horizon } = useDashboard();
  const wcfg = config.what_if;
  const { months, last_hist: lh } = data.cube;
  const lagsAll = useMemo(() => (data.insights?.lags ?? []).filter((l) => l.family === "ALL"), [data.insights]);
  const [ind, setInd] = useState(wcfg.indicator ?? "");
  const lag = lagsAll.find((l) => l.indicator === ind) ?? lagsAll[0];
  const [delta, setDelta] = useState(wcfg.shock);

  const res = useMemo(() => {
    if (!lag) return null;
    let base = 0, wi = 0, baseR = 0, wiR = 0;
    const rows = pts.filter((p) => p.idx >= lh - 36).map((p) => {
      const h = p.idx - lh;
      const fac = h >= 1 ? whatIfFactor(h, lag.best_lag, lag.beta, delta) : 1;
      if (h >= 1 && p.p50 != null) { base += p.p50; wi += p.p50 * fac; baseR += p.rev50 ?? 0; wiR += (p.rev50 ?? 0) * fac; }
      return {
        month: p.month,
        history: p.idx <= lh ? p.demand : null,
        baseline: p.idx === lh ? p.demand : p.p50,
        whatif: p.idx === lh ? p.demand : p.p50 != null ? p.p50 * fac : null,
        band: p.p10 != null && p.p90 != null ? [p.p10, p.p90] : null,
      };
    });
    return { rows, base, wi, baseR, wiR };
  }, [pts, lh, lag, delta]);

  if (!data.insights) return <MissingFile name="insights.json" />;
  if (!lag || !res) return <MissingFile name="insights.json lags (family ALL)" />;
  const effectPct = lag.beta * delta * 100;

  return (
    <div className="space-y-4">
      <Panel title="Scenario" subtitle={`Uses the total-demand (ALL) beta and best lag for the chosen indicator · ${selectionLabel(names)}`}>
        <div className="grid gap-6 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Indicator</span>
            <select value={lag.indicator} onChange={(e) => setInd(e.target.value)} className="w-full rounded-md border bg-card px-2.5 py-2 text-sm">
              {lagsAll.map((l) => <option key={l.indicator} value={l.indicator}>{nice(l.indicator)}</option>)}
            </select>
          </label>
          <div className="md:col-span-2">
            <div className="mb-2 flex justify-between text-xs text-muted-foreground">
              <span>Change in {nice(lag.indicator)}</span>
              <span className="tabular text-base font-medium text-foreground">{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span>
            </div>
            <Slider aria-label="Indicator change" min={wcfg.min} max={wcfg.max} step={wcfg.step} value={[delta]} onValueChange={(v) => setDelta(v[0] ?? 0)} />
            <p className="mt-3 text-xs text-muted-foreground">
              beta {lag.beta} per unit · best lag {lag.best_lag} months · r {lag.corr.toFixed(2)} → demand {effectPct >= 0 ? "+" : ""}{effectPct.toFixed(1)}% from {months[lh + Math.max(1, lag.best_lag)]} onward
            </p>
          </div>
        </div>
      </Panel>

      <KpiGrid>
        <Kpi tone="forecast" label={`Baseline ${horizon}-month units`} value={fmtNum(res.base)} />
        <Kpi tone="history" label={`What-if ${horizon}-month units`} value={fmtNum(res.wi)} />
        <Kpi tone={res.wi >= res.base ? "success" : "danger"} label="Unit impact" value={fmtNum(res.wi - res.base)} sub={<Delta v={res.base ? (res.wi / res.base - 1) * 100 : null} />} />
        <Kpi tone={res.wiR >= res.baseR ? "success" : "danger"} label="Revenue impact" value={fmtMoney(res.wiR - res.baseR)} />
      </KpiGrid>

      <Panel title="Baseline vs what-if" subtitle={`Last 3 years of history and the ${horizon}-month forecast`}>
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={res.rows} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" ticks={yearTicks(res.rows.map((r) => r.month))} tickFormatter={(m: string) => m.slice(0, 4)} {...axisProps} />
              <YAxis tickFormatter={(v: number) => fmtNum(v, 0)} width={52} {...axisProps} />
              <Tooltip content={<GenericTip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine x={months[lh] ?? ""} stroke={C.muted} strokeDasharray="4 4" label={{ value: "forecast →", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11, dx: 6, dy: -14 }} />
              <Area dataKey="band" name="Baseline P10–P90" stroke="none" fill={C.band} fillOpacity={0.4} {...chartAnim()} />
              <Line dataKey="history" name="History" stroke={C.history} strokeWidth={2} dot={false} {...chartAnim()} />
              <Line dataKey="baseline" name="Baseline P50" stroke={C.forecast} strokeWidth={2} strokeDasharray="6 4" dot={false} {...chartAnim()} />
              <Line dataKey="whatif" name="What-if" stroke={C.series[3]} strokeWidth={2.25} dot={false} {...chartAnim()} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
