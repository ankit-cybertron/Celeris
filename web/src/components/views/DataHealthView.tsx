import { chartAnim } from "@/lib/motion";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Badge, Kpi, KpiGrid, MissingFile, Panel, SortableTable } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip } from "@/components/dashboard/charts";
import { fmtInt, fmtNum } from "@/lib/format";
import type { DqIssue } from "@/lib/types";

const SEV_COLOR: Record<string, string> = { high: C.danger, medium: C.warning, low: C.success };
const sevTone = (s: string) => (s === "high" ? "danger" : s === "medium" ? "warning" : "success") as "danger" | "warning" | "success";
const pretty = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function DataHealthView() {
  const { data, pts, names } = useDashboard();
  const dq = data.dq;
  const lh = data.cube.last_hist;

  const sel = useMemo(() => {
    let missing = 0, zero = 0;
    for (const p of pts) {
      if (p.idx > lh) break;
      missing += p.missing;
      zero += p.zero;
    }
    const cells = pts.slice(0, lh + 1).reduce((a, p) => a + (p.demand != null ? 1 : 0), 0);
    return { missing, zero, cells };
  }, [pts, lh]);

  if (!dq) return <MissingFile name="dq.json" />;
  const s = dq.summary;
  const issues = [...dq.issues].sort((a, b) => b.rows_affected - a.rows_affected);
  const byFile = Object.entries(
    dq.issues.reduce<Record<string, number>>((acc, i) => ((acc[i.file] = (acc[i.file] ?? 0) + i.rows_affected), acc), {}),
  ).map(([file, rows]) => ({ file, rows })).sort((a, b) => b.rows - a.rows);
  const keys = [...new Set([...Object.keys(s.before ?? {}), ...Object.keys(s.after ?? {})])];
  const compare = keys.map((k) => ({ k, before: s.before?.[k] ?? null, after: s.after?.[k] ?? null }));

  return (
    <div className="space-y-4">
      <KpiGrid>
        <Kpi label="Raw rows" value={fmtNum(s.raw_rows)} sub={fmtInt(s.raw_rows)} />
        <Kpi tone="success" label="Observed rows after cleaning" value={fmtNum(s.clean_observed_rows)} sub={`Panel rows ${fmtInt(s.panel_rows)}`} />
        <Kpi tone="warning" label="Issue types" value={new Set(dq.issues.map((i) => i.issue)).size} sub={`${fmtInt(dq.issues.reduce((a, i) => a + i.rows_affected, 0))} rows affected`} />
        <Kpi tone="history" label="Series" value={fmtInt(s.series)} sub="SKU × Region grid (3,083 active series)" />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title="Issues by type" subtitle="Rows affected, coloured by severity">
          <div className="mb-2 flex gap-2">
            <Badge tone="danger">high</Badge><Badge tone="warning">medium</Badge><Badge tone="success">low</Badge>
          </div>
          <div style={{ height: Math.max(220, issues.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={issues} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => fmtNum(v, 0)} {...axisProps} />
                <YAxis type="category" dataKey="issue" width={190} {...axisProps} />
                <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="rows_affected" name="Rows affected" radius={[0, 3, 3, 0]} {...chartAnim()}>
                  {issues.map((i, n) => <Cell key={n} fill={SEV_COLOR[i.severity.toLowerCase()] ?? C.muted} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel className="xl:col-span-2" title="Issues by source file" subtitle="Rows affected">
          <div style={{ height: Math.max(220, byFile.length * 40) }}>
            <ResponsiveContainer>
              <BarChart data={byFile} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => fmtNum(v, 0)} {...axisProps} />
                <YAxis type="category" dataKey="file" width={140} {...axisProps} />
                <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="rows" name="Rows affected" fill={C.history} radius={[0, 3, 3, 0]} {...chartAnim()} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel className="xl:col-span-2" title="Before vs after cleaning" subtitle="248,248 raw - 3,682 dups - 46 dropped + 70 stockout-recovered = 244,590 observed">
          <SortableTable
            rows={compare}
            rowKey={(r) => r.k}
            cols={[
              { key: "k", label: "Check", value: (r) => pretty(r.k) },
              { key: "before", label: "Before", align: "right", value: (r) => r.before, render: (r) => fmtInt(r.before) },
              { key: "after", label: "After", align: "right", value: (r) => r.after, render: (r) => fmtInt(r.after) },
            ]}
          />
        </Panel>
        <Panel className="xl:col-span-3" title="Issue log" subtitle="Every detected issue and the cleaning action taken">
          <SortableTable<DqIssue>
            rows={dq.issues}
            rowKey={(r, i) => `${r.file}-${r.issue}-${i}`}
            initialSort="rows"
            cols={[
              { key: "file", label: "File", value: (r) => r.file },
              { key: "issue", label: "Issue", value: (r) => r.issue },
              { key: "rows", label: "Rows", align: "right", value: (r) => r.rows_affected, render: (r) => fmtInt(r.rows_affected) },
              { key: "sev", label: "Severity", value: (r) => ({ high: 3, medium: 2, low: 1 })[r.severity.toLowerCase()] ?? 0, render: (r) => <Badge tone={sevTone(r.severity.toLowerCase())}>{r.severity}</Badge> },
              { key: "action", label: "Action", value: (r) => r.action },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Current selection" subtitle={selectionLabel(names)}>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Months with data</div><div className="tabular text-lg">{fmtInt(sel.cells)}</div></div>
          <div><div className="text-xs text-muted-foreground">Unknown / missing series-months</div><div className="tabular text-lg">{fmtInt(sel.missing)}</div></div>
          <div><div className="text-xs text-muted-foreground">Zero-order series-months</div><div className="tabular text-lg">{fmtInt(sel.zero)}</div></div>
        </div>
      </Panel>
    </div>
  );
}
