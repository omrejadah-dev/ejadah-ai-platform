"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AccountDetail } from "@/lib/admin";
import { PAGE_LABEL, ROUTES } from "@/lib/routes";

type Crumb = { label: string; href?: string };

const crumb = (r: { label: string; href: string }): Crumb => ({ label: r.label, href: r.href });
const HOME = crumb(ROUTES.home);
const ADMIN = crumb(ROUTES.admin);
const ACCOUNTS = crumb(ROUTES.adminAccounts);
const here = (r: { label: string }): Crumb => ({ label: r.label });

/** The full trail for a path; the last crumb is the current page and becomes the header title. */
function trail(path: string, accountName?: string): Crumb[] {
  const p = path.replace(/\/$/, "") || "/";
  if (p === ROUTES.home.href) return [here(ROUTES.home)];
  if (p === ROUTES.estimateNew.href) return [HOME, here(ROUTES.estimateNew)];
  if (p.startsWith("/estimate/")) return [HOME, crumb(ROUTES.myEstimates), { label: PAGE_LABEL.estimateResult }];
  if (p === ROUTES.myEstimates.href) return [HOME, here(ROUTES.myEstimates)];
  if (p === ROUTES.market.href) return [HOME, here(ROUTES.market)];
  if (p === ROUTES.legal.href) return [HOME, here(ROUTES.legal)];
  if (p === ROUTES.admin.href) return [HOME, here(ROUTES.admin)];
  if (p === ROUTES.adminAccounts.href) return [HOME, ADMIN, here(ROUTES.adminAccounts)];
  if (p.startsWith(ROUTES.adminAccounts.href + "/")) return [HOME, ADMIN, ACCOUNTS, { label: accountName ?? PAGE_LABEL.account }];
  if (p === ROUTES.adminPricing.href) return [HOME, ADMIN, here(ROUTES.adminPricing)];
  if (p === ROUTES.adminLogs.href) return [HOME, ADMIN, here(ROUTES.adminLogs)];
  return [HOME];
}

/** Breadcrumb line + page title, for the white top bar. */
export function PageTitle() {
  const pathname = usePathname();
  // on an account page, name it: shares the page's own query, so no extra request
  const accountId = pathname.match(/^\/admin\/accounts\/([^/]+)/)?.[1];
  const account = useQuery({
    queryKey: ["admin", "account", accountId],
    queryFn: () => api<AccountDetail>(`/api/admin/accounts/${accountId}`),
    enabled: !!accountId,
  });

  const crumbs = trail(pathname, account.data?.account.name);
  const parents = crumbs.slice(0, -1);
  const title = crumbs[crumbs.length - 1].label;

  return (
    <div className="min-w-0">
      {parents.length ? (
        <nav aria-label="مسار الصفحة" className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {parents.map((c, i) => (
            <Fragment key={i}>
              {i > 0 ? <i className="ti ti-chevron-left text-text-3" aria-hidden /> : null}
              <Link href={c.href!} className="font-semibold text-text-3 transition hover:text-ink">{c.label}</Link>
            </Fragment>
          ))}
          {/* the current page closes the trail for screen readers; sighted users read it as the title below */}
          <span className="sr-only" aria-current="page">{title}</span>
        </nav>
      ) : null}
      {/* the one h1 of every page */}
      <h1 className="truncate text-lg font-extrabold text-heading">{title}</h1>
    </div>
  );
}
