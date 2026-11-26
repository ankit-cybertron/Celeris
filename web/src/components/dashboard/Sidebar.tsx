import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen, Radar, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { DIMS, useDashboard } from "./DashboardContext";
import { brandOf } from "@/lib/config";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { engine, filters, setFilter, reset, data, mask, config, dimLabel, sidebarCollapsed, toggleSidebar } = useDashboard();
  const active = Object.values(filters).filter((v) => v != null).length;
  const nSel = mask.reduce((a, b) => a + b, 0);
  const share = engine.nSeries ? (nSel / engine.nSeries) * 100 : 0;
  const meta = data.meta;
  const brand = brandOf(config, meta?.project);
  const { months, last_hist: lh } = data.cube;

  return (
    <aside
      className={cn(
        "sidebar-surface relative flex shrink-0 flex-col overflow-hidden text-sidebar-foreground transition-[width] duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen",
        sidebarCollapsed ? "w-full lg:w-16" : "w-full lg:w-72",
      )}
      aria-label="Sidebar filters and navigation"
    >
      <div className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-sidebar-primary/15 blur-3xl" aria-hidden />

      {/* Collapsed Rail for Desktop (lg) */}
      {sidebarCollapsed ? (
        <div className="relative hidden h-full flex-col items-center py-4 lg:flex">
          <button
            onClick={toggleSidebar}
            title="Expand sidebar (Ctrl+B)"
            aria-label="Expand sidebar"
            className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-sidebar-primary to-forecast text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Radar className="size-5" aria-hidden />
          </button>

          <button
            onClick={toggleSidebar}
            title="Expand sidebar (Ctrl+B)"
            aria-label="Expand sidebar"
            className="mt-4 flex size-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/50 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
          >
            <PanelLeftOpen className="size-4" aria-hidden />
          </button>

          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={toggleSidebar}
              title={active > 0 ? `${active} active filters (click to expand)` : "Filters (click to expand)"}
              aria-label="Filters"
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg border transition-colors cursor-pointer",
                active > 0
                  ? "border-sidebar-primary/60 bg-sidebar-accent text-sidebar-primary"
                  : "border-sidebar-border text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {active > 0 && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-sidebar-primary text-[9px] font-bold text-sidebar-primary-foreground">
                  {active}
                </span>
              )}
            </button>

            {active > 0 && (
              <button
                onClick={reset}
                title="Reset all filters"
                aria-label="Reset all filters"
                className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
              >
                <RotateCcw className="size-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div className="mt-auto flex flex-col items-center pb-2 text-[10px] text-sidebar-muted" title={`Showing ${nSel} of ${engine.nSeries} series (${Math.round(share)}%)`}>
            <span className="tabular font-semibold text-sidebar-foreground">{Math.round(share)}%</span>
            <div className="mt-1 h-12 w-1.5 overflow-hidden rounded-full bg-sidebar-accent">
              <div
                className="w-full rounded-full bg-linear-to-b from-history to-sidebar-primary transition-[height] duration-500 ease-out"
                style={{ height: `${share}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Header (Full / Expanded on Desktop, Header on Mobile) */}
      <div
        className={cn(
          "relative flex items-center justify-between border-b border-sidebar-border px-5 py-4",
          sidebarCollapsed && "lg:hidden",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-sidebar-primary to-forecast text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25">
            <Radar className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="font-display truncate text-base leading-tight font-semibold">{brand.name}</div>
            {brand.tagline && <div className="truncate text-xs text-sidebar-muted">{brand.tagline}</div>}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mobile toggle button */}
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand filters" : "Collapse filters"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent px-2.5 py-1 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80 cursor-pointer lg:hidden"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            <span>{sidebarCollapsed ? "Filters" : "Hide"}</span>
            {active > 0 && (
              <span className="rounded-full bg-sidebar-primary px-1.5 py-0.2 text-[10px] font-semibold text-sidebar-primary-foreground">
                {active}
              </span>
            )}
            {sidebarCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          </button>

          {/* Desktop collapse button */}
          <button
            onClick={toggleSidebar}
            aria-label="Collapse sidebar (Ctrl+B)"
            title="Collapse sidebar (Ctrl+B)"
            className="hidden size-8 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer lg:inline-flex"
          >
            <PanelLeftClose className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Main Filter Content (scrollable on desktop, toggleable on mobile) */}
      <div
        className={cn(
          "scrollbar-thin relative flex-1 overflow-y-auto px-5 py-5",
          sidebarCollapsed ? "hidden" : "block",
        )}
      >
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
                      "w-full appearance-none rounded-lg border bg-sidebar-accent py-2 pr-8 pl-2.5 text-sm text-sidebar-accent-foreground outline-none transition-all focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer",
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
                    <button onClick={() => setFilter(key, null)} aria-label={`Clear ${dimLabel(key)}`} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-sidebar-muted hover:text-sidebar-foreground cursor-pointer">
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
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent disabled:opacity-40 [&:not(:disabled):hover_svg]:-rotate-180 cursor-pointer disabled:cursor-not-allowed"
        >
          <RotateCcw className="size-4 transition-transform duration-500" aria-hidden /> Reset filters
        </button>
        <div className="mt-5">
          <div
            className="mb-1.5 flex justify-between text-xs text-sidebar-muted"
            title={`${engine.nSeries} total multi-dimensional series slices across history & forecast (3,068 active forecast series in test.csv + 48 historical/EOL slices)`}
          >
            <span>Series in view</span>
            <span className="tabular"><span className="text-sidebar-foreground">{nSel}</span> / {engine.nSeries}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
            <div className="h-full rounded-full bg-linear-to-r from-history to-sidebar-primary transition-[width] duration-500 ease-out" style={{ width: `${share}%` }} />
          </div>
        </div>
      </div>

      {/* Footer Info (Desktop only, hidden when collapsed) */}
      <div
        className={cn(
          "relative hidden border-t border-sidebar-border px-5 py-4 text-xs text-sidebar-muted",
          sidebarCollapsed ? "lg:hidden" : "lg:block",
        )}
      >
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
