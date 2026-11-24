import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Engine, type MonthPoint, type SeriesStat } from "@/lib/engine";
import type { AppConfig } from "@/lib/config";
import { EMPTY_FILTERS, type Dataset, type DimKey, type Filters } from "@/lib/types";

export const DIMS: Array<{ key: DimKey; label: string }> = [
  { key: "family", label: "Product family" },
  { key: "sku", label: "SKU" },
  { key: "region", label: "Region" },
  { key: "channel", label: "Sales channel" },
  { key: "customer", label: "Customer" },
];

export interface NameFilters { family: string | null; sku: string | null; region: string | null; channel: string | null; customer: string | null }
export interface NamedRow {
  SKU_ID?: string | null;
  Region?: string | null;
  Customer_Name?: string | null;
  Sales_Channel?: string | null;
  Product_Family?: string | null;
}

interface Ctx {
  data: Dataset;
  config: AppConfig;
  /** Forecast horizon in months, derived from the cube. */
  horizon: number;
  dimLabel: (dim: DimKey) => string;
  engine: Engine;
  filters: Filters;
  names: NameFilters;
  setFilter: (dim: DimKey, v: number | null) => void;
  reset: () => void;
  mask: Uint8Array;
  pts: MonthPoint[];
  stats: SeriesStat[];
  /** Does a name-keyed JSON row fall inside the shared filters? Null fields mean "applies to all". */
  matchRow: (r: NamedRow) => boolean;
  familyOfSku: (sku: string | null | undefined) => string | null;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean | ((prev: boolean) => boolean)) => void;
  toggleSidebar: () => void;
}

const DashboardCtx = createContext<Ctx | null>(null);

export function DashboardProvider({ data, config, children }: { data: Dataset; config: AppConfig; children: ReactNode }) {
  const engine = useMemo(() => new Engine(data.cube, data.backtest?.scale ?? []), [data]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const setFilter = useCallback(
    (dim: DimKey, v: number | null) => {
      setFilters((prev) => {
        const next: Filters = { ...prev, [dim]: v };
        // drop selections that are no longer compatible with the new one
        for (let pass = 0; pass < 3; pass++) {
          for (const { key } of DIMS) {
            if (key === dim || next[key] == null) continue;
            if (!engine.options(key, next).includes(next[key]!)) next[key] = null;
          }
        }
        return next;
      });
    },
    [engine],
  );
  const reset = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const mask = useMemo(() => engine.seriesMask(filters), [engine, filters]);
  const pts = useMemo(() => engine.monthly(filters, mask), [engine, filters, mask]);
  const stats = useMemo(() => engine.seriesStats(mask), [engine, mask]);

  const names = useMemo<NameFilters>(() => {
    const d = data.cube.dims;
    const n = (arr: string[], v: number | null) => (v == null ? null : (arr[v] ?? null));
    return { family: n(d.family, filters.family), sku: n(d.sku, filters.sku), region: n(d.region, filters.region), channel: n(d.channel, filters.channel), customer: n(d.customer, filters.customer) };
  }, [data, filters]);

  const skuFam = useMemo(() => {
    const m = new Map<string, string>();
    data.cube.dims.sku.forEach((s, i) => m.set(s, data.cube.dims.family[data.cube.sku_family[i] ?? -1] ?? ""));
    return m;
  }, [data]);
  const familyOfSku = useCallback((s: string | null | undefined) => (s ? (skuFam.get(s) ?? null) : null), [skuFam]);

  const matchRow = useCallback(
    (r: NamedRow) => {
      if (names.sku && r.SKU_ID && r.SKU_ID !== names.sku) return false;
      if (names.family) {
        const fam = r.Product_Family ?? familyOfSku(r.SKU_ID);
        if (fam && fam !== names.family) return false;
      }
      if (names.region && r.Region && r.Region !== names.region) return false;
      if (names.channel && r.Sales_Channel && r.Sales_Channel !== names.channel) return false;
      if (names.customer && r.Customer_Name && r.Customer_Name !== names.customer) return false;
      return true;
    },
    [names, familyOfSku],
  );

  const horizon = data.cube.months.length - 1 - data.cube.last_hist;
  const dimLabel = useCallback((dim: DimKey) => config.dimension_labels[dim] ?? DIMS.find((d) => d.key === dim)?.label ?? dim, [config]);

  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("mks_sidebar_collapsed") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  const setSidebarCollapsed = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsedState((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("mks_sidebar_collapsed", String(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, [setSidebarCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const value = useMemo<Ctx>(
    () => ({
      data,
      config,
      horizon,
      dimLabel,
      engine,
      filters,
      names,
      setFilter,
      reset,
      mask,
      pts,
      stats,
      matchRow,
      familyOfSku,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
    }),
    [
      data,
      config,
      horizon,
      dimLabel,
      engine,
      filters,
      names,
      setFilter,
      reset,
      mask,
      pts,
      stats,
      matchRow,
      familyOfSku,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
    ],
  );
  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>;
}

export function useDashboard(): Ctx {
  const c = useContext(DashboardCtx);
  if (!c) throw new Error("useDashboard must be used inside DashboardProvider");
  return c;
}

export function selectionLabel(names: NameFilters): string {
  const parts = [names.family, names.sku, names.region, names.channel, names.customer].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All demand";
}
