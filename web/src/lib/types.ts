export type DimKey = "family" | "sku" | "region" | "channel" | "customer";

export interface Cube {
  months: string[];
  last_hist: number;
  dims: { sku: string[]; region: string[]; channel: string[]; customer: string[]; family: string[] };
  sku_family: number[];
  rules: string[];
  hist: { m: number[]; sku: number[]; reg: number[]; ch: number[]; cus: number[]; u: number[]; d: number[]; r: number[]; miss: number[] };
  fc: { m: number[]; sku: number[]; reg: number[]; ch: number[]; cus: number[]; p10: number[]; p50: number[]; p90: number[]; r: number[]; rule: number[] };
}

export interface DqIssue { file: string; issue: string; rows_affected: number; action: string; severity: string }
export interface Dq {
  summary: {
    before: Record<string, number>;
    after: Record<string, number>;
    raw_rows: number;
    clean_observed_rows: number;
    panel_rows: number;
    series: number;
  };
  issues: DqIssue[];
}

export interface AnomalyRow {
  anomaly_id: string;
  type: string;
  class: string;
  date_start: string;
  date_end: string;
  SKU_ID: string | null;
  Region: string | null;
  Customer_Name: string | null;
  scope: string;
  value_observed: number | null;
  value_expected: number | null;
  impact_pct: number | null;
  reason: string;
  action: string;
}
export type EventRow = Record<string, string | number | boolean | null>;
export interface Anomalies { register: AnomalyRow[]; events: EventRow[] }

export interface MetricRow { origin?: string; method: string; wape: number; bias: number; n: number }
export interface DimMetricRow extends MetricRow { dim: string; key: string }
export interface ScaleRow { level: string; h_bucket: string; q10: number; q50: number; q90: number }
export interface Backtest {
  overall: MetricRow[];
  by_dim: DimMetricRow[];
  aggregate: Array<{ value: number; metric?: string; method?: string }>;
  coverage: Array<Record<string, string | number>>;
  scale: ScaleRow[];
  importance: Array<{ feature: string; gain: number }>;
}

export interface OutlookRow { key: string; last12: number; next12: number; growth_pct: number | null; family?: string }
export interface LagRow {
  family: string;
  indicator: string;
  best_lag: number;
  corr: number;
  beta: number;
  lag_early: number;
  lag_late: number;
  stable: boolean;
}
export interface InsightsFile {
  insights: {
    headline: string[] | string;
    outlook_Product_Family: OutlookRow[];
    outlook_Region: OutlookRow[];
    outlook_Sales_Channel: OutlookRow[];
    top_growth: OutlookRow[];
    top_decline: OutlookRow[];
    season_index: Array<{ month: number; index: number }>;
    holiday_dips_pct: Array<{ holiday: string; month: number; dip_pct: number }>;
    stockouts: { lost_units: number; lost_revenue: number; events?: number; by_reason?: Array<{ reason: string; lost_revenue: number }> };
    price_effect: { elasticity?: number | null; price_change_pct?: number | null; note: string };
    p90_buffer_pct_by_family: Array<{ family: string; buffer_pct: number; raw_pct?: number; n?: number }>;
    p90_buffer_pooled_pct?: number;
    lifecycle: { eol: number; launches: number; discontinued: number; notes: string[] };
    macro_leaders: LagRow[];
    powertrain_share_by_year: Array<Record<string, number | boolean>>;
    planner_actions: string[];
  };
  lags: LagRow[];
  series: Array<Record<string, string | number | boolean>>;
}

export interface StockoutEvent {
  month: string;
  SKU_ID: string;
  Product_Family: string;
  Region: string;
  Sales_Channel: string;
  Customer_Name: string | null;
  reason: string;
  lost_units: number;
  lost_revenue: number;
}

export interface LifecycleSku {
  SKU_ID: string;
  Product_Family: string;
  status: string;
  launch_date: string | null;
  eol_date: string | null;
  successor: string | null;
  predecessor: string | null;
  unit_price?: number;
  first_sale: string | null;
  last_sale: string | null;
  forecast_19m: number;
}

export interface ProfileRow {
  SKU_ID: string;
  Region: string;
  demand_class: string;
  zero_share_36m: number;
  cycle_period: number | null;
  adi?: number | null;
  cv2?: number | null;
  mean_36m?: number;
}

export interface ExceptionFlag {
  SKU_ID: string | null;
  Region: string | null;
  Sales_Channel: string | null;
  Customer_Name: string | null;
  flag: string;
  detail: string;
}

export interface Meta {
  project?: string;
  competition?: string;
  sample_data?: boolean;
  history_end?: string;
  forecast_start?: string;
  horizon_months?: number;
  model?: string;
  generated_at?: string;
}

export interface Dataset {
  cube: Cube;
  dq: Dq | null;
  anomalies: Anomalies | null;
  backtest: Backtest | null;
  insights: InsightsFile | null;
  stockouts: StockoutEvent[] | null;
  lifecycle: LifecycleSku[] | null;
  profile: ProfileRow[] | null;
  exceptions: ExceptionFlag[] | null;
  meta: Meta | null;
  failed: string[];
}

export type Filters = Record<DimKey, number | null>;
export const EMPTY_FILTERS: Filters = { family: null, sku: null, region: null, channel: null, customer: null };
