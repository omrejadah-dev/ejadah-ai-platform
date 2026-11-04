"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { buttonLinkClassName } from "@platform/ui-kit";
import { api, MAP_TYPE_LABEL, TYPE_LABEL, type MapType, type PropertyType, type TrendPoint } from "@/lib/api";
import { fmt } from "@/lib/format";
import { TrendChart } from "@/components/TrendChart";
import { CenteredSpinner, QueryView } from "@/components/QueryView";
import { FEATURES } from "@/lib/features";

type Summary = {
  id: number; name: string; cityId: number; city: string; dataAsOf: string;
  types: { type: MapType; n12: number; ppm: number | null }[];
  trend: TrendPoint[];
  latest: { date: string; type: PropertyType; plan: string | null; plot: string | null; area: number; ppm: number; price: number }[];
};

/** Panel and trend chart share this query, so one request serves both. */
const useDistrictSummary = (districtId: number, type: MapType) =>
  useQuery({ queryKey: ["district-summary", districtId, type], queryFn: () => api<Summary>(`/api/districts/${districtId}/summary?type=${type}`) });

export function DistrictPanel({ districtId, type, onClose }: { districtId: number; type: MapType; onClose: () => void }) {
  const q = useDistrictSummary(districtId, type);
  return (
    <QueryView q={q} errorLine="تعذّر تحميل بيانات الحي" loading={<CenteredSpinner className="h-40 py-0" />}>
      {(s) => <PanelBody s={s} type={type} onClose={onClose} />}
    </QueryView>
  );
}

function PanelBody({ s, type, onClose }: { s: Summary; type: MapType; onClose: () => void }) {
  const estimateHref = `/estimate/new?type=${type === "all" ? "land" : type}&cityId=${s.cityId}&districtId=${s.id}&districtName=${encodeURIComponent(s.name)}`;
  const t = s.types.find((x) => x.type === type);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-gold-d">{s.city}</div>
          <h2 className="text-xl font-extrabold text-heading">{s.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-text-3 hover:bg-row-hover" aria-label="إغلاق"><i className="ti ti-x text-lg" aria-hidden /></button>
      </div>

      <div className="rounded-xl border border-ink bg-navy-soft p-4">
        <div className="text-xs font-bold text-text-2">{MAP_TYPE_LABEL[type]} · سعر المتر</div>
        <div className="mt-1 text-2xl font-extrabold text-heading">{t?.ppm ? fmt(t.ppm) : "—"}<span className="text-xs font-bold text-text-3"> ريال/م²</span></div>
        <div className="mt-0.5 text-xs text-text-3">{fmt(t?.n12 ?? 0)} صفقة في آخر 12 شهراً</div>
      </div>

      <div>
        <div className="mb-1 text-sm font-bold text-heading">{type === "all" ? "آخر الصفقات" : `آخر صفقات ${TYPE_LABEL[type]}`}</div>
        {s.latest.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {s.latest.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <div>
                  <div className="font-bold text-text">{type === "all" ? `${TYPE_LABEL[d.type]} · ` : ""}{fmt(d.area)} م² · {fmt(d.ppm)}/م²</div>
                  <div className="text-text-3" dir="ltr">{d.date}{d.plan ? ` · ${d.plan}` : ""}</div>
                </div>
                <div className="font-extrabold text-heading">{fmt(d.price)}</div>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-text-3">لا صفقات لهذا النوع في هذا الحي.</p>}
      </div>

      {FEATURES.estimate ? (
        <Link href={estimateHref} className={buttonLinkClassName({ variant: "primary", className: "w-full" })}>
          <i className="ti ti-calculator" aria-hidden /> سعّر عقاراً في هذا الحي
        </Link>
      ) : null}
    </div>
  );
}

/** Wide trend chart shown under the map for the selected district. */
export function DistrictTrend({ districtId, type, highlightYear }: { districtId: number; type: MapType; highlightYear?: number }) {
  const q = useDistrictSummary(districtId, type);
  return (
    <QueryView q={q} errorLine="تعذّر تحميل اتجاه الأسعار" loading={<CenteredSpinner className="h-[260px] py-0" />}>
      {(s) => (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-heading">اتجاه سعر المتر · {MAP_TYPE_LABEL[type]} · {s.name}</div>
            <div className="text-[11px] text-text-3">وسيط سنوي من صفقات وزارة العدل</div>
          </div>
          <TrendChart district={s.trend} height={240} highlightYear={highlightYear} />
        </div>
      )}
    </QueryView>
  );
}
