"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn, Note } from "@platform/ui-kit";
import { api, can } from "@/lib/api";
import { daysUntil, type Account } from "@/lib/admin";
import { ADMIN_TABS, ROUTES } from "@/lib/routes";
import { useMe } from "@/providers/MeProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (!can(me, ROUTES.admin.cap)) return <Note tone="danger">هذه الصفحة لمدير النظام فقط.</Note>;
  return (
    <div className="space-y-5">
      <AdminTabs />
      {children}
    </div>
  );
}

/** The admin sections as pill tabs (real links). «الحسابات» carries how many accounts need the admin (ending within
 *  30 days, suspended or expired), from the accounts list that tab already loads. */
function AdminTabs() {
  const pathname = usePathname();
  const accounts = useQuery({ queryKey: ["admin", "accounts"], queryFn: () => api<Account[]>("/api/admin/accounts"), staleTime: 60_000 }).data ?? [];
  const attention = accounts.filter((a) => a.status !== "active" || daysUntil(a.expiresAt) <= 30).length;

  return (
    <nav aria-label="أقسام لوحة المدير" className="overflow-x-auto rounded-2xl border border-border bg-surface p-1.5">
      <ul className="flex min-w-max gap-1">
        {ADMIN_TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          const badge = t.href === ROUTES.adminAccounts.href && attention > 0 ? attention : null;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition",
                  active ? "bg-gold-soft text-heading" : "text-text-2 hover:bg-row-hover hover:text-heading")}>
                <i className={cn("ti text-lg", t.icon, active ? "text-gold-d" : "text-text-3")} aria-hidden />
                {t.label}
                {badge ? (
                  <span className="grid min-w-5 place-items-center rounded-full bg-amber px-1.5 text-[11px] font-extrabold leading-5 text-white"
                    title="حسابات تحتاج انتباه: تنتهي قريباً أو موقوفة أو منتهية">{badge}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
