/** Every screen's address, label and icon, in one place: the side/bottom nav, the breadcrumbs and the admin tabs read from here. */
import { FEATURES } from "./features";

export type AppRoute = { href: string; label: string; icon: string; cap?: string };

export const ROUTES = {
  home: { href: "/", label: "الرئيسية", icon: "ti-home" },
  estimateNew: { href: "/estimate/new", label: "تسعير عقار", icon: "ti-calculator", cap: "price.estimate" },
  myEstimates: { href: "/my-estimates", label: "تسعيراتي", icon: "ti-history", cap: "price.estimate" },
  market: { href: "/market", label: "مقارنة الأحياء", icon: "ti-arrows-diff", cap: "market.history" },
  legal: { href: "/legal", label: "اسأل إجادة القانونية", icon: "ti-scale", cap: "legal.ask" },
  admin: { href: "/admin", label: "لوحة المدير", icon: "ti-settings", cap: "admin.*" },
  adminAccounts: { href: "/admin/accounts", label: "الحسابات", icon: "ti-users" },
  adminPricing: { href: "/admin/pricing", label: "نسب التسعير", icon: "ti-adjustments" },
  adminLogs: { href: "/admin/logs", label: "السجلات", icon: "ti-list-details" },
} as const satisfies Record<string, AppRoute>;

/** Side bar (desktop) and bottom bar (mobile), filtered by capability in the layout. */
export const NAV: AppRoute[] = [
  ROUTES.home,
  ...(FEATURES.estimate ? [ROUTES.estimateNew, ROUTES.myEstimates] : []),
  ROUTES.market,
  ROUTES.legal,
  ROUTES.admin,
];

/** Tabs at the top of the admin panel; the panel opens on the first one. */
export const ADMIN_TABS: AppRoute[] = [
  ROUTES.adminAccounts,
  ROUTES.adminPricing,
  ROUTES.adminLogs,
];

/**
 * A `?from=` value is only followed when it is a path on this site: "/x" yes; "//evil.com", "/\evil.com"
 * and "https://evil.com" (which browsers would treat as another origin) fall back to the home page.
 */
export function safeReturnPath(from: string | null | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return "/";
  return from;
}
