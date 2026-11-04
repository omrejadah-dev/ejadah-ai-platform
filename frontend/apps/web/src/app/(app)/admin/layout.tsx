"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn, Note, Tab, TabBar } from "@platform/ui-kit";
import { can } from "@/lib/api";
import { ADMIN_TABS, ROUTES } from "@/lib/routes";
import { useMe } from "@/providers/MeProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  if (!can(me, ROUTES.admin.cap)) return <Note tone="danger">هذه الصفحة لمدير النظام فقط.</Note>;

  return (
    <div className="space-y-5">
      <TabBar aria-label="أقسام لوحة المدير" className="rounded-xl border border-border">
        {ADMIN_TABS.map((t) => {
          const active = t.href === ROUTES.admin.href ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Tab key={t.href} active={active} aria-current={active ? "page" : undefined}
              onClick={() => { if (pathname !== t.href) router.push(t.href); }}
              onMouseEnter={() => router.prefetch(t.href)}
              className="text-sm font-semibold">
              <i className={cn("ti align-middle", t.icon)} aria-hidden /> {t.label}
            </Tab>
          );
        })}
      </TabBar>
      {children}
    </div>
  );
}
