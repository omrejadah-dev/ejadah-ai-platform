"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, cn, Select, Spinner } from "@platform/ui-kit";
import { DistrictPanel } from "@/components/DistrictPanel";
import { api, fmt, TYPE_LABEL, type City, type PropertyType } from "@/lib/api";
import type { DistrictCollection, DistrictProps, Metric } from "@/components/DistrictMap";
import { PALETTE } from "@/components/mapScale";

const DistrictMap = dynamic(() => import("@/components/DistrictMap").then((m) => m.DistrictMap), {
  ssr: false,
  loading: () => <div className="grid h-[600px] place-items-center rounded-[var(--radius-lg)] border border-border bg-surface-2"><Spinner /></div>,
});

type Period = "recent" | number;

export function MarketMap() {
  const [cityId, setCityId] = useState<number | "">("");
  const [type, setType] = useState<PropertyType>("land");
  const [metric, setMetric] = useState<Metric>("ppm");
  const [period, setPeriod] = useState<Period>("recent");
  const [playing, setPlaying] = useState(false);
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
  const first = map.data?.scale?.firstYear ?? 2010;
  const last = map.data?.scale?.lastYear ?? 2026;

  // play: one year per second from the first year, stops on the last
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPeriod((p) => {
        const next = p === "recent" || p >= last ? first : p + 1;
        if (next >= last) setPlaying(false);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, first, last]);

  const valueOf = useCallback((p: DistrictProps) => {
    if (period === "recent") return metric === "ppm" ? p.ppm : p.n12;
    const y = p.y?.[String(period)];
    return y ? (metric === "ppm" ? y[0] : y[1]) : null;
  }, [period, metric]);

  // one colour scale for every year, so a colour means the same price in 2012 and 2025
  const scale = useMemo(() => (metric === "ppm" ? map.data?.scale?.ppm : map.data?.scale?.count) ?? [], [map.data, metric]);
  const periodLabel = period === "recent" ? "آخر 24 شهراً" : `سنة ${period}`;
  const tooltip = useCallback((p: DistrictProps) => {
    const v = valueOf(p);
    const line = metric === "ppm" ? (v ? `${fmt(v)} ريال/م²` : "لا صفقات كافية") : `${fmt(v ?? 0)} صفقة`;
    return `<div dir="rtl" style="font-family:inherit"><b>${p.name}</b><br/>${line}<br/><span style="color:#8a8d95">${periodLabel}</span></div>`;
  }, [valueOf, metric, periodLabel]);
  const covered = map.data?.features.filter((f) => valueOf(f.properties)).length ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 rounded-t-[var(--radius-lg)] border-b border-border bg-surface-2 px-4 py-3">
        <span className="me-2 font-bold text-heading">خريطة الأسعار</span>
        <Select className="!w-auto" value={cityId} onChange={(e) => { setCityId(Number(e.target.value)); setSelected(null); }}>
          {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Seg value={type} onChange={setType} options={(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => [t, TYPE_LABEL[t]] as [PropertyType, string])} />
        <Seg value={metric} onChange={setMetric} options={[["ppm", "سعر المتر"], ["n12", "عدد الصفقات"]]} />
      </div>

      {/* period: last 24 months, or one year with a play button */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={() => { setPlaying(false); setPeriod("recent"); }}
          className={cn("rounded-lg border px-3 py-1.5 text-xs font-bold", period === "recent" ? "border-ink bg-ink text-white" : "border-border-md bg-surface text-text-2 hover:border-gold")}>
          آخر 24 شهراً
        </button>
        <button onClick={() => { if (!playing && (period === "recent" || period >= last)) setPeriod(first); setPlaying((x) => !x); }}
          className="grid size-8 place-items-center rounded-full bg-gold-soft text-gold-d hover:bg-gold-2 hover:text-white" aria-label={playing ? "إيقاف" : "تشغيل السنين"}>
          <i className={cn("ti text-base", playing ? "ti-player-pause" : "ti-player-play")} aria-hidden />
        </button>
        <div className="flex min-w-[240px] flex-1 items-center gap-3" dir="ltr">
          <span className="text-[11px] font-bold text-text-3">{first}</span>
          <input type="range" min={first} max={last} step={1} value={period === "recent" ? last : period}
            onChange={(e) => { setPlaying(false); setPeriod(Number(e.target.value)); }}
            className="h-1.5 flex-1 cursor-pointer accent-[var(--ink)]" aria-label="السنة" />
          <span className="text-[11px] font-bold text-text-3">{last}</span>
        </div>
        <span className="min-w-[96px] rounded-lg bg-navy-soft px-3 py-1.5 text-center text-sm font-extrabold text-heading">{periodLabel}</span>
      </div>

      <div className={cn("grid items-start gap-0", selected && "lg:grid-cols-[1fr_380px]")}>
        <div className="relative isolate p-3 lg:sticky lg:top-[60px]">
          <DistrictMap data={map.data} valueOf={valueOf} scale={scale} tooltip={tooltip} selectedId={selected?.id ?? null} onSelect={setSelected}
            height={typeof window !== "undefined" && window.innerWidth < 640 ? 440 : 600} />
          {map.data ? (
            <div className="pointer-events-none absolute bottom-6 right-6 z-10 rounded-xl border border-border bg-surface/95 px-3 py-2 text-[11px] shadow-sm">
              <div className="mb-1 font-bold text-heading">{metric === "ppm" ? "وسيط سعر المتر" : "عدد الصفقات"} · {TYPE_LABEL[type]} · {periodLabel}</div>
              <div className="flex items-center gap-1" dir="ltr">
                {PALETTE.map((c) => <span key={c} className="h-2.5 w-6" style={{ background: c }} />)}
              </div>
              <div className="mt-0.5 flex justify-between text-text-3" dir="ltr">
                <span>{fmt(scale[0])}</span><span>{fmt(scale[scale.length - 1])}+</span>
              </div>
              <div className="mt-1 text-text-3">{covered} حياً ببيانات · الألوان ثابتة عبر السنين</div>
            </div>
          ) : null}
          {period !== "recent" ? (
            <div className="pointer-events-none absolute right-6 top-6 z-10 rounded-xl bg-ink/90 px-4 py-2 text-2xl font-extrabold text-white" dir="ltr">{period}</div>
          ) : null}
        </div>
        {selected ? (
          <aside className="border-t border-border p-4 lg:border-s lg:border-t-0">
            <DistrictPanel districtId={selected.id} type={type} onType={setType} onClose={() => setSelected(null)}
              highlightYear={period === "recent" ? undefined : period} />
          </aside>
        ) : null}
      </div>
    </Card>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-lg border border-border-md bg-surface p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={cn("rounded-md px-3 py-1.5 text-xs font-bold", v === value ? "bg-ink text-white" : "text-text-2 hover:bg-row-hover")}>{l}</button>
      ))}
    </div>
  );
}
