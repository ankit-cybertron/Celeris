import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Activity, AlertTriangle, BookOpen, ChevronDown, Download, ExternalLink, Flag, Gauge, Github, Globe, LayoutDashboard, Linkedin, Mail, Moon, MoreHorizontal, PackageX, ShieldCheck,
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
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number>(TABS.length);

  useEffect(() => {
    const navEl = navRef.current;
    const measEl = measureRef.current;
    if (!navEl || !measEl) return;

    const compute = () => {
      const style = window.getComputedStyle(navEl);
      const padLeft = parseFloat(style.paddingLeft) || 0;
      const padRight = parseFloat(style.paddingRight) || 0;
      // Usable width strictly inside nav padding
      const available = navEl.clientWidth - padLeft - padRight - 4;
      if (available <= 0) return;

      const tabEls = Array.from(measEl.querySelectorAll<HTMLElement>("[data-measure-tab]"));
      const moreEl = measEl.querySelector<HTMLElement>("[data-measure-more]");
      if (!tabEls.length || !moreEl) return;

      const tabWidths = tabEls.map((el) => el.offsetWidth);
      const standardMoreWidth = moreEl.offsetWidth;
      const gap = 4; // gap-1 in tailwind is 4px

      const totalAll = tabWidths.reduce((a, b) => a + b, 0) + (tabWidths.length - 1) * gap;
      if (available >= totalAll) {
        setVisibleCount(TABS.length);
        return;
      }

      // Reserve space for More button (including if an overflow tab's name is shown on it)
      const maxMoreWidth = Math.max(standardMoreWidth + 12, ...tabWidths.slice(2).map((w) => w + 20));
      let used = maxMoreWidth + gap;
      let count = 0;
      for (let i = 0; i < tabWidths.length; i++) {
        const next = used + tabWidths[i] + gap;
        if (next <= available) {
          used = next;
          count++;
        } else {
          break;
        }
      }
      setVisibleCount(Math.max(1, count));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(navEl);
    return () => ro.disconnect();
  }, []);

  const visibleTabs = useMemo(() => TABS.slice(0, visibleCount), [visibleCount]);
  const overflowTabs = useMemo(() => TABS.slice(visibleCount), [visibleCount]);
  const activeMore = overflowTabs.find((t) => t.id === tab);
  const isMoreActive = Boolean(activeMore);

  return (
    <>
      {/* Hidden offscreen container for accurate runtime DOM measurement */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] top-0 invisible flex flex-nowrap items-center gap-1"
      >
        {TABS.map((t) => {
          const Icon = ICONS[t.id];
          return (
            <div
              key={t.id}
              data-measure-tab={t.id}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 sm:px-2.5 text-xs sm:text-[12.5px] font-medium whitespace-nowrap"
            >
              <Icon className="size-3.5" />
              <span>{t.label}</span>
            </div>
          );
        })}
        <div
          data-measure-more
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 sm:px-2.5 text-xs sm:text-[12.5px] font-medium whitespace-nowrap"
        >
          <MoreHorizontal className="size-3.5" />
          <span>More</span>
          <ChevronDown className="size-3 ml-0.5" />
        </div>
      </div>

      <nav
        ref={navRef}
        aria-label="Views"
        role="tablist"
        className="relative flex flex-nowrap items-center gap-1 px-4 sm:px-6 lg:px-8 pb-2 overflow-x-hidden"
      >
        {visibleTabs.map((t) => {
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

        {overflowTabs.length > 0 && (
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
              {overflowTabs.map((t) => {
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
        )}
      </nav>
    </>
  );
}

function Main({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  const { names, data, config, setFilter, dimLabel } = useDashboard();
  const { mode, toggle } = useTheme(config.theme.mode);
  const View = VIEWS[tab];
  const label = TABS.find((t) => t.id === tab)?.label;
  const brand = brandOf(config, data.meta?.project);
  const chips = DIMS.filter((d) => names[d.key]).map((d) => ({ key: d.key, label: dimLabel(d.key), value: names[d.key]! }));
  return (
    <div className="min-w-0 flex-1">
      <header className="glass sticky top-0 z-20 border-b">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 pt-3 pb-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{brand.name}</span>
            <span aria-hidden>/</span>
            <span className="truncate font-medium text-foreground">{label}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
              Developed by <span className="font-semibold text-foreground">Ankit</span>
            </span>
            <a
              href="https://github.com/ankit-cybertron/Celeris#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground cursor-pointer"
              title="View GitHub Repository README"
            >
              <BookOpen className="size-3" aria-hidden />
              <span>Readme</span>
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground cursor-pointer outline-none"
                  title="Contact & Links"
                >
                  <Mail className="size-3" aria-hidden />
                  <span>Contact</span>
                  <ChevronDown className="size-3 opacity-60 ml-0.5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 p-1.5">
                <DropdownMenuItem asChild>
                  <a
                    href="mailto:ankit.cybertron@proton.me"
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="size-3.5 text-forecast" />
                      <span>Email</span>
                    </div>
                    <ExternalLink className="size-3 opacity-50" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://linkedin.com/in/ankitcybertron"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Linkedin className="size-3.5 text-forecast" />
                      <span>LinkedIn</span>
                    </div>
                    <ExternalLink className="size-3 opacity-50" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://portfolio.ankit-cybertron.workers.dev/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="size-3.5 text-forecast" />
                      <span>Portfolio</span>
                    </div>
                    <ExternalLink className="size-3 opacity-50" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://github.com/ankit-cybertron"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs cursor-pointer rounded-md text-foreground hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Github className="size-3.5 text-forecast" />
                      <span>GitHub</span>
                    </div>
                    <ExternalLink className="size-3 opacity-50" />
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6">
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
