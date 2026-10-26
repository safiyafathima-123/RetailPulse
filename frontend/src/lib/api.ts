export type StockStatus = "ok" | "low" | "out";
export type MovementType = "sale" | "restock" | "adjustment";
export type AlertType = "out" | "low" | "slow" | "excess";

export interface Product {
  id: number; name: string; sku: string; category: string;
  cost_price: number; selling_price: number; current_stock: number;
  reorder_threshold: number; safety_stock: number; lead_time_days: number;
  manual_daily_demand: number | null; supplier_name: string | null; supplier_contact: string | null;
  is_active: boolean; is_sample: boolean; stock_status: StockStatus; updated_at: string;
}
export interface ProductInput {
  name: string; sku: string; category: string; cost_price: number; selling_price: number;
  current_stock?: number; reorder_threshold: number; safety_stock: number; lead_time_days: number;
  manual_daily_demand: number | null; supplier_name: string | null; supplier_contact: string | null;
}
export interface Movement {
  id: number; product_id: number; product_name: string; sku: string; movement_type: MovementType;
  quantity_change: number; stock_after: number; reason: string | null; created_at: string;
}
export interface AlertItem {
  product_id: number; sku: string; name: string; category: string; current_stock: number;
  reorder_threshold: number; supplier_name: string | null; alert_type: AlertType; reason: string;
}
export interface Recommendation {
  product_id: number; sku: string; name: string; supplier_name: string | null; supplier_contact: string | null;
  available_stock: number; reorder_threshold: number; lead_time_days: number; safety_stock: number;
  daily_demand: number; demand_source: "sales_history" | "manual_estimate" | "threshold_fallback";
  demand_source_label: string; units_sold_window: number; window_days: number;
  stock_status: StockStatus; needs_order: boolean; target: number; suggested_quantity: number;
  formula: string; reason: string;
}
export interface Simulation {
  baseline: Recommendation;
  scenario: { daily_demand: number; lead_time_days: number; safety_stock: number; available_stock: number;
    target: number; suggested_quantity: number; formula: string };
  delta_target: number; delta_suggested: number; saved: boolean;
}
export interface ReportColumn { key: string; label: string; kind: "text" | "int" | "money" }
export interface Report {
  key: string; title: string; uses_dates: boolean; start: string | null; end: string | null;
  columns: ReportColumn[]; rows: Record<string, string | number>[];
  summary: { label: string; value: number; kind: "int" | "money" }[];
}
export interface Dashboard {
  period_days: number; start: string; end: string; active_products: number; inventory_value: number;
  units_on_hand: number; low_stock_count: number; out_of_stock_count: number;
  sales: { revenue: number; units: number; count: number };
  trend: { date: string; revenue: number }[]; urgent: AlertItem[];
}

export class ApiError extends Error {
  fields: Record<string, string>;
  status: number;
  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message); this.status = status; this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError("Can’t reach the RetailPulse server. Check that the backend is running on port 8000.", 0);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`; let fields: Record<string, string> = {};
    try { const body = await res.json(); if (typeof body.detail === "string") detail = body.detail; fields = body.fields ?? {}; } catch { /* keep default */ }
    throw new ApiError(detail, res.status, fields);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (p: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") s.set(k, String(v)); });
  const out = s.toString(); return out ? `?${out}` : "";
};

export const api = {
  dashboard: (days: number) => request<Dashboard>(`/dashboard${qs({ days })}`),
  products: (p: { search?: string; category?: string; status?: string; stock?: string } = {}) =>
    request<Product[]>(`/products${qs(p)}`),
  categories: () => request<string[]>("/categories"),
  createProduct: (b: ProductInput) => request<Product>("/products", json("POST", b)),
  updateProduct: (id: number, b: ProductInput) => request<Product>(`/products/${id}`, json("PUT", b)),
  archiveProduct: (id: number) => request<Product>(`/products/${id}/archive`, json("POST")),
  restoreProduct: (id: number) => request<Product>(`/products/${id}/restore`, json("POST")),
  recordSale: (b: { product_id: number; quantity: number; unit_price?: number; note?: string }) =>
    request<{ product: Product }>("/inventory/sales", json("POST", b)),
  recordRestock: (b: { product_id: number; quantity: number; reason?: string }) =>
    request<{ product: Product }>("/inventory/restocks", json("POST", b)),
  recordAdjustment: (b: { product_id: number; quantity_change: number; reason: string }) =>
    request<{ product: Product }>("/inventory/adjustments", json("POST", b)),
  movements: (p: { movement_type?: string; limit?: number } = {}) => request<Movement[]>(`/inventory/movements${qs(p)}`),
  alerts: () => request<AlertItem[]>("/alerts"),
  recommendations: () => request<Recommendation[]>("/reorder/recommendations"),
  simulate: (b: { product_id: number; daily_demand?: number; lead_time_days?: number; safety_stock?: number }) =>
    request<Simulation>("/reorder/simulate", json("POST", b)),
  report: (name: string, start?: string, end?: string) => request<Report>(`/reports/${name}${qs({ start, end })}`),
  reportCsvUrl: (name: string, start?: string, end?: string) => `/api/reports/${name}/csv${qs({ start, end })}`,
};
