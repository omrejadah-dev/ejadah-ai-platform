"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardBody, CardHeader } from "@platform/ui-kit";
import { api, CONFIDENCE_LABEL, TYPE_LABEL, type PropertyType, type ValuationSummary } from "@/lib/api";
import { dateTime, fmt } from "@/lib/format";
import { useMe } from "@/providers/MeProvider";
import { confidenceTone } from "@/lib/ui";
import { MarketMap } from "@/components/MarketMap";
import { FEATURES } from "@/lib/features";
import { EmptyLine, ListSkeleton, QueryView } from "@/components/QueryView";

const TYPES: { type: PropertyType; icon: string; hint: string }[] = [
  { type: "land", icon: "ti-map-2", hint: "قطعة أرض سكنية أو تجارية" },
  { type: "villa", icon: "ti-home-2", hint: "فيلا أو بيت" },
  { type: "apartment", icon: "ti-building-community", hint: "شقة أو وحدة سكنية" },
  { type: "building", icon: "ti-building", hint: "عمارة أو مبنى سكني" },
];

export default function HomePage() {
  const me = useMe();
  const recent = useQuery({ queryKey: ["estimates", 3], queryFn: () => api<ValuationSummary[]>("/api/estimates?limit=3"), enabled: FEATURES.estimate });
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold text-heading">مرحباً {me.name ?? ""}</h2>

      <MarketMap />

      {FEATURES.estimate ? (
      <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TYPES.map((t) => (
          <Link key={t.type} href={`/estimate/new?type=${t.type}`}
            className="group rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-gold hover:shadow-[0_12px_28px_-18px_rgba(16,43,78,.5)]">
            <span className="grid size-11 place-items-center rounded-xl bg-gold-soft text-gold-d"><i className={`ti ${t.icon} text-2xl`} aria-hidden /></span>
            <div className="mt-3 text-lg font-extrabold text-heading">{TYPE_LABEL[t.type]}</div>
            <div className="text-xs text-text-3">{t.hint}</div>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="font-bold text-heading">آخر تسعيراتك</span>
          <Link href="/my-estimates" className="text-xs font-bold text-gold-d hover:text-heading">عرض الكل</Link>
        </CardHeader>
        <CardBody>
          <QueryView q={recent} loading={<ListSkeleton />}
            empty={<EmptyLine className="py-6">لا توجد تسعيرات بعد. ابدأ باختيار نوع العقار أعلاه.</EmptyLine>}>
            {(list) => (
              <ul className="divide-y divide-border">
                {list.map((v) => (
                  <li key={v.id}>
                    <Link href={`/estimate/${v.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-row-hover">
                      <div>
                        <div className="font-bold text-text">{TYPE_LABEL[v.typeGroup]} · {v.district ?? v.city} · {fmt(v.areaM2)} م²</div>
                        <div className="text-xs text-text-3">{dateTime(v.createdAt)}</div>
                      </div>
                      <div className="text-end">
                        <div className="font-extrabold text-heading">{fmt(v.totalEstimate)} ريال</div>
                        <Badge tone={confidenceTone(v.confidence)}>{CONFIDENCE_LABEL[v.confidence]}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </CardBody>
      </Card>
      </>
      ) : null}
    </div>
  );
}
