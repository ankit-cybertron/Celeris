import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motionMs } from "@/lib/motion";
import { ArrowDown, ArrowUp, ArrowUpDown, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({ title, subtitle, actions, children, className }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card-surface card-hover flex min-w-0 flex-col p-4 sm:p-5", className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const TONE = {
  default: { bar: "from-muted-foreground/60", glow: "bg-muted-foreground/10", dot: "bg-muted-foreground" },
  history: { bar: "from-history", glow: "bg-history/15", dot: "bg-history" },
  forecast: { bar: "from-forecast", glow: "bg-forecast/15", dot: "bg-forecast" },
  success: { bar: "from-success", glow: "bg-success/15", dot: "bg-success" },
  warning: { bar: "from-warning", glow: "bg-warning/15", dot: "bg-warning" },
  danger: { bar: "from-danger", glow: "bg-danger/15", dot: "bg-danger" },
} as const;

const NUM_RE = /^(.*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/s;

/** Counts up to a formatted value such as "$1.2M", "12,345" or "23.6%", keeping its prefix/suffix. */
export function AnimatedValue({ text }: { text: string }) {
  const m = NUM_RE.exec(text);
  const target = m ? Number(m[2]!.replace(/,/g, "")) : NaN;
  const [cur, setCur] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const dur = motionMs();
    if (!dur) { setCur(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (target - a) * e;
      setCur(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!m || !Number.isFinite(target)) return <>{text}</>;
  const dec = m[2]!.split(".")[1]?.length ?? 0;
  const body = m[2]!.includes(",") ? cur.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : cur.toFixed(dec);
  return <>{m[1]}{body}{m[3]}</>;
}

export function Kpi({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof TONE }) {
  const t = TONE[tone];
  const shown = typeof value === "string" || typeof value === "number" ? <AnimatedValue text={String(value)} /> : value;
  return (
    <div className="card-surface card-hover group relative overflow-hidden px-4 py-3.5 hover:-translate-y-0.5">
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-linear-to-r to-transparent", t.bar)} aria-hidden />
      <div className={cn("pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-125", t.glow)} aria-hidden />
      <div className="relative flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <span className={cn("inline-block size-1.5 rounded-full", t.dot)} aria-hidden />
        {label}
      </div>
      <div className="tabular relative mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{shown}</div>
      {sub && <div className="relative mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function Delta({ v, suffix = "%" }: { v: number | null | undefined; suffix?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted-foreground">–</span>;
  const up = v >= 0;
  return (
    <span className={cn("tabular font-medium", up ? "text-success" : "text-danger")}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(1)}
      {suffix}
    </span>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border bg-muted/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-all duration-200",
            value === o.value ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MissingFile({ name }: { name: string }) {
  return (
    <div className="card-surface flex items-center gap-3 p-6 text-sm text-muted-foreground">
      <FileWarning className="size-5 text-warning" aria-hidden />
      <span>
        <strong className="text-foreground">{name}</strong> is missing or could not be read, so this view has nothing to show.
      </span>
    </div>
  );
}

export function Empty({ children = "Nothing matches the current filters." }: { children?: ReactNode }) {
  return <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "history" | "forecast" | "success" | "warning" | "danger" }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    history: "bg-history-tint text-history",
    forecast: "bg-forecast-tint text-accent-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-accent-foreground",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", cls)}>{children}</span>;
}

export interface Col<T> {
  key: string;
  label: string;
  value: (r: T) => string | number | null | undefined;
  render?: (r: T) => ReactNode;
  align?: "left" | "right";
}

export function SortableTable<T>({ rows, cols, initialSort, initialDir = "desc", maxHeight = 420, limit, rowKey, onRowClick, selectedKey }: {
  rows: T[];
  cols: Col<T>[];
  initialSort?: string;
  initialDir?: "asc" | "desc";
  maxHeight?: number;
  limit?: number;
  rowKey: (r: T, i: number) => string;
  onRowClick?: (r: T) => void;
  selectedKey?: string | null;
}) {
  const [sort, setSort] = useState<string | undefined>(initialSort);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort);
    if (!col) return rows;
    const s = [...rows].sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return dir === "asc" ? r : -r;
    });
    return s;
  }, [rows, cols, sort, dir]);
  const visible = limit && !showAll ? sorted.slice(0, limit) : sorted;
  if (!rows.length) return <Empty />;
  return (
    <div>
      <div className="scrollbar-thin overflow-auto rounded-xl border" style={{ maxHeight }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <tr>
              {cols.map((c) => {
                const active = sort === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-semibold text-muted-foreground", c.align === "right" ? "text-right" : "text-left")}>
                    <button
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")}
                      onClick={() => {
                        if (active) setDir(dir === "asc" ? "desc" : "asc");
                        else { setSort(c.key); setDir("desc"); }
                      }}
                    >
                      {c.label}
                      {active ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const k = rowKey(r, i);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn("border-t transition-colors hover:bg-muted/40", onRowClick && "cursor-pointer hover:bg-muted/70", selectedKey === k && "bg-history-tint")}
                >
                  {cols.map((c) => (
                    <td key={c.key} className={cn("px-3 py-1.5 whitespace-nowrap", c.align === "right" ? "tabular text-right" : "text-left")}>
                      {c.render ? c.render(r) : (c.value(r) ?? "–")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {limit && rows.length > limit && (
        <button className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  );
}
