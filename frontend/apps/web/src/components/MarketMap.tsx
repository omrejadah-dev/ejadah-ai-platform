"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, cn, Select, Spinner } from "@platform/ui-kit";
import { DistrictPanel } from "@/components/DistrictPanel";
import { api, fmt, TYPE_LABEL, type City, type PropertyType } from "@/lib/api";
import type { DistrictCollection, DistrictProps, Metric } from "@/components/DistrictMap";
import { breaks, PALETTE } from "@/components/mapScale";

const DistrictMap = dynamic(() => import("@/components/DistrictMap").then((m) => m.DistrictMap), {
  ssr: false,
  loading: () => <div className="grid h-[600px] place-items-center rounded-[var(--radius-lg)] border border-border bg-surface-2"><Spinner /></div>,
});

export function MarketMap() {
  const [cityId, setCityId] = useState<number | "">("");
  const [type, setType] = useState<PropertyType>("land");
  const [metric, setMetric] = useState<Metric>("ppm");
  const [selected, setSelected] = useState<DistrictProps | null>(null);

  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/api/cities") });
  useEffect(() => {
    if (cities.data?.length && cityId === "") setCityId((cities.data.find((c) => c.name.startsWith("جد")) ?? cities.data[0]).id);
  }, [cities.data, cityId]);

  const map = useQuery({
    queryKey: ["map", cityId, type],
    queryFn: () => api<DistrictCollection>(`/api/cities/${cityId}/map?type=${type}`),
    enabled: cityId !== "",
    staleTime: 30 * 60_000,
  });

  const legend = useMemo(() => {
    const vals = map.data?.features.map((f) => (metric === "ppm" ? f.properties.ppm ?? 0 : f.properties.n12)) ?? [];
    return breaks(vals);
  }, [map.data, metric]);
  const covered = map.data?.features.filter((f) => (metric === "ppm" ? f.properties.ppm : f.properties.n12)).length ?? 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
        <span className="me-2 font-bold text-heading">خريطة الأسعار</span>
        <Select className="!w-auto" value={cityId} onChange={(e) => { setCityId(Number(e.target.value)); setSelected(null); }}>
          {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="flex rounded-lg border border-border-md bg-surface p-0.5">
          {(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => (
            <button key={t} onClick={() => setType(t)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold", t === type ? "bg-ink text-white" : "text-text-2 hover:bg-row-hover")}>{TYPE_LABEL[t]}</button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border-md bg-surface p-0.5">
          {([["ppm", "سعر المتر"], ["n12", "عدد الصفقات"]] as [Metric, string][]).map(([m, l]) => (
            <button key={m} onClick={() => setMetric(m)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold", m === metric ? "bg-ink text-white" : "text-text-2 hover:bg-row-hover")}>{l}</button>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-0", selected && "lg:grid-cols-[1fr_380px]")}>
        <div className="relative p-3">
          <DistrictMap data={map.data} metric={metric} selectedId={selected?.id ?? null} onSelect={setSelected} height={typeof window !== "undefined" && window.innerWidth < 640 ? 440 : 600} />
          {map.data ? (
            <div className="pointer-events-none absolute bottom-6 right-6 z-[500] rounded-xl border border-border bg-surface/95 px-3 py-2 text-[11px] shadow-sm">
              <div className="mb-1 font-bold text-heading">{metric === "ppm" ? `وسيط سعر المتر · ${TYPE_LABEL[type]}` : `صفقات آخر 12 شهراً · ${TYPE_LABEL[type]}`}</div>
              <div className="flex items-center gap-1" dir="ltr">
                {PALETTE.map((c) => <span key={c} className="h-2.5 w-6" style={{ background: c }} />)}
              </div>
              <div className="mt-0.5 flex justify-between text-text-3" dir="ltr">
                <span>{fmt(legend[0])}</span><span>{fmt(legend[legend.length - 1])}+</span>
              </div>
              <div className="mt-1 text-text-3">{covered} حياً ببيانات · الرمادي بلا صفقات كافية</div>
            </div>
          ) : null}
        </div>
        {selected ? (
          <aside className="border-t border-border p-4 lg:border-s lg:border-t-0">
            <DistrictPanel districtId={selected.id} type={type} onType={setType} onClose={() => setSelected(null)} />
          </aside>
        ) : null}
      </div>
    </Card>
  );
}
