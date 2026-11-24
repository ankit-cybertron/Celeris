import { chartAnim } from "@/lib/motion";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { Badge, Empty, Panel, SortableTable } from "@/components/dashboard/ui";
import { axisProps, C, GenericTip, TipBox, TipRow } from "@/components/dashboard/charts";
import { seasonality } from "@/lib/engine";
import { fmtNum, fmtPct, MONTH_NAMES } from "@/lib/format";
import type { ProfileRow } from "@/lib/types";

interface Node { name: string; size: number; children?: Map<string, Node> }

const LEVELS = ["Product family", "SKU", "Region", "Customer"];

export function lifecycleTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes("eol")) return "warning" as const;
  if (s.includes("discont")) return "danger" as const;
  if (s.includes("launch") || s.includes("new")) return "forecast" as const;
  return "success" as const;
}

export function DemandExplorerView() {
  const { data, engine, mask, pts, names, matchRow, filters, horizon } = useDashboard();
  const { cube } = data;
  const lh = cube.last_hist;
  const [path, setPath] = useState<string[]>([]);

  const tree = useMemo(() => {
    const root: Node = { name: "All", size: 0, children: new Map() };
    const H = cube.hist, d = cube.dims;
    for (let i = 0; i < H.m.length; i++) {
      const m = H.m[i]!;
      if (m <= lh - 12 || m > lh || !mask[engine.histS[i]!] || H.d[i]! <= 0) continue;
      const v = H.d[i]!;
      const keys = [d.family[cube.sku_family[H.sku[i]!] ?? -1] ?? "?", d.sku[H.sku[i]!] ?? "?", d.region[H.reg[i]!] ?? "?", H.cus[i]! >= 0 ? (d.customer[H.cus[i]!] ?? "?") : "(no customer)"];
      let node = root;
      root.size += v;
      for (const k of keys) {
        if (!node.children) node.children = new Map();
        let c = node.children.get(k);
        if (!c) { c = { name: k, size: 0 }; node.children.set(k, c); }
        c.size += v;
        node = c;
      }
    }
    return root;
  }, [cube, lh, mask, engine]);

  let current: Node | undefined = tree;
  for (const p of path) current = current?.children?.get(p);
  if (!current) current = tree;
  const cells = [...(current.children?.values() ?? [])].map((c) => ({ name: c.name, size: Math.round(c.size), drill: !!c.children })).sort((a, b) => b.size - a.size);

  const season = useMemo(() => seasonality(pts, lh).map((s) => ({ ...s, label: MONTH_NAMES[s.month - 1] })), [pts, lh]);
  const yearly = useMemo(() => {
    const g = new Map<string, { year: string; zero: number; unknown: number }>();
    for (const p of pts) {
      if (p.idx > lh) break;
      const y = p.month.slice(0, 4);
      const e = g.get(y) ?? { year: y, zero: 0, unknown: 0 };
      e.zero += p.zero; e.unknown += p.missing;
      g.set(y, e);
    }
    return [...g.values()];
  }, [pts, lh]);

  const skuOptions = useMemo(() => engine.options("sku", filters), [engine, filters]);
  const [localSku, setLocalSku] = useState<string>("");
  const selSku = names.sku ?? (localSku || null);
  const lc = data.lifecycle?.find((l) => l.SKU_ID === selSku);
  const profile = (data.profile ?? []).filter((r) => matchRow(r));

  return (
    <div className="space-y-4">
      <Panel
        title="Demand drill-down"
        subtitle={`Last 12 months unconstrained demand · ${LEVELS[path.length] ?? "Customer"} level — click a tile to drill in`}
        actions={
          <nav aria-label="Drill path" className="flex flex-wrap items-center gap-1 text-xs">
            <button className="font-medium text-primary hover:underline" onClick={() => setPath([])}>All</button>
            {path.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="size-3 text-muted-foreground" />
                <button className="font-medium text-primary hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>{p}</button>
              </span>
            ))}
          </nav>
        }
      >
        {cells.length ? (
          <div className="h-80">
            <ResponsiveContainer>
              <Treemap
                data={cells}
                dataKey="size"
                {...chartAnim()}
                stroke="var(--card)"
                onClick={(n: { name?: string; drill?: boolean }) => { if (n?.name && n.drill && path.length < 3) setPath([...path, n.name]); }}
                content={<TreeCell total={current.size} />}
              >
                <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                  <TipBox title={String(payload[0].payload.name)}><TipRow label="Demand (12m)" value={fmtNum(Number(payload[0].value))} /><TipRow label="Share" value={fmtPct((Number(payload[0].value) / (current?.size || 1)) * 100)} /></TipBox>
                ) : null} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        ) : <Empty />}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Seasonality index" subtitle="Calendar-month demand ÷ annual mean, complete history years (1.0 = average)">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={season} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis domain={[0, "auto"]} tickFormatter={(v: number) => v.toFixed(1)} width={36} {...axisProps} />
                <Tooltip content={({ active, payload, label }) => active && payload?.[0] ? <TipBox title={label}><TipRow color={C.history} label="Index" value={Number(payload[0].value).toFixed(3)} /></TipBox> : null} cursor={{ fill: "var(--muted)" }} />
                <ReferenceLine y={1} stroke={C.muted} strokeDasharray="4 4" />
                <Bar dataKey="index" name="Seasonality index" fill={C.history} radius={[3, 3, 0, 0]} {...chartAnim()} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Zero-order vs unknown months" subtitle="Series-months per year: real zero orders vs missing / unknown demand">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={yearly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" {...axisProps} />
                <YAxis width={36} {...axisProps} />
                <Tooltip content={<GenericTip />} cursor={{ fill: "var(--muted)" }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="zero" name="Zero orders" fill={C.history} radius={[3, 3, 0, 0]} {...chartAnim()} />
                <Bar dataKey="unknown" name="Unknown / missing" fill={C.warning} radius={[3, 3, 0, 0]} {...chartAnim()} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="SKU lifecycle"
          subtitle={names.sku ? "From the SKU filter" : "Pick a SKU (or set the SKU filter)"}
          actions={!names.sku && (
            <select aria-label="SKU for lifecycle card" value={localSku} onChange={(e) => setLocalSku(e.target.value)} className="rounded-md border bg-card px-2 py-1 text-xs">
              <option value="">Select SKU</option>
              {skuOptions.map((v) => <option key={v} value={engine.dimLabel("sku", v)}>{engine.dimLabel("sku", v)}</option>)}
            </select>
          )}
        >
          {!data.lifecycle ? <Empty>lifecycle.json is unavailable.</Empty> : !lc ? <Empty>No SKU selected.</Empty> : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2 flex items-center justify-between">
                <span className="font-display text-lg font-semibold">{lc.SKU_ID}</span>
                <Badge tone={lifecycleTone(lc.status)}>{lc.status}</Badge>
              </div>
              <Field k="Family" v={lc.Product_Family} />
              <Field k="Launch" v={lc.launch_date} />
              <Field k="End of life" v={lc.eol_date} />
              <Field k="Successor" v={lc.successor} />
              <Field k="Predecessor" v={lc.predecessor} />
              <Field k="First sale" v={lc.first_sale} />
              <Field k="Last sale" v={lc.last_sale} />
              <Field k={`${horizon}-month forecast`} v={fmtNum(lc.forecast_19m)} />
            </dl>
          )}
        </Panel>
        <Panel className="xl:col-span-2" title="Series profile" subtitle="Intermittency class and ordering cycle per SKU × region">
          {!data.profile ? <Empty>profile.json is unavailable.</Empty> : (
            <SortableTable<ProfileRow>
              rows={profile}
              rowKey={(r) => `${r.SKU_ID}-${r.Region}`}
              initialSort="zero"
              maxHeight={300}
              cols={[
                { key: "sku", label: "SKU", value: (r) => r.SKU_ID },
                { key: "reg", label: "Region", value: (r) => r.Region },
                { key: "cls", label: "Demand class", value: (r) => r.demand_class, render: (r) => <Badge tone={r.demand_class === "Smooth" ? "success" : r.demand_class === "Lumpy" ? "danger" : "warning"}>{r.demand_class}</Badge> },
                { key: "zero", label: "Zero share 36m", align: "right", value: (r) => r.zero_share_36m, render: (r) => fmtPct(r.zero_share_36m * 100, 0) },
                { key: "cycle", label: "Order cycle (m)", align: "right", value: (r) => r.cycle_period },
                { key: "mean", label: "Mean / month", align: "right", value: (r) => r.mean_36m ?? null, render: (r) => fmtNum(r.mean_36m) },
              ]}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="tabular">{v ?? "–"}</dd>
    </div>
  );
}

interface CellProps { x?: number; y?: number; width?: number; height?: number; name?: string; size?: number; index?: number; total: number; depth?: number }
function TreeCell({ x = 0, y = 0, width = 0, height = 0, name, size = 0, index = 0, total, depth }: CellProps) {
  if (depth === 0) return null;
  const fill = C.series[index % C.series.length];
  const show = width > 64 && height > 34;
  return (
    <g style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.88} stroke="var(--card)" strokeWidth={2} rx={4} />
      {show && (
        <>
          <text x={x + 8} y={y + 18} fill="var(--primary-foreground)" fontSize={12} fontWeight={500} fontFamily="var(--font-sans)" stroke="none">{name && name.length > width / 7 ? `${name.slice(0, Math.floor(width / 7))}…` : name}</text>
          <text x={x + 8} y={y + 33} fill="var(--primary-foreground)" fontSize={11} opacity={0.9} fontFamily="var(--font-mono)" stroke="none">{fmtNum(size)} · {fmtPct((size / (total || 1)) * 100, 0)}</text>
        </>
      )}
    </g>
  );
}
