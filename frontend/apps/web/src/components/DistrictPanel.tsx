"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button, Spinner } from "@platform/ui-kit";
import { TrendChart } from "@/components/TrendChart";
import { api, fmt, TYPE_LABEL, type PropertyType, type TrendPoint } from "@/lib/api";

type Summary = {
  id: number; name: string; cityId: number; city: string; dataAsOf: string;
  types: { type: PropertyType; n12: number; ppm: number | null }[];
  trend: TrendPoint[];
  latest: { date: string; type: PropertyType; plan: string | null; plot: string | null; area: number; ppm: number; price: number }[];
};

export function DistrictPanel({ districtId, type, onClose, highlightYear }: { districtId: number; type: PropertyType; onType?: (t: PropertyType) => void; onClose: () => void; highlightYear?: number }) {
  const q = useQuery({ queryKey: ["district-summary", districtId, type], queryFn: () => api<Summary>(`/api/districts/${districtId}/summary?type=${type}`) });
  if (q.isLoading || !q.data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  const s = q.data;
  const estimateHref = `/estimate/new?type=${type}&cityId=${s.cityId}&districtId=${s.id}&districtName=${encodeURIComponent(s.name)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-gold-d">{s.city}</div>
          <h2 className="text-xl font-extrabold text-heading">{s.name}</h2>
          <div className="text-[11px] text-text-3">وسيط آخر 24 شهراً · البيانات حتى {s.dataAsOf}</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-text-3 hover:bg-row-hover" aria-label="إغلاق"><i className="ti ti-x text-lg" /></button>
      </div>

      {(() => {
        const t = s.types.find((x) => x.type === type);
        return (
          <div className="rounded-xl border border-ink bg-navy-soft p-4">
            <div className="text-xs font-bold text-text-2">{TYPE_LABEL[type]} · سعر المتر</div>
            <div className="mt-1 text-2xl font-extrabold text-heading">{t?.ppm ? fmt(t.ppm) : "—"}<span className="text-xs font-bold text-text-3"> ريال/م²</span></div>
            <div className="mt-0.5 text-xs text-text-3">{fmt(t?.n12 ?? 0)} صفقة في آخر 12 شهراً</div>
          </div>
        );
      })()}

      <div>
        <div className="mb-1 text-sm font-bold text-heading">اتجاه سعر المتر · {TYPE_LABEL[type]}</div>
        <TrendChart district={s.trend} height={150} highlightYear={highlightYear} />
      </div>

      <div>
        <div className="mb-1 text-sm font-bold text-heading">آخر صفقات {TYPE_LABEL[type]}</div>
        {s.latest.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {s.latest.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <div>
                  <div className="font-bold text-text">{fmt(d.area)} م² · {fmt(d.ppm)}/م²</div>
                  <div className="text-text-3" dir="ltr">{d.date}{d.plan ? ` · ${d.plan}` : ""}</div>
                </div>
                <div className="font-extrabold text-heading">{fmt(d.price)}</div>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-text-3">لا صفقات لهذا النوع في هذا الحي.</p>}
      </div>

      <Link href={estimateHref} className="block"><Button variant="primary" className="w-full"><i className="ti ti-calculator" aria-hidden /> سعّر عقاراً في هذا الحي</Button></Link>
    </div>
  );
}
