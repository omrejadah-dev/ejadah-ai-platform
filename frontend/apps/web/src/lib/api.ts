/**
 * API client. Same-origin (/api/* is proxied by Next to ASP.NET), cookies carry the session.
 * On 401 it tries one silent refresh (the 15-minute access cookie is renewed from the 30-day refresh cookie),
 * then redirects to /login with the reason.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public type: string | undefined,
    message: string,
    public errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type Problem = { title?: string; type?: string; status?: number; errors?: Record<string, string[]> };

/** The sign-in calls themselves: a 401 from them is the answer (wrong code, no refresh cookie), not an expired session. */
const NO_REFRESH = ["/api/auth/refresh", "/api/auth/otp", "/api/auth/verify"];
const refreshes = (path: string) => !NO_REFRESH.some((p) => path === p || path.startsWith(p + "?"));

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export type ApiInit = RequestInit & {
  json?: unknown;
  /** Try one silent refresh on a 401 (default true). */
  retry?: boolean;
  /** When the session cannot be refreshed, go to /login (default true). The login page itself passes false. */
  redirectOn401?: boolean;
};

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, retry = true, redirectOn401 = true, ...rest } = init;
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (res.status === 401 && retry && refreshes(path)) {
    if (await tryRefresh()) return api<T>(path, { ...init, retry: false });
    if (redirectOn401 && typeof window !== "undefined") {
      const reason = await res.json().then((p: Problem) => p.type).catch(() => undefined);
      // a full page load on purpose: nothing of the old session (cached queries, state) survives into the sign-in
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?reason=${encodeURIComponent(reason ?? "expired")}&from=${encodeURIComponent(window.location.pathname)}`;
      // the page is going away: settle never, so no caller flashes an error in the meantime
      return new Promise<T>(() => {});
    }
  }

  if (!res.ok) {
    const p: Problem | null = await res.json().catch(() => null);
    const msg = p?.errors ? Object.values(p.errors).flat().join("، ") : (p?.title ?? `خطأ ${res.status}`);
    throw new ApiError(res.status, p?.type, msg, p?.errors);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- types mirrored from the backend ----
export type Me = {
  kind: "seat" | "admin";
  id: string;
  accountId: string | null;
  role: "broker" | "office" | "investor" | "developer" | "admin";
  phone: string;
  name: string | null;
  isOwner: boolean;
  capabilities: string[];
  accountName: string | null;
  expiresAt: string | null;
};
/** Same rule as the server (TokenService.Has): the system admin may do everything. */
export const can = (me: Pick<Me, "capabilities">, cap: string) => me.capabilities.includes(cap) || me.capabilities.includes("admin.*");

export type City = { id: number; name: string; region: string; deals: number };
export type District = { id: number; name: string; nMarketDeals: number };
export type PropertyType = "land" | "villa" | "apartment" | "building";
/** The map also shows the four types together. */
export type MapType = PropertyType | "all";

export type EstimateRequest = {
  propertyType: PropertyType;
  cityId: number;
  districtId: number;
  planNo?: string;
  plotNo?: string;
  areaM2: number;
  ageYears?: number;
  floors?: number;
  units?: number;
  annualIncome?: number;
  features: string[];
  notes?: string;
};
export type Comparable = { date: string; district: string | null; plan: string | null; plot: string | null; area: number; ppm: number; price: number };
export type TrendPoint = { year: number; ppm_median: number; n_deals: number };
export type EstimateResult = {
  ppm_estimate?: number; ppm_low?: number; ppm_high?: number;
  total_estimate?: number; total_low?: number; total_high?: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  level_used: number | null; window_months?: number; sample_size: number;
  sample_median_age_months?: number; time_adjustment_pct?: number; iqr_ratio?: number;
  comparables?: Comparable[]; district_trend?: TrendPoint[]; city_trend?: TrendPoint[];
  plot_history?: { date: string; price: number; area: number; ppm: number }[] | null;
  data_as_of: string;
};
/** Legal assistant (POST /api/legal/ask): the answer cites sources by their 1-based number, e.g. [2]. */
export type LegalSource = { id: number; title: string; label: string; chapter: string; text: string; amendments: string[]; sourceUrl: string; number: number; cited: boolean };
export type LegalAnswer = { id: string; question: string; answer: string; provider: string; sources: LegalSource[]; disclaimer: string; durationMs: number };
export type LegalLaw = { id: number; title: string; authority: string; sourceUrl: string; articles: number; amended: number };
export type LegalHistory = { id: string; createdAt: string; question: string; answer: string };

/** Market price → age / floors / features (admin table) → AI reading of the notes → one final price. */
export type PricingBreakdown = {
  marketPpm: number; marketTotal: number;
  items: { factor: string; label: string; pct: number }[]; rulesPct: number; rulesCapped: boolean;
  aiPct: number | null; aiReason: string | null; aiItems?: { label: string; effect: "up" | "down" | "none" }[] | null; aiProvider?: string | null;
  finalPpm: number; finalTotal: number;
};
export type EstimateResponse = { id: string; request: EstimateRequest; result: EstimateResult; grossYieldPct: number | null; durationMs: number; createdAt?: string; pricing?: PricingBreakdown | null };
export type ValuationSummary = { id: string; createdAt: string; typeGroup: PropertyType; areaM2: number; city: string; district: string | null; confidence: EstimateResult["confidence"]; ppmEstimate: number | null; totalEstimate: number | null };

export const TYPE_LABEL: Record<PropertyType, string> = { land: "أرض", villa: "فيلا", apartment: "شقة", building: "عمارة" };
export const isPropertyType = (v: string | null | undefined): v is PropertyType => v != null && Object.hasOwn(TYPE_LABEL, v);
export const MAP_TYPE_LABEL: Record<MapType, string> = { all: "الكل", ...TYPE_LABEL };
export const CONFIDENCE_LABEL: Record<EstimateResult["confidence"], string> = { high: "ثقة عالية", medium: "ثقة متوسطة", low: "ثقة منخفضة", insufficient: "بيانات غير كافية" };

/** GET /api/districts/{id}/history answers in camelCase; the trend chart reads the estimate's snake_case points. Mapped here only. */
type HistoryRow = { year: number; ppmMedian: number; nDeals: number };
export const districtHistory = (districtId: number, type: PropertyType) =>
  api<HistoryRow[]>(`/api/districts/${districtId}/history?type=${type}`)
    .then((rows): TrendPoint[] => rows.map((r) => ({ year: r.year, ppm_median: r.ppmMedian, n_deals: r.nDeals })));
