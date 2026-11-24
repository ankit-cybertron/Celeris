import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import {
  Activity, AlertTriangle, ChevronDown, Download, Flag, Gauge, Globe, LayoutDashboard, Moon, MoreHorizontal, PackageX, PanelLeft, ShieldCheck,
  ShoppingCart, SlidersHorizontal, Sparkles, Sprout, Sun, TrendingUp, X, type LucideIcon,
} from "lucide-react";
import { DashboardProvider, DIMS, useDashboard } from "./DashboardContext";
import { Sidebar } from "./Sidebar";
import { MAIN_TABS, MORE_TABS, TABS, type TabId, isMoreTab } from "./tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Dataset } from "@/lib/types";
import type { AppConfig } from "@/lib/config";
import { brandOf } from "@/lib/config";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { InsightsView } from "@/components/views/InsightsView";
import { ExecutiveView } from "@/components/views/ExecutiveView";
import { DataHealthView } from "@/components/views/DataHealthView";
import { DemandExplorerView } from "@/components/views/DemandExplorerView";
import { AnomalyView } from "@/components/views/AnomalyView";
import { ForecastView } from "@/components/views/ForecastView";
import { StockoutsView } from "@/components/views/StockoutsView";
import { LifecycleView } from "@/components/views/LifecycleView";
import { MacroView } from "@/components/views/MacroView";
import { WhatIfView } from "@/components/views/WhatIfView";
import { ProcurementView } from "@/components/views/ProcurementView";
import { ExceptionsView } from "@/components/views/ExceptionsView";
import { DownloadsView } from "@/components/views/DownloadsView";

const VIEWS: Record<TabId, ComponentType> = {
  insights: InsightsView,
  executive: ExecutiveView,
  "data-health": DataHealthView,
  demand: DemandExplorerView,
  anomalies: AnomalyView,
  forecast: ForecastView,
  stockouts: StockoutsView,
  lifecycle: LifecycleView,
  macro: MacroView,
  "what-if": WhatIfView,
  procurement: ProcurementView,
  exceptions: ExceptionsView,
  downloads: DownloadsView,
};

const ICONS: Record<TabId, LucideIcon> = {
  insights: Sparkles,
  executive: LayoutDashboard,
  "data-health": ShieldCheck,
  demand: TrendingUp,
  anomalies: Activity,
  forecast: Gauge,
  stockouts: PackageX,
  lifecycle: Sprout,
  macro: Globe,
  "what-if": SlidersHorizontal,
  procurement: ShoppingCart,
  exceptions: Flag,
  downloads: Download,
};

export function Dashboard({ data, config, tab, onTab }: { data: Dataset; config: AppConfig; tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <DashboardProvider data={data} config={config}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar />
        <Main tab={tab} onTab={onTab} />
      </div>
    </DashboardProvider>
  );
}

function TabNav({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  const activeMore = MORE_TABS.find((t) => t.id === tab);
  const isMoreActive = Boolean(activeMore);

  return (
    <nav aria-label="Views" role="tablist" className="relative flex flex-wrap items-center gap-1 px-3 sm:px-4 pb-2">
      {MAIN_TABS.map((t) => {
        const Icon = ICONS[t.id];
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            data-tab={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.id)}
            className={cn(
              "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 sm:px-2.5 text-xs sm:text-[12.5px] font-medium whitespace-nowrap transition-colors",
              on
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:bg-card/40 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-3.5 transition-colors", on ? "text-forecast" : "opacity-70")} aria-hidden />
            <span>{t.label}</span>
          </button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            data-tab={isMoreActive && activeMore ? activeMore.id : "more"}
            role="tab"
            aria-selected={isMoreActive}
            className={cn(
              "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 sm:px-2.5 text-xs sm:text-[12.5px] font-medium whitespace-nowrap transition-colors outline-none",
              isMoreActive
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:bg-card/40 hover:text-foreground",
            )}
          >
            {isMoreActive && activeMore ? (
              (() => {
                const ActiveIcon = ICONS[activeMore.id];
                return <ActiveIcon className="size-3.5 text-forecast" aria-hidden />;
              })()
            ) : (
              <MoreHorizontal className="size-3.5 opacity-70" aria-hidden />
            )}
            <span>{isMoreActive && activeMore ? activeMore.label : "More"}</span>
            <ChevronDown className="size-3 opacity-60 ml-0.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 p-1">
          {MORE_TABS.map((t) => {
            const Icon = ICONS[t.id];
            const on = tab === t.id;
            return (
              <DropdownMenuItem
                key={t.id}
                onClick={() => onTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 text-xs sm:text-sm cursor-pointer rounded-md",
                  on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4", on ? "text-forecast" : "opacity-70")} aria-hidden />
                {t.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

function Main({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  const { names, data, config, setFilter, dimLabel, sidebarCollapsed, toggleSidebar } = useDashboard();
  const { mode, toggle } = useTheme(config.theme.mode);
  const View = VIEWS[tab];
  const label = TABS.find((t) => t.id === tab)?.label;
  const brand = brandOf(config, data.meta?.project);
  const chips = DIMS.filter((d) => names[d.key]).map((d) => ({ key: d.key, label: dimLabel(d.key), value: names[d.key]! }));
  const meta = data.meta;
  return (
    <div className="min-w-0 flex-1">
      <header className="glass sticky top-0 z-20 border-b">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <button
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              title={sidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              className="hidden lg:inline-flex size-7 items-center justify-center rounded-lg border border-border bg-card/70 text-muted-foreground transition-all hover:bg-card hover:text-foreground hover:scale-105 active:scale-95 cursor-pointer"
            >
              <PanelLeft className="size-3.5" aria-hidden />
            </button>
            <span className="truncate">{brand.name}</span>
            <span aria-hidden>/</span>
            <span className="truncate font-medium text-foreground">{label}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {meta?.model && (
              <span className="hidden items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground md:inline-flex">
                <span className="live-dot inline-block size-1.5 rounded-full bg-success" aria-hidden /> {meta.model}
              </span>
            )}
            {meta?.generated_at && <span className="hidden rounded-full border bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground sm:inline">Updated {meta.generated_at}</span>}
            <button
              onClick={toggle}
              aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="inline-flex size-8 items-center justify-center rounded-full border bg-card/60 text-muted-foreground transition-all hover:rotate-12 hover:text-foreground"
            >
              {mode === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
        <TabNav tab={tab} onTab={onTab} />
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div key={`h-${tab}`} className="animate-rise mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-gradient text-2xl font-semibold tracking-tight sm:text-[28px]">{label}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {chips.length === 0 && <span className="text-sm text-muted-foreground">All demand · no filters applied</span>}
              {chips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key, null)}
                  className="group inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-xs transition-colors hover:border-danger/40"
                  aria-label={`Clear ${c.label} filter`}
                >
                  <span className="text-muted-foreground">{c.label}:</span>
                  <span className="font-medium">{c.value}</span>
                  <X className="size-3 text-muted-foreground group-hover:text-danger" aria-hidden />
                </button>
              ))}
            </div>
          </div>
          {data.failed.length > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 text-xs text-accent-foreground">
              <AlertTriangle className="size-4" aria-hidden /> Not loaded: {data.failed.join(", ")}
            </div>
          )}
        </div>
        <div key={tab} role="tabpanel" aria-label={label} className="stagger">
          <View />
        </div>
      </main>
    </div>
  );
}
