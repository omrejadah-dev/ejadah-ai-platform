"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, QueryErrorState, Spinner } from "@platform/ui-kit";
import { api, ApiError, can, type Me } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/ui";
import { localPhone } from "@/lib/format";
import { NAV, ROUTES } from "@/lib/routes";
import { MeContext } from "@/providers/MeProvider";
import { PageTitle } from "@/components/Breadcrumbs";
import { useEffect, useId, useRef, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/auth/me"), retry: false, staleTime: 5 * 60_000 });
  const [collapsed, setCollapsed] = useState(false);   // desktop sidebar folded away
  const [menu, setMenu] = useState(false);             // user menu in the top bar
  const menuId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuFirst = useRef<HTMLButtonElement>(null);
  // an expired session is sent to /login by api() itself; here only a refused principal (401/403) is
  const signedOut = me.error instanceof ApiError && (me.error.status === 401 || me.error.status === 403);

  useEffect(() => {
    if (signedOut) router.replace(`/login?from=${encodeURIComponent(pathname)}`);
  }, [signedOut, router, pathname]);

  // user menu: focus its first item on open; Escape closes it and gives focus back to the button
  useEffect(() => {
    if (!menu) return;
    menuFirst.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  if (me.isError && !signedOut && !me.data) {
    // the server could not be reached: say so and offer a retry instead of sending a signed-in user to /login
    return (
      <div className="grid min-h-svh place-items-center bg-bg">
        <QueryErrorState panel error={me.error} onRetry={() => void me.refetch()} retrying={me.isFetching} />
      </div>
    );
  }

  if (!me.data) {
    return (
      <div className="grid min-h-svh place-items-center bg-bg">
        <Spinner />
      </div>
    );
  }

  const u = me.data;
  const visible = NAV.filter((n) => !n.cap || can(u, n.cap));
  // an estimate result (/estimate/<id>) belongs under "تسعيراتي"
  const section = /^\/estimate\/(?!new)/.test(pathname) ? "/my-estimates" : pathname;
  const isActive = (href: string) => section === href || (href !== "/" && section.startsWith(href));
  const displayName = u.name ?? u.phone;
  // first letter of the first two words, skipping "ال" (عمر باموسى → عب، مدير النظام → من)
  const initials = (u.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.replace(/^ال(?=.)/, "")[0]).join("") || "؟";

  async function logout() {
    await api("/api/auth/logout", { method: "POST", retry: false }).catch(() => {});
    qc.clear();
    router.replace("/login");
  }

  return (
    <MeContext.Provider value={u}>
      <div className="min-h-svh bg-bg">
        {/* desktop: sidebar on the start (right) side */}
        <aside className={cn("fixed inset-y-0 start-0 z-30 hidden w-60 flex-col bg-ink text-white", !collapsed && "md:flex")}>
          {/* logo removed until Ejadah sends the correct one (it goes back here as the home link) */}
          <Link href={ROUTES.home.href} className="block border-b border-white/10 px-5 py-5 text-base font-extrabold leading-tight">
            إجادة<div className="text-[11px] font-semibold text-white/60">للذكاء الاصطناعي العقاري</div>
          </Link>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {visible.map((n) => (
              <Link key={n.href} href={n.href}
                className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                  isActive(n.href) ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/10 hover:text-white")}>
                <i className={cn("ti text-lg", n.icon)} aria-hidden />{n.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className={cn(!collapsed && "md:ps-60")}>
          {/* white top bar: sidebar toggle, breadcrumb + page title, the signed-in user */}
          <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-surface px-4">
            <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "إظهار القائمة" : "إخفاء القائمة"}
              className="hidden size-9 shrink-0 place-items-center rounded-xl border border-border text-text-2 transition hover:bg-row-hover md:grid">
              <i className="ti ti-layout-sidebar-right text-lg" aria-hidden />
            </button>
            <PageTitle />

            <div className="relative ms-auto">
              <button ref={menuButton} type="button" onClick={() => setMenu((m) => !m)} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-row-hover"
                aria-haspopup="menu" aria-expanded={menu} aria-controls={menu ? menuId : undefined}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-soft text-sm font-extrabold text-gold-d">{initials}</span>
                <span className="hidden text-start leading-tight sm:block">
                  <span className="block text-sm font-bold text-heading">{displayName}</span>
                  <span className="block text-[11px] text-text-3">{u.accountName ?? ROLE_LABEL[u.role]}</span>
                </span>
                <i className={cn("ti text-sm text-text-3", menu ? "ti-chevron-up" : "ti-chevron-down")} aria-hidden />
              </button>
              {menu ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
                  <div id={menuId} role="menu" aria-label={displayName} className="absolute end-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                    <div role="presentation" className="border-b border-border px-4 py-3">
                      <div className="text-sm font-bold text-heading">{displayName}</div>
                      <div className="text-xs text-text-3" dir="ltr">{localPhone(u.phone)}</div>
                    </div>
                    <button ref={menuFirst} type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-danger-text hover:bg-row-hover">
                      <i className="ti ti-logout" aria-hidden /> خروج
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-8">{children}</main>
        </div>

        <nav style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-surface md:hidden">
          {visible.map((n) => (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 px-0.5 py-2 text-center text-[10px] font-semibold leading-tight", isActive(n.href) ? "text-ink" : "text-text-2")}>
              <i className={cn("ti text-xl", n.icon)} aria-hidden />{n.label}
            </Link>
          ))}
        </nav>
      </div>
    </MeContext.Provider>
  );
}
