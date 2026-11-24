import { chartAnim } from "@/lib/motion";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, selectionLabel } from "@/components/dashboard/DashboardContext";
import { Badge, Empty, Kpi, KpiGrid, MissingFile, Panel, SortableTable } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip, Timeline, timelineRows } from "@/components/dashboard/charts";
import { fmtNum, fmtPct } from "@/lib/format";
import type { AnomalyRow, EventRow } from "@/lib/types";

export function AnomalyView() {
  const { data, pts, names, matchRow } = useDashboard();
  const { months, last_hist: lh } = data.cube;
  const reg = data.anomalies?.register ?? [];
  const types = useMemo(() => [...new Set(reg.map((r) => r.type))].sort(), [reg]);
  const color = (t: string) => C.series[(types.indexOf(t) + 2) % C.series.length]!;
  // cleaning-error types start hidden so real events / structural flags stay readable; tick them to show
  const [off, setOff] = useState<Set<string>>(() => new Set(reg.filter((r) => /error/i.test(r.class)).map((r) => r.type)));

  const inScope = useMemo(() => reg.filter((r) => matchRow(r)), [reg, matchRow]);
  const shown = useMemo(() => inScope.filter((r) => !off.has(r.type)), [inScope, off]);

  const { rows, byMonth } = useMemo(() => {
    const base = timelineRows(pts, lh, "units");
    const byMonth = new Map<string, AnomalyRow[]>();
    for (const a of shown) {
      if (!/^\d{4}-\d{2}$/.test(a.date_start)) continue;
      const arr = byMonth.get(a.date_start) ?? [];
      arr.push(a);
      byMonth.set(a.date_start, arr);
    }
    const rows = base.map((r) => {
      const list = byMonth.get(r.month);
      if (!list) return r;
      const out: typeof r = { ...r };
      for (const a of list) out[`a_${a.type}`] = r.demand ?? r.p50;
      return out;
    });
    return { rows, byMonth };
  }, [pts, lh, shown]);

  if (!data.anomalies) return <MissingFile name="anomalies.json" />;

  const byType = types.map((t) => ({ type: t, count: inScope.filter((r) => r.type === t).length }));
  const yearMap = new Map<string, number>();
  for (const a of shown) {
    const y = /^\d{4}/.test(a.date_start) ? a.date_start.slice(0, 4) : "Series-level";
    yearMap.set(y, (yearMap.get(y) ?? 0) + 1);
  }
  const byYear = [...yearMap.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year));
  const events = data.anomalies.events ?? [];
  const eventCols = events.length ? Object.keys(events[0]!) : [];

  return (
    <div className="space-y-4">
      <KpiGrid>
        <Kpi tone="warning" label="Anomalies in selection" value={inScope.length} sub={selectionLabel(names)} />
        <Kpi label="Shown (type filter)" value={shown.length} />
        <Kpi tone="danger" label="Data errors" value={inScope.filter((r) => /error/i.test(r.class)).length} />
        <Kpi tone="history" label="Real events logged" value={events.length} />
      </KpiGrid>

      <Panel
        title="Demand with flagged anomalies"
        subtitle="Markers sit on the selection's demand line; hover for type, reason and recommended action"
        actions={
          <fieldset className="flex flex-wrap gap-3 text-xs">
            <legend className="sr-only">Anomaly types</legend>
            {types.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!off.has(t)}
                  onChange={() => { const n = new Set(off); if (n.has(t)) n.delete(t); else n.add(t); setOff(n); }}
                  className="size-3.5 accent-primary"
                />
                <span className="inline-block size-2.5 rounded-full" style={{ background: color(t) }} />
                {t}
              </label>
            ))}
          </fieldset>
        }
      >
        <Timeline
          rows={rows}
          months={months}
          lh={lh}
          height={340}
          extraTooltip={(m) => {
            const list = byMonth.get(m);
            if (!list?.length) return null;
            return (
              <div className="mt-2 space-y-1.5 border-t pt-2">
                {list.slice(0, 4).map((a) => (
                  <div key={a.anomaly_id}>
                    <div className="flex items-center gap-1.5 font-medium"><span className="inline-block size-2 rounded-full" style={{ background: color(a.type) }} />{a.type} · {a.SKU_ID ?? "all"}{a.Region ? ` · ${a.Region}` : ""}</div>
                    <div className="text-muted-foreground">{a.reason}</div>
                    <div className="text-muted-foreground">→ {a.action}</div>
                  </div>
                ))}
                {list.length > 4 && <div className="text-muted-foreground">+{list.length - 4} more</div>}
              </div>
            );
          }}
        >
          {types.filter((t) => !off.has(t)).map((t) => (
            <Line key={t} dataKey={`a_${t}`} name={t} stroke="transparent" legendType="none" dot={{ r: 5, fill: color(t), stroke: "var(--card)", strokeWidth: 1.5 }} activeDot={{ r: 7, fill: color(t) }} {...chartAnim()} />
          ))}
        </Timeline>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Anomalies by type" subtitle="In the current selection">
          <SmallBars data={byType} x="type" y="count" colorOf={(d) => color(String(d.type))} />
        </Panel>
        <Panel title="Anomalies by year" subtitle="Types currently shown">
          <SmallBars data={byYear} x="year" y="count" colorOf={() => C.history} />
        </Panel>
      </div>

      <Panel title="Anomaly register" subtitle={`${shown.length} entries · click headers to sort`}>
        <SortableTable<AnomalyRow>
          rows={shown}
          rowKey={(r) => r.anomaly_id}
          initialSort="date"
          limit={100}
          cols={[
            { key: "id", label: "ID", value: (r) => r.anomaly_id },
            { key: "type", label: "Type", value: (r) => r.type, render: (r) => <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: color(r.type) }} />{r.type}</span> },
            { key: "class", label: "Class", value: (r) => r.class, render: (r) => <Badge tone={/error/i.test(r.class) ? "danger" : /event/i.test(r.class) ? "history" : "muted"}>{r.class}</Badge> },
            { key: "date", label: "Start", value: (r) => r.date_start },
            { key: "end", label: "End", value: (r) => r.date_end },
            { key: "sku", label: "SKU", value: (r) => r.SKU_ID },
            { key: "reg", label: "Region", value: (r) => r.Region },
            { key: "cus", label: "Customer", value: (r) => r.Customer_Name },
            { key: "obs", label: "Observed", align: "right", value: (r) => r.value_observed, render: (r) => fmtNum(r.value_observed) },
            { key: "exp", label: "Expected", align: "right", value: (r) => r.value_expected, render: (r) => fmtNum(r.value_expected) },
            { key: "imp", label: "Impact", align: "right", value: (r) => r.impact_pct, render: (r) => fmtPct(r.impact_pct, 1, true) },
            { key: "reason", label: "Reason", value: (r) => r.reason },
            { key: "action", label: "Action", value: (r) => r.action },
          ]}
        />
      </Panel>

      <Panel title="Real-event impact" subtitle="External events and their estimated demand impact">
        {events.length ? (
          <SortableTable<EventRow>
            rows={events}
            rowKey={(_, i) => String(i)}
            cols={eventCols.map((k) => ({
              key: k,
              label: k.replace(/_/g, " "),
              align: typeof events[0]![k] === "number" ? "right" : "left",
              value: (r) => { const v = r[k]; return typeof v === "boolean" ? String(v) : v; },
              ...(k.includes("pct") ? { render: (r: EventRow) => fmtPct(r[k] as number, 1, true) } : {}),
            }))}
          />
        ) : <Empty>No events logged.</Empty>}
      </Panel>
    </div>
  );
}

function SmallBars<T extends Record<string, unknown>>({ data, x, y, colorOf }: { data: T[]; x: string; y: string; colorOf: (d: T) => string }) {
  if (!data.length) return <Empty />;
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={x} {...axisProps} interval={0} />
          <YAxis allowDecimals={false} width={32} {...axisProps} />
          <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey={y} name="Anomalies" radius={[3, 3, 0, 0]} {...chartAnim()} shape={(p: unknown) => {
            const { x: bx, y: by, width, height, payload } = p as { x: number; y: number; width: number; height: number; payload: T };
            return <rect x={bx} y={by} width={width} height={height} rx={3} fill={colorOf(payload)} />;
          }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
