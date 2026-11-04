"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, cn, Skeleton, StatCard } from "@platform/ui-kit";
import { api } from "@/lib/api";
import { dayName, fmt } from "@/lib/format";
import { QueryView } from "@/components/QueryView";
import type { Overview } from "@/lib/admin";

export default function AdminOverviewPage() {
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<Overview>("/api/admin/overview"), refetchInterval: 60_000 });
  return (
    <QueryView q={q} loading={<OverviewSkeleton />} className="py-16">
      {(o) => <OverviewBody o={o} />}
    </QueryView>
  );
}

/** Stat cards in their final layout while the numbers load. */
function OverviewSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="جاري التحميل">
      {[4, 3].map((n, i) => (
        <div key={i}>
          <Skeleton className="mb-2 h-3.5 w-20" />
          <div className={cn("grid grid-cols-2 gap-3", n === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
            {Array.from({ length: n }, (_, k) => <Skeleton key={k} className="h-[118px] rounded-xl" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function OverviewBody({ o }: { o: Overview }) {
  const inactive = o.accountsSuspended + o.accountsExpired;
  const totalAccounts = o.accountsActive + inactive;

  return (
    <div className="space-y-6">
      <Section title="الحسابات">
        <Stat icon="ti-building-store" label="حسابات فعّالة" value={o.accountsActive}
          sub={`من ${fmt(totalAccounts)} حساب`} href="/admin/accounts?status=active" />
        <Stat icon="ti-calendar-due" label="تنتهي خلال 30 يوماً" value={o.expiringIn30Days} accent={o.expiringIn30Days ? "amber" : "default"}
          sub={o.expiringIn30Days ? "تحتاج تجديد قريباً" : "لا شيء قريب الانتهاء"} href="/admin/accounts?status=expiring" />
        <Stat icon="ti-ban" label="موقوفة أو منتهية" value={inactive} accent={inactive ? "red" : "default"}
          sub={`${fmt(o.accountsSuspended)} موقوف · ${fmt(o.accountsExpired)} منتهي`} href="/admin/accounts?status=inactive" />
        <Stat icon="ti-users" label="المقاعد" value={o.seats}
          sub={<><i className={cn("me-1 inline-block size-2 rounded-full align-middle", o.activeSessions ? "bg-success" : "bg-text-3")} />{fmt(o.activeSessions)} متصل الآن</>} />
      </Section>

      <Section title="الاستخدام" cols={3}>
        <Stat icon="ti-calculator" label="تسعيرات اليوم" value={o.estimatesToday} sub={`${fmt(o.estimates7d)} في آخر 7 أيام`} />
        <Stat icon="ti-scale" label="أسئلة قانونية اليوم" value={o.legalToday} sub={`${fmt(o.legal7d)} في آخر 7 أيام`} href="/admin/logs" />
        <Stat icon="ti-sparkles" label="طلبات الذكاء الاصطناعي" value={o.aiCalls7d} sub="في آخر 7 أيام" />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyBars title="التسعيرات" unit="تسعيرة" days={o.days.map((d) => ({ day: d.day, n: d.estimates }))} />
        <DailyBars title="الأسئلة القانونية" unit="سؤال" days={o.days.map((d) => ({ day: d.day, n: d.legal }))} />
      </div>
    </div>
  );
}

function Section({ title, cols = 4, children }: { title: string; cols?: 3 | 4; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-text-2">{title}</h2>
      <div className={cn("grid grid-cols-2 gap-3", cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>{children}</div>
    </section>
  );
}

function Stat({ icon, label, value, sub, href, accent = "default" }: {
  icon: string; label: string; value: number; sub: ReactNode; href?: string; accent?: "default" | "amber" | "red";
}) {
  const body = (
    <StatCard accent={accent} className="h-full">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-text-2">{label}</span>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-soft text-gold-d"><i className={cn("ti text-lg", icon)} aria-hidden /></span>
      </div>
      <div className="mt-2 text-3xl font-extrabold text-heading">{fmt(value)}</div>
      <div className="mt-1 text-xs text-text-3">{sub}</div>
    </StatCard>
  );
  return href ? <Link href={href} className="block h-full transition hover:opacity-85">{body}</Link> : body;
}

/** 1, 2, 5 × 10ⁿ at or above the peak, so the grid lines land on round numbers. */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** One series per chart (14 days): a bar per day, round grid lines; hovering a day shows its count in the header. */
function DailyBars({ title, unit, days }: { title: string; unit: string; days: { day: string; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = days.reduce((s, d) => s + d.n, 0);
  const max = niceMax(Math.max(0, ...days.map((d) => d.n)));
  const ticks = [max, max / 2, 0];
  const peakAt = total ? days.reduce((best, d, i) => (d.n > days[best].n ? i : best), 0) : -1;
  const h = hover == null ? null : days[hover];

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="font-bold text-heading">{title} · آخر 14 يوماً</span>
        {h ? (
          <span className="text-xs text-text-3">{dayName(h.day)} · <b className="text-sm text-heading">{fmt(h.n)}</b> {unit}</span>
        ) : (
          <span className="text-xs text-text-3">المجموع <b className="text-sm text-heading">{fmt(total)}</b></span>
        )}
      </CardHeader>
      <CardBody>
        <div className="relative" dir="ltr">
          <div className="flex h-48">
            {/* y axis */}
            <div className="flex w-7 flex-col justify-between pb-5 text-[10px] text-text-3">
              {ticks.map((t) => <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">{fmt(t)}</span>)}
            </div>
            <div className="relative flex-1">
              {/* grid */}
              <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
                {ticks.map((t) => <div key={t} className={cn("border-t", t === 0 ? "border-border-md" : "border-dashed border-border")} />)}
              </div>
              {/* bars */}
              <div className="absolute inset-0 flex">
                {days.map((d, i) => (
                  <div key={d.day} className="flex h-full flex-1 cursor-default flex-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                    <div className={cn("relative mx-auto flex w-full max-w-[22px] flex-1 items-end px-[1px] pb-0", hover === i && "rounded-t bg-row-hover")}>
                      <div className={cn("w-full rounded-t-[4px] transition-colors", hover === i ? "bg-gold-d" : "bg-ink")}
                        style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 3 : 0 }}>
                        {i === peakAt ? <span className="absolute -mt-4 w-[calc(100%-2px)] text-center text-[10px] font-bold text-heading">{fmt(d.n)}</span> : null}
                      </div>
                    </div>
                    <div className={cn("h-5 pt-1 text-center text-[10px] leading-none", i === days.length - 1 ? "font-bold text-heading" : "text-text-3")}>
                      {i === days.length - 1 ? "اليوم" : d.day.slice(8)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {!total ? <div className="pointer-events-none absolute inset-0 bottom-5 grid place-items-center text-xs text-text-3" dir="rtl">لا يوجد نشاط في آخر 14 يوماً</div> : null}
        </div>
      </CardBody>
    </Card>
  );
}
