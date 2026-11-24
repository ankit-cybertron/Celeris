import { ChevronDown, Radar, RotateCcw, X } from "lucide-react";
import { DIMS, useDashboard } from "./DashboardContext";
import { brandOf } from "@/lib/config";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { engine, filters, setFilter, reset, data, mask, config, dimLabel } = useDashboard();
  const active = Object.values(filters).filter((v) => v != null).length;
  const nSel = mask.reduce((a, b) => a + b, 0);
  const share = engine.nSeries ? (nSel / engine.nSeries) * 100 : 0;
  const meta = data.meta;
  const brand = brandOf(config, meta?.project);
  const { months, last_hist: lh } = data.cube;
  return (
    <aside className="sidebar-surface relative flex w-full shrink-0 flex-col overflow-hidden text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-72">
      <div className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-sidebar-primary/15 blur-3xl" aria-hidden />
      <div className="relative flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="relative flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-sidebar-primary to-forecast text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25">
          <Radar className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="font-display truncate text-base leading-tight font-semibold">{brand.name}</div>
          {brand.tagline && <div className="truncate text-xs text-sidebar-muted">{brand.tagline}</div>}
        </div>
      </div>

      <div className="scrollbar-thin relative flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">Filters</span>
          {active > 0 && <span className="animate-rise rounded-full bg-sidebar-primary px-2 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground">{active} active</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {DIMS.map(({ key }) => {
            const opts = engine.options(key, filters);
            const id = `filter-${key}`;
            const on = filters[key] != null;
            return (
              <div key={key}>
                <label htmlFor={id} className="mb-1 flex justify-between text-xs text-sidebar-muted">
                  <span className={cn(on && "text-sidebar-foreground")}>{dimLabel(key)}</span>
                  <span className="tabular">{opts.length}</span>
                </label>
                <div className="relative">
                  <select
                    id={id}
                    value={filters[key] ?? ""}
                    onChange={(e) => setFilter(key, e.target.value === "" ? null : Number(e.target.value))}
                    className={cn(
                      "w-full appearance-none rounded-lg border bg-sidebar-accent py-2 pr-8 pl-2.5 text-sm text-sidebar-accent-foreground outline-none transition-all focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      on ? "border-sidebar-primary/60 ring-2 ring-sidebar-primary/20" : "border-sidebar-border hover:border-sidebar-muted/40",
                    )}
                  >
                    <option value="">All</option>
                    {opts.map((v) => (
                      <option key={v} value={v}>
                        {engine.dimLabel(key, v)}
                      </option>
                    ))}
                  </select>
                  {on ? (
                    <button onClick={() => setFilter(key, null)} aria-label={`Clear ${dimLabel(key)}`} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-sidebar-muted hover:text-sidebar-foreground">
                      <X className="size-3.5" aria-hidden />
                    </button>
                  ) : (
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-sidebar-muted" aria-hidden />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={reset}
          disabled={active === 0}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent disabled:opacity-40 [&:not(:disabled):hover_svg]:-rotate-180"
        >
          <RotateCcw className="size-4 transition-transform duration-500" aria-hidden /> Reset filters
        </button>
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-sidebar-muted">
            <span>Series in view</span>
            <span className="tabular"><span className="text-sidebar-foreground">{nSel}</span> / {engine.nSeries}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
            <div className="h-full rounded-full bg-linear-to-r from-history to-sidebar-primary transition-[width] duration-500 ease-out" style={{ width: `${share}%` }} />
          </div>
        </div>
      </div>

      <div className="relative hidden border-t border-sidebar-border px-5 py-4 text-xs text-sidebar-muted lg:block">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-sidebar-accent/70 px-2.5 py-2">
            <div className="text-[10px] tracking-wider uppercase">History to</div>
            <div className="tabular mt-0.5 text-sidebar-foreground">{months[lh]}</div>
          </div>
          <div className="rounded-lg bg-sidebar-accent/70 px-2.5 py-2">
            <div className="text-[10px] tracking-wider uppercase">Forecast</div>
            <div className="tabular mt-0.5 text-sidebar-primary">{months[lh + 1]} → {months[months.length - 1]}</div>
          </div>
        </div>
        {meta?.competition && <div className="mt-3">{meta.competition}</div>}
        {meta?.sample_data && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sidebar-accent px-2.5 py-0.5 text-sidebar-primary"><span className="size-1.5 rounded-full bg-sidebar-primary" aria-hidden />Sample data</div>}
      </div>
    </aside>
  );
}
