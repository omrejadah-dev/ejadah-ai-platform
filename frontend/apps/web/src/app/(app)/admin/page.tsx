"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Spinner, StatCard, StatGrid, StatLabel } from "@platform/ui-kit";
import { api, fmt } from "@/lib/api";
import type { Overview } from "@/lib/admin";

export default function AdminOverviewPage() {
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<Overview>("/api/admin/overview"), refetchInterval: 60_000 });
  if (!q.data) return <div className="grid place-items-center py-16"><Spinner /></div>;
  const o = q.data;
  const peak = Math.max(1, ...o.days.map((d) => Math.max(d.estimates, d.legal)));

  return (
    <div className="space-y-5">
      <StatGrid cols={4}>
        <Stat label="حسابات فعّالة" value={o.accountsActive} href="/admin/accounts?status=active" />
        <Stat label="تنتهي خلال 30 يوماً" value={o.expiringIn30Days} accent={o.expiringIn30Days ? "amber" : "default"} href="/admin/accounts?status=expiring" />
        <Stat label="موقوفة أو منتهية" value={o.accountsSuspended + o.accountsExpired} accent={o.accountsSuspended + o.accountsExpired ? "red" : "default"} href="/admin/accounts?status=inactive" />
        <Stat label="المقاعد · المتصل منها الآن" value={`${fmt(o.seats)} · ${fmt(o.activeSessions)}`} />
        <Stat label="تسعيرات اليوم · آخر 7 أيام" value={`${fmt(o.estimatesToday)} · ${fmt(o.estimates7d)}`} />
        <Stat label="أسئلة قانونية اليوم · آخر 7 أيام" value={`${fmt(o.legalToday)} · ${fmt(o.legal7d)}`} href="/admin/logs" />
        <Stat label="طلبات الذكاء الاصطناعي (7 أيام)" value={fmt(o.aiCalls7d)} href="/admin/logs?tab=ai" />
        <Stat label="طلبات فشلت (7 أيام)" value={fmt(o.aiFailures7d)} accent={o.aiFailures7d ? "red" : "default"} href="/admin/logs?tab=ai" />
      </StatGrid>

      <Card>
        <CardHeader>
          <span className="font-bold text-heading">الاستخدام آخر 14 يوماً</span>
          <span className="ms-auto flex items-center gap-4 text-xs text-text-3">
            <span><i className="me-1 inline-block size-2.5 rounded-sm bg-ink align-middle" />تسعيرات</span>
            <span><i className="me-1 inline-block size-2.5 rounded-sm bg-gold align-middle" />أسئلة قانونية</span>
          </span>
        </CardHeader>
        <CardBody>
          <div className="flex h-44 items-end gap-1.5" dir="ltr">
            {o.days.map((d) => (
              <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.estimates} تسعيرة، ${d.legal} سؤال`}>
                <div className="flex flex-1 items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-3 rounded-t bg-ink" style={{ height: `${(d.estimates / peak) * 100}%`, minHeight: d.estimates ? 2 : 0 }} />
                  <div className="w-1/2 max-w-3 rounded-t bg-gold" style={{ height: `${(d.legal / peak) * 100}%`, minHeight: d.legal ? 2 : 0 }} />
                </div>
                <div className="mt-1 text-center text-[10px] text-text-3">{d.day.slice(8)}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value, href, accent = "default" }: { label: string; value: number | string; href?: string; accent?: "default" | "amber" | "red" }) {
  const body = (
    <StatCard accent={accent} className="h-full">
      <StatLabel>{label}</StatLabel>
      <div className="text-2xl font-extrabold text-heading" dir="ltr">{typeof value === "number" ? fmt(value) : value}</div>
    </StatCard>
  );
  return href ? <Link href={href} className="block transition hover:opacity-85">{body}</Link> : body;
}
