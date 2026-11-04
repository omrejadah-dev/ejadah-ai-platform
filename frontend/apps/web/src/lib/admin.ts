/** Admin panel types (backend Admin/AdminEndpoints.cs) and the small helpers its pages share. */
import type { Me } from "./api";

export type AccountStatus = "active" | "suspended" | "expired";
export type Overview = {
  accountsActive: number; accountsSuspended: number; accountsExpired: number; expiringIn30Days: number;
  seats: number; activeSessions: number; estimatesToday: number; estimates7d: number; legalToday: number; legal7d: number;
  aiCalls7d: number; aiFailures7d: number;
  days: { day: string; estimates: number; legal: number }[];
};
export type Plan = { id: number; code: string; name: string; role: Me["role"]; seats: number; dailyEstimateLimit: number; durationDays: number; priceSar: number | null };
export type Account = {
  id: string; name: string; role: Me["role"]; planId: number | null; planName: string | null; seatsTotal: number; seatsUsed: number;
  status: AccountStatus; startsAt: string; expiresAt: string; createdAt: string; ownerPhone: string | null;
  lastSeenAt: string | null; estimates30d: number; legal30d: number; notes: string | null;
};
export type Seat = {
  id: string; phone: string; displayName: string | null; isOwner: boolean; status: "active" | "disabled"; createdAt: string;
  lastSeenAt: string | null; online: boolean; ip: string | null; userAgent: string | null; estimates30d: number; legal30d: number;
};
export type AccountDetail = { account: Account; seats: Seat[] };
export type LegalQuestionRow = { id: string; createdAt: string; question: string; answer: string; provider: string; cited: number; durationMs: number | null; phone: string | null; accountName: string | null; search: "meaning" | "keyword" | null };
export type AdjustmentRule = { id: number; typeGroup: "villa" | "apartment" | "building"; factor: string; labelAr: string; kind: "per_year" | "per_floor" | "flag"; pct: number; maxAbsPct: number | null; enabled: boolean; updatedAt: string };
export type PricingSetting = { key: string; value: number; labelAr: string; updatedAt: string };

export const STATUS_LABEL: Record<AccountStatus, string> = { active: "فعّال", suspended: "موقوف", expired: "منتهي" };
export const statusTone = (s: AccountStatus) => (s === "active" ? "success" : s === "suspended" ? "danger" : "warning") as "success" | "danger" | "warning";

/** Whole days from today to a yyyy-mm-dd date (negative once it has passed). */
export const daysUntil = (ymd: string) => Math.round((new Date(ymd + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);

export const addDays = (ymd: string, days: number) => {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Chrome on Windows" style label from a user agent, enough to tell devices apart. */
export function deviceLabel(ua: string | null) {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  // on iPhone every browser runs on Safari's engine and names itself CriOS / EdgiOS / FxiOS, so check those before "Safari"
  const browser = /Edg\/|EdgiOS\//.test(ua) ? "Edge" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : /curl/.test(ua) ? "curl" : "متصفح";
  return os ? `${browser} · ${os}` : browser;
}
