"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, cn, QueryErrorState, Spinner } from "@platform/ui-kit";
import { DistrictPanel, DistrictTrend } from "@/components/DistrictPanel";
import { api, MAP_TYPE_LABEL, type MapType } from "@/lib/api";
import type { DistrictCollection, DistrictProps, RegionCollection, RegionProps } from "@/components/DistrictMap";
import { breaks, tooltipHtml, valueFor, type Metric, type Period } from "@/components/mapScale";
import { busiestCityId, CityPicker, type PickerRegion } from "@/components/CityPicker";
import { MapLegend, Seg, YearPlayer } from "@/components/MapControls";

/** Map height: shorter on phones. */
const MAP_HEIGHT = "h-[440px] sm:h-[600px]";

const DistrictMap = dynamic(() => import("@/components/DistrictMap").then((m) => m.DistrictMap), {
  ssr: false,
  loading: () => <div className={cn("grid place-items-center rounded-[var(--radius-lg)] border border-border bg-surface-2", MAP_HEIGHT)}><Spinner /></div>,
});

/** GET /api/map/cities: regions (busiest first) → their cities that have district polygons. */
type MapRegion = PickerRegion & { deals: number; cities: { id: number; name: string; districts: number; deals: number }[] };

export function MarketMap() {
  const [pickedCity, setCityId] = useState<number | null>(null);
  const [type, setType] = useState<MapType>("land");
  const [metric, setMetric] = useState<Metric>("ppm");
  const [period, setPeriod] = useState<Period>("recent");
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<DistrictProps | null>(null);
  const [kingdom, setKingdom] = useState(false);

  const regions = useQuery({ queryKey: ["map-cities"], queryFn: () => api<MapRegion[]>("/api/map/cities"), staleTime: 60 * 60_000 });
  // until the user picks, the busiest city is the default (derived, not copied into state)
  const cityId = pickedCity ?? busiestCityId(regions.data);
  const region = regions.data?.find((r) => r.cities.some((c) => c.id === cityId))?.region ?? "";

  const map = useQuery({
    queryKey: ["map", cityId, type],
    queryFn: () => api<DistrictCollection>(`/api/cities/${cityId}/map?type=${type}`),
    enabled: cityId != null,
    staleTime: 30 * 60_000,
  });
  const overview = useQuery({
    queryKey: ["map-overview", type],
    queryFn: () => api<RegionCollection>(`/api/map/overview?type=${type}`),
    staleTime: 30 * 60_000,
  });

  const valueOf = useCallback((p: DistrictProps) => valueFor(p, period, metric), [period, metric]);
  const regionValue = useCallback((r: RegionProps) => valueFor(r, period, metric), [period, metric]);
  // the regions are few: rank them within the shown period so the gap between big and small regions stays readable
  const regionScale = useMemo(() => breaks((overview.data?.features ?? []).map((f) => regionValue(f.properties) ?? 0)), [overview.data, regionValue]);
  // one colour scale for every year, so a colour means the same price in 2012 and 2025
  const scale = useMemo(() => (metric === "ppm" ? map.data?.scale?.ppm : map.data?.scale?.count) ?? [], [map.data, metric]);
  const periodLabel = period === "recent" ? "" : `سنة ${period}`;

  const tooltip = useCallback((p: DistrictProps) => tooltipHtml(p.name, valueOf(p), metric, periodLabel), [valueOf, metric, periodLabel]);
  const regionTooltip = useCallback((r: RegionProps) =>
    tooltipHtml(r.name, regionValue(r), metric, `${periodLabel ? periodLabel + " · " : ""}اضغط لعرض أحياء مدنها`), [regionValue, metric, periodLabel]);
  const goRegion = useCallback((r: RegionProps) => {
    const reg = regions.data?.find((x) => x.region === r.region);
    if (!reg?.cities[0]) return;
    setCityId(reg.cities.find((c) => c.id === r.cityId)?.id ?? reg.cities[0].id);
    setSelected(null);
  }, [regions.data]);

  const first = map.data?.scale?.firstYear ?? 2010;
  const last = map.data?.scale?.lastYear ?? 2026;

  // play: one year per second from the first year, then back to the last 24 months and stop
  const periodNow = useRef(period);
  useEffect(() => { periodNow.current = period; }, [period]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const p = periodNow.current;
      if (p === "recent") setPeriod(first);
      else if (p >= last) { setPeriod("recent"); setPlaying(false); }
      else setPeriod(p + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, first, last]);
  function togglePlay() {
    if (!playing && (period === "recent" || period >= last)) setPeriod(first);
    setPlaying((x) => !x);
  }

  const covered = map.data?.features.filter((f) => valueOf(f.properties)).length ?? 0;
  const regionCount = overview.data?.features.length ?? 0;
  const failed = regions.isError ? regions : map.isError && !map.data ? map : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 rounded-t-[var(--radius-lg)] border-b border-border bg-surface-2 px-4 py-3">
        <span className="me-2 font-bold text-heading">خريطة الأسعار</span>
        <CityPicker variant="toolbar" idPrefix="map" regions={regions.data ?? []} cityId={cityId}
          onChange={(id, regionChanged) => { setCityId(id); setSelected(null); if (regionChanged) setPeriod("recent"); }} />
        <Seg label="نوع العقار" value={type} onChange={setType} options={(Object.keys(MAP_TYPE_LABEL) as MapType[]).map((t) => [t, MAP_TYPE_LABEL[t]] as [MapType, string])} />
        <Seg label="المقياس" value={metric} onChange={setMetric} options={[["ppm", "سعر المتر"], ["n12", "عدد الصفقات"]]} />
      </div>

      <YearPlayer first={first} last={last} period={period} playing={playing} onToggle={togglePlay}
        onPeriod={(p) => { setPlaying(false); setPeriod(p); }} />

      <div className={cn("grid items-start gap-0", selected && "lg:grid-cols-[1fr_380px]")}>
        <div className="p-3">
        <div className="relative isolate">
          <DistrictMap data={map.data} valueOf={valueOf} scale={scale} tooltip={tooltip} selectedId={selected?.id ?? null} onSelect={setSelected}
            regions={overview.data} regionValue={regionValue} regionScale={regionScale} regionTooltip={regionTooltip} currentRegion={region} onRegion={goRegion} onLevel={setKingdom}
            className={MAP_HEIGHT} />
          {map.data ? (
            <MapLegend
              title={[metric === "ppm" ? "وسيط سعر المتر" : "عدد الصفقات", MAP_TYPE_LABEL[type], kingdom ? "المناطق" : "", periodLabel].filter(Boolean).join(" · ")}
              scale={kingdom ? regionScale : scale} unit={metric === "ppm" ? "ريال" : "صفقة"}
              footnote={kingdom ? `${regionCount} منطقة · اضغط منطقة أو قرّب لترى الأحياء` : `${covered} حياً ببيانات · الألوان ثابتة عبر السنين`} />
          ) : null}
          {period !== "recent" ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-xl bg-ink/90 px-4 py-2 text-2xl font-extrabold text-white" dir="ltr">{period}</div>
          ) : null}
          {failed ? (
            <div className="absolute inset-0 z-20 grid place-items-center rounded-[var(--radius-lg)] bg-surface/80">
              <div className="rounded-xl border border-border bg-surface shadow-sm">
                <QueryErrorState panel error={failed.error} line="تعذّر تحميل الخريطة" onRetry={() => void failed.refetch()} retrying={failed.isFetching} />
              </div>
            </div>
          ) : null}
        </div>
        {selected ? (
          <div className="mt-3">
            <DistrictTrend districtId={selected.id} type={type} highlightYear={period === "recent" ? undefined : period} />
          </div>
        ) : null}
        </div>
        {selected ? (
          <aside className="border-t border-border p-4 lg:border-s lg:border-t-0">
            <DistrictPanel districtId={selected.id} type={type} onClose={() => setSelected(null)} />
          </aside>
        ) : null}
      </div>
    </Card>
  );
}
