import type { DimKey } from "./types";

/**
 * App settings. Everything here is optional in public/data/config.json; missing keys
 * fall back to DEFAULT_CONFIG, so the dashboard runs with no config file at all.
 */
export interface AppConfig {
  brand: { name: string | null; tagline: string | null };
  default_tab: string | null;
  theme: {
    /** "light" | "dark" | "system" — the user's own toggle choice wins after first visit. */
    mode: "light" | "dark" | "system";
    /** CSS token overrides, e.g. { "history": "oklch(0.5 0.16 255)", "forecast": "#f97316" } */
    colors: Record<string, string>;
    colors_dark: Record<string, string>;
  };
  animation: { enabled: boolean; duration_ms: number };
  dimension_labels: Partial<Record<DimKey, string>>;
  what_if: { indicator: string | null; shock: number; min: number; max: number; step: number };
  exceptions: { min_change_pct: number; min_volume: number; max_volume: number };
}

export const DEFAULT_CONFIG: AppConfig = {
  brand: { name: null, tagline: null },
  default_tab: null,
  theme: { mode: "light", colors: {}, colors_dark: {} },
  animation: { enabled: true, duration_ms: 700 },
  dimension_labels: {},
  what_if: { indicator: "PMI", shock: -3, min: -10, max: 10, step: 0.5 },
  exceptions: { min_change_pct: 30, min_volume: 50, max_volume: 2000 },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Deep-merge `over` onto `base`, keeping only keys whose type matches the default. */
function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return base;
  const out: Obj = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Obj)[k];
    if (v === undefined) continue;
    if (isObj(b) && isObj(v)) {
      // free-form maps (colors, labels) take every string value
      out[k] = Object.keys(b).length === 0 ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) : merge(b, v);
    } else if (b === null || typeof b === typeof v) {
      out[k] = v;
    }
  }
  return out as T;
}

export function mergeConfig(raw: unknown): AppConfig {
  return merge(DEFAULT_CONFIG, raw);
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch("/data/config.json");
    if (!res.ok) return DEFAULT_CONFIG;
    return mergeConfig(await res.json());
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Resolve the display brand: config first, then meta.json "project", then a generic title. */
export function brandOf(cfg: AppConfig, project: string | null | undefined): { name: string; tagline: string } {
  if (cfg.brand.name) return { name: cfg.brand.name, tagline: cfg.brand.tagline ?? "" };
  const p = (project ?? "Demand Control Tower").trim();
  const [first, ...rest] = p.split(" ");
  return rest.length ? { name: first ?? p, tagline: cfg.brand.tagline ?? rest.join(" ") } : { name: p, tagline: cfg.brand.tagline ?? "" };
}

const safeKey = (k: string) => k.replace(/[^a-z0-9-]/gi, "");
const safeVal = (v: string) => v.replace(/[;{}<>]/g, "");

/** Inject theme colour overrides from config as a stylesheet so light and dark both apply. */
export function applyThemeColors(cfg: AppConfig) {
  if (typeof document === "undefined") return;
  const block = (sel: string, m: Record<string, string>) => {
    const body = Object.entries(m).map(([k, v]) => `--${safeKey(k)}:${safeVal(v)};`).join("");
    return body ? `${sel}{${body}}` : "";
  };
  const css = block(":root", cfg.theme.colors) + block(".dark", cfg.theme.colors_dark);
  let el = document.getElementById("app-config-theme");
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement("style"); el.id = "app-config-theme"; document.head.appendChild(el); }
  el.textContent = css;
}
