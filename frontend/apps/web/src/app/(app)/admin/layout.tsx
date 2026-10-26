"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, Note } from "@platform/ui-kit";
import { useMe } from "@/providers/MeProvider";

const TABS = [
  { href: "/admin", label: "نظرة عامة", icon: "ti-layout-dashboard" },
  { href: "/admin/accounts", label: "الحسابات", icon: "ti-users" },
  { href: "/admin/pricing", label: "نسب التسعير", icon: "ti-adjustments" },
  { href: "/admin/logs", label: "السجلات", icon: "ti-list-details" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  if (!me.capabilities.includes("admin.*")) return <Note tone="danger">هذه الصفحة لمدير النظام فقط.</Note>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-heading">لوحة المدير</h1>
        <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 sm:ms-auto">
          {TABS.map((t) => {
            const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold text-text-2 transition hover:bg-row-hover", active && "bg-ink text-white hover:bg-ink")}>
                <i className={cn("ti me-1 align-middle", t.icon)} aria-hidden /> {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
