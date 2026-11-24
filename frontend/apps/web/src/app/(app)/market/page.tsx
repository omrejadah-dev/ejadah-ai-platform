"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { cn, Skeleton } from "@platform/ui-kit";
import { MAP_TYPE_LABEL, TYPE_LABEL, type MapType, type PropertyType } from "@/lib/api";
import { fmt } from "@/lib/format";
import { THIN_DEALS, TYPE_ICON } from "@/lib/ui";
import { MarketMap } from "@/components/MarketMap";
import type { DistrictProps } from "@/components/DistrictMap";
import { districtSummaryQuery, type DistrictSummary } from "@/components/DistrictPanel";
import { ChangePill, COMPARE_COLORS, TrendChart, trendChange } from "@/components/TrendChart";

/** How many districts can be compared side by side. */
const MAX = 3;
const TYPES = Object.keys(TYPE_LABEL) as PropertyType[];
const isMapType = (v: string | null): v is MapType => v != null && Object.hasOwn(MAP_TYPE_LABEL, v);

/** «السوق»: pick up to three districts on the price map (any city: switch city and keep picking) and compare their price
 *  per m², deals and growth. The choice lives in the URL (?d=4431,4325&type=land): it survives a reload and can be shared. */
function MarketInner() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const idsKey = params.get("d") ?? "";
  const ids = useMemo(() => idsKey.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX), [idsKey]);
  const t = params.get("type");
  const type: MapType = isMapType(t) ? t : "land";

  // a 4th district: say so for a moment instead of silently ignoring the click
  const [full, setFull] = useState(false);
  useEffect(() => { if (!full) return; const id = setTimeout(() => setFull(false), 3500); return () => clearTimeout(id); }, [full]);

  const pick = useMemo(() => {
    const go = (next: number[], nextType: MapType) =>
      router.replace(`${path}?${new URLSearchParams({ ...(next.length ? { d: next.join(",") } : {}), type: nextType })}`, { scroll: false });
    return {
      ids, colors: COMPARE_COLORS,
      onToggle: (p: DistrictProps) => {
        if (ids.includes(p.id)) go(ids.filter((x) => x !== p.id), type);
        else if (ids.length < MAX) go([...ids, p.id], type);
        else setFull(true);
      },
      remove: (id: number) => go(ids.filter((x) => x !== id), type),
      setType: (k: MapType) => go(ids, k),
    };
  }, [ids, type, router, path]);

  const summaries = useQueries({ queries: ids.map((id) => ({ ...districtSummaryQuery(id, type), staleTime: 10 * 60_000 })) });
  const loaded = summaries.map((q) => q.data).filter((s): s is DistrictSummary => !!s);

  return (
    <div className="space-y-5">
      <MarketMap pick={pick} type={type} onType={pick.setType} startCityId={summaries[0]?.data?.cityId ?? null} />

      {/* the comparison: one chip per picked district (its map colour), then an empty slot that says what to do */}
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <span className="text-sm font-bold text-heading">المقارنة</span>
        {ids.map((id, i) => {
          const s = summaries[i]?.data;
          return (
            <span key={id} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface ps-3 pe-1.5 font-extrabold text-heading">
              <span className="size-3 rounded-full" style={{ background: COMPARE_COLORS[i] }} aria-hidden />
              {s ? <>{s.name} <span className="text-xs font-medium text-text-3">{s.city}</span></> : <Skeleton className="h-4 w-20" />}
              <button type="button" onClick={() => pick.remove(id)} aria-label={`إزالة ${s?.name ?? "الحي"} من المقارنة`}
                className="grid size-8 place-items-center rounded-lg text-text-3 hover:bg-row-hover hover:text-ink"><i className="ti ti-x" aria-hidden /></button>
            </span>
          );
        })}
        {ids.length < MAX ? (
          <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-border-md px-3 text-sm text-text-3">
            <i className="ti ti-hand-click text-base text-gold-d" aria-hidden />
            {ids.length ? `اضغط حياً آخر في الخريطة (حتى ${MAX})` : `اضغط على أي حي في الخريطة لإضافته، حتى ${MAX} أحياء`}
          </span>
        ) : null}
        {full ? <span className="text-sm font-bold text-amber-text">وصلت إلى {MAX} أحياء: احذف حياً لتضيف غيره</span> : null}
      </div>

      {ids.length ? (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))` }}>
            {ids.map((id, i) => <Column key={id} s={summaries[i]?.data} all={loaded} type={type} color={COMPARE_COLORS[i]} failed={summaries[i]?.isError} />)}
          </div>
          {loaded.length ? (
            <section className="rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
                <h2 className="font-extrabold text-heading">سعر متر {MAP_TYPE_LABEL[type]} عبر السنوات</h2>
                <span className="text-xs text-text-3">وسيط سنوي من صفقات وزارة العدل</span>
              </div>
              <div className="px-6 py-5">
                <TrendChart height={260} compare={ids.map((id, i) => summaries[i]?.data).filter((s): s is DistrictSummary => !!s).map((s) => ({ label: `${s.name} (${s.city})`, points: s.trend.filter((p) => p.n_deals >= 3) }))} />
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** One district's column. A star marks the best value of a row among the compared districts (more deals, more growth). */
function Column({ s, all, type, color, failed }: { s?: DistrictSummary; all: DistrictSummary[]; type: MapType; color: string; failed?: boolean }) {
  if (failed) return <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-text-3">تعذّر تحميل بيانات الحي</div>;
  if (!s) return <Skeleton className="h-[360px] rounded-2xl" />;
  const cur = (x: DistrictSummary) => x.types.find((r) => r.type === type);
  const best = (f: (x: DistrictSummary) => number | null) => {
    const v = f(s);
    const vals = all.map(f).filter((x): x is number => x != null);
    return all.length > 1 && v != null && v === Math.max(...vals);
  };
  const deals = (x: DistrictSummary) => cur(x)?.n12 ?? 0;
  const yoy = (x: DistrictSummary) => trendChange(x.trend);
  const five = (x: DistrictSummary) => trendChange(x.trend, 5);
  const ppm = cur(s)?.ppm;
  const estimateHref = `/estimate/new?type=${type === "all" ? "land" : type}&cityId=${s.cityId}&districtId=${s.id}&districtName=${encodeURIComponent(s.name)}&cityName=${encodeURIComponent(s.city)}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-t-[5px] px-5 py-4" style={{ borderTopColor: color }}>
        <div className="text-xl font-extrabold text-heading">{s.name}</div>
        <div className="text-xs text-text-3">{s.city}</div>
      </div>
      <div className="border-t border-border px-5 py-4">
        <div className="text-xs text-text-3">سعر متر {MAP_TYPE_LABEL[type]}</div>
        <div className="mt-0.5 text-[28px] font-extrabold text-heading tabular-nums">{ppm ? fmt(ppm) : "—"} <span className="text-sm font-bold text-text-3">ريال</span></div>
        {deals(s) < THIN_DEALS ? <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-text"><i className="ti ti-alert-triangle" aria-hidden /> بيانات قليلة: {fmt(deals(s))} صفقة فقط في 12 شهراً، فالأرقام تقريبية</div> : null}
      </div>
      <dl className="divide-y divide-border border-t border-border text-sm">
        <Row label="صفقات آخر 12 شهراً"><span className="tabular-nums">{fmt(deals(s))}</span> <Star on={best(deals)} /></Row>
        <Row label="التغير عن السنة السابقة"><ChangePill value={yoy(s)} suffix="" /> <Star on={best(yoy)} /></Row>
        <Row label="النمو خلال 5 سنوات"><ChangePill value={five(s)} suffix="" /> <Star on={best(five)} /></Row>
      </dl>
      <div className="border-t border-border bg-surface-2 px-5 py-3">
        <div className="mb-2 text-xs text-text-3">سعر المتر لكل الأنواع</div>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((k) => {
            const r = s.types.find((x) => x.type === k);
            return (
              <div key={k} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", k === type && "bg-surface ring-1 ring-border-md")}>
                <i className={cn("ti text-base text-gold-d", TYPE_ICON[k])} aria-hidden />
                <span className="text-xs text-text-2">{TYPE_LABEL[k]}</span>
                <b className="ms-auto text-xs text-heading tabular-nums">{r?.ppm ? fmt(r.ppm) : "—"}</b>
              </div>
            );
          })}
        </div>
      </div>
      <Link href={estimateHref} className="mt-auto flex items-center justify-center gap-1.5 border-t border-border px-5 py-3 text-sm font-bold text-heading hover:bg-row-hover">
        <i className="ti ti-calculator" aria-hidden /> سعّر عقاراً في هذا الحي
      </Link>
    </article>
  );
}

/** Marks the best value of a row among the compared districts. */
function Star({ on }: { on: boolean }) {
  return on ? <i className="ti ti-star text-sm text-gold" role="img" aria-label="الأفضل بين الأحياء" /> : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-text-2">{label}</dt>
      <dd className="flex items-center gap-1.5 font-bold text-heading">{children}</dd>
    </div>
  );
}

export default function MarketPage() {
  return <Suspense fallback={null}><MarketInner /></Suspense>;
}
