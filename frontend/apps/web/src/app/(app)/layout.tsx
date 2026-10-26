"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, Spinner } from "@platform/ui-kit";
import { api, type Me } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/ui";
import { MeContext } from "@/providers/MeProvider";
import { FEATURES } from "@/lib/features";
import { useEffect } from "react";

const NAV: { href: string; label: string; icon: string; cap?: string }[] = [
  { href: "/", label: "الرئيسية", icon: "ti-home" },
  ...(FEATURES.estimate ? [
    { href: "/estimate/new", label: "تسعير عقار", icon: "ti-calculator", cap: "price.estimate" },
    { href: "/my-estimates", label: "تسعيراتي", icon: "ti-history", cap: "price.estimate" },
  ] : []),
  { href: "/market", label: "السوق", icon: "ti-chart-line", cap: "market.history" },
  { href: "/legal", label: "اسأل إجادة القانونية", icon: "ti-scale", cap: "legal.ask" },
  { href: "/admin", label: "لوحة المدير", icon: "ti-settings", cap: "admin.*" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/auth/me"), retry: false, staleTime: 5 * 60_000 });

  useEffect(() => {
    if (me.isError) router.replace(`/login?from=${encodeURIComponent(pathname)}`);
  }, [me.isError, router, pathname]);

  if (!me.data) {
    return (
      <div className="grid min-h-svh place-items-center bg-bg">
        <Spinner />
      </div>
    );
  }

  const u = me.data;
  const visible = NAV.filter((n) => !n.cap || u.capabilities.includes(n.cap));

  async function logout() {
    await api("/api/auth/logout", { method: "POST", retry: false }).catch(() => {});
    qc.clear();
    router.replace("/login");
  }

  return (
    <MeContext.Provider value={u}>
      <div className="min-h-svh bg-bg">
        <header className="sticky top-0 z-20 border-b border-border bg-ink text-white">
          <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-4 px-4">
            {/* logo removed until Ejadah sends the correct one (it goes back here as the home link) */}
            <nav className="hidden items-center gap-1 md:flex">
              {visible.map((n) => (
                <Link key={n.href} href={n.href}
                  className={cn("rounded-lg px-3 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white",
                    (pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href))) && "bg-white/12 text-white")}>
                  <i className={cn("ti me-1.5 align-middle text-base", n.icon)} aria-hidden /> {n.label}
                </Link>
              ))}
            </nav>
            <div className="ms-auto flex items-center gap-3">
              <div className="hidden text-end leading-tight sm:block">
                <div className="text-sm font-bold">{u.name ?? u.phone}</div>
                <div className="text-[11px] text-white/60">{u.accountName ?? ROLE_LABEL[u.role]}</div>
              </div>
              <button onClick={logout} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white/85 hover:bg-white/10">خروج</button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-8">{children}</main>
        {/* mobile bottom nav */}
        <nav style={{ gridTemplateColumns: `repeat(${Math.min(4, visible.length)}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-surface md:hidden">
          {visible.slice(0, 4).map((n) => (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-text-2", pathname === n.href && "text-ink")}>
              <i className={cn("ti text-xl", n.icon)} aria-hidden />{n.label}
            </Link>
          ))}
        </nav>
      </div>
    </MeContext.Provider>
  );
}

