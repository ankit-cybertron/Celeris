export const MAIN_TABS = [
  { id: "executive", label: "Executive overview" },
  { id: "forecast", label: "Forecast & accuracy" },
  { id: "demand", label: "Demand explorer" },
  { id: "anomalies", label: "Anomaly monitor" },
  { id: "data-health", label: "Data health" },
  { id: "insights", label: "Insights" },
] as const;

export const MORE_TABS = [
  { id: "procurement", label: "Procurement" },
  { id: "what-if", label: "What-if" },
  { id: "stockouts", label: "Stockouts" },
  { id: "lifecycle", label: "Lifecycle" },
  { id: "macro", label: "Macro lead/lag" },
  { id: "exceptions", label: "Planner exceptions" },
  { id: "downloads", label: "Downloads" },
] as const;

export const TABS = [...MAIN_TABS, ...MORE_TABS] as const;
export type TabId = (typeof TABS)[number]["id"];
export const DEFAULT_TAB: TabId = "executive";
export const isTab = (v: unknown): v is TabId => TABS.some((t) => t.id === v);
export const isMoreTab = (v: unknown): boolean => MORE_TABS.some((t) => t.id === v);
