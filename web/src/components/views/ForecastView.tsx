import { chartAnim } from "@/lib/motion";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Kpi, KpiGrid, MissingFile, Panel, SortableTable } from "@/components/dashboard/ui";
import { axisProps, C, shortCategoryLabel, Timeline, timelineRows, TipBox, TipRow } from "@/components/dashboard/charts";
import { intervalLevel } from "@/lib/engine";
import { isNaive, methodSummary, pivotDim, primaryMethod } from "@/lib/backtest";
import { fmtRatio } from "@/lib/format";

function RatioTip({ active, payload, label, prefix = "" }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string | number; prefix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <TipBox title={`${prefix}${label}`}>
      {payload.map((p, i) => <TipRow key={i} color={p.color} label={String(p.name)} value={fmtRatio(p.value, 1)} />)}
    </TipBox>
  );
}

export function ForecastView() {
  const { data, pts, names, filters } = useDashboard();
  const { months, last_hist: lh } = data.cube;
  const bt = data.backtest;
  const rows = useMemo(() => timelineRows(pts, lh, "units"), [pts, lh]);
  const level = intervalLevel(filters);

  const derived = useMemo(() => {
    if (!bt) return null;
    const methods = methodSummary(bt);
    const main = primaryMethod(bt, data.meta);
    const mainRow = methods.find((m) => m.method === main);
    return { methods, main, mainRow, h: pivotDim(bt.by_dim, "h"), fam: pivotDim(bt.by_dim, "fam"), reg: pivotDim(bt.by_dim, "Region"), ch: pivotDim(bt.by_dim, "Sales_Channel") };
  }, [bt, data.meta]);

  if (!bt || !derived) return <MissingFile name="backtest.json" />;
  const { methods, main, mainRow, h } = derived;
  const cov = bt.coverage?.[0];
  const covEmp = cov ? Number(cov["empirical"] ?? cov["actual"] ?? cov["coverage"] ?? NaN) : NaN;
  const covNom = cov ? Number(cov["nominal"] ?? NaN) : NaN;
  const methodColor = (m: string) => (isNaive(m) ? C.muted : m === main ? C.forecast : C.series[(h.methods.indexOf(m) + 2) % 6]!);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        P10-P90 bands are calibrated on 2 backtest origins (12-14 months per horizon bucket); treat as indicative, not a guaranteed 80% interval.
      </div>
      <KpiGrid>
        <Kpi tone="forecast" label="Backtest WAPE" value={fmtRatio(mainRow?.wape)} sub={main ?? undefined} />
        <Kpi tone="history" label="Backtest bias" value={fmtRatio(mainRow?.bias, 1, true)} sub="positive = over-forecast" />
        <Kpi tone="success" label="Family × region × month WAPE" value={fmtRatio(bt.aggregate?.[0]?.value)} sub={bt.aggregate?.[0]?.metric ?? "Aggregate level"} />
        <Kpi tone="warning" label="P10–P90 coverage" value={fmtRatio(covEmp)} sub={Number.isFinite(covNom) ? `nominal ${fmtRatio(covNom, 0)}${cov?.["level"] ? ` · ${cov["level"]}` : ""}` : undefined} />
      </KpiGrid>

      <Panel title="Forecast vs history" subtitle={`${selectionLabel(names)} · interval ${level ? `scaled from backtest (${level.replace("_", " × ")} level)` : "summed from leaf P10/P90"}`}>
        <Timeline rows={rows} months={months} lh={lh} height={300} />
      </Panel>

      <Panel title="Accuracy by forecast horizon" subtitle="WAPE (lines) and bias (bars) for months ahead 1–19, model vs seasonal naive">
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={h.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="key" {...axisProps} label={{ value: "months ahead", position: "insideBottomRight", offset: -2, fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tickFormatter={(v: number) => fmtRatio(v, 0)} width={44} {...axisProps} />
              <Tooltip content={<RatioTip prefix="h = " />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke={C.muted} />
              {h.methods.map((m) => <Bar key={`${m}_b`} dataKey={`${m}_bias`} name={`${m} bias`} fill={methodColor(m)} fillOpacity={0.35} {...chartAnim()} />)}
              {h.methods.map((m) => <Line key={m} dataKey={m} name={`${m} WAPE`} stroke={methodColor(m)} strokeWidth={2} strokeDasharray={isNaive(m) ? "5 4" : undefined} dot={false} {...chartAnim()} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        {([
          ["By product family", derived.fam, names.family],
          ["By region", derived.reg, names.region],
          ["By sales channel", derived.ch, names.channel],
        ] as const).map(([title, piv, sel]) => (
          <Panel key={title} title={title} subtitle={sel ? `Highlighting ${sel}` : "WAPE, model vs seasonal naive"}>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={piv.rows} margin={{ top: 8, right: 8, left: 12, bottom: 28 }}>
                  <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    {...axisProps}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={52}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickFormatter={shortCategoryLabel}
                  />
                  <YAxis tickFormatter={(v: number) => fmtRatio(v, 0)} width={40} {...axisProps} />
                  <Tooltip content={<RatioTip />} cursor={{ fill: "var(--muted)" }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  {piv.methods.map((m) => (
                    <Bar key={m} dataKey={m} name={m} fill={methodColor(m)} radius={[3, 3, 0, 0]} {...chartAnim()}>
                      {piv.rows.map((r, i) => <Cell key={i} fillOpacity={!sel || r["key"] === sel ? 1 : 0.3} />)}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Method comparison" subtitle="Averaged over backtest origins">
          <SortableTable
            rows={methods}
            rowKey={(r) => r.method}
            initialSort="wape"
            initialDir="asc"
            cols={[
              { key: "method", label: "Method", value: (r) => r.method, render: (r) => <span className={r.method === main ? "font-semibold text-accent-foreground" : ""}>{r.method}{r.method === main ? " ★" : ""}</span> },
              { key: "wape", label: "WAPE", align: "right", value: (r) => r.wape, render: (r) => fmtRatio(r.wape) },
              { key: "bias", label: "Bias", align: "right", value: (r) => r.bias, render: (r) => fmtRatio(r.bias, 1, true) },
              { key: "vs", label: "vs naive", align: "right", value: (r) => r.vsNaive, render: (r) => (r.vsNaive == null ? "–" : `${r.vsNaive.toFixed(1)}% better`) },
              { key: "origins", label: "Origins", align: "right", value: (r) => r.origins },
            ]}
          />
        </Panel>
        <Panel title="Feature importance" subtitle="Share of model gain">
          <div style={{ height: Math.max(220, (bt.importance?.length ?? 0) * 24) }}>
            <ResponsiveContainer>
              <BarChart data={bt.importance} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => v.toFixed(2)} {...axisProps} />
                <YAxis type="category" dataKey="feature" width={170} {...axisProps} />
                <Tooltip content={({ active, payload, label }) => active && payload?.[0] ? <TipBox title={label}><TipRow color={C.history} label="Gain" value={Number(payload[0].value).toFixed(3)} /></TipBox> : null} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="gain" name="Gain" fill={C.history} radius={[0, 3, 3, 0]} {...chartAnim()} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
