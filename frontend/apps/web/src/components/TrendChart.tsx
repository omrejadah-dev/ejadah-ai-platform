"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@platform/ui-kit";
import type { TrendPoint } from "@/lib/api";
import { fmt } from "@/lib/format";

/** Change in % of the yearly median between the latest year and `back` years before it (years with ≥ 3 deals only),
 *  or null when either year is missing. */
export function trendChange(trend: TrendPoint[], back = 1): number | null {
  const pts = trend.filter((p) => p.ppm_median > 0 && p.n_deals >= 3);
  const last = pts[pts.length - 1];
  const then = last && pts.find((p) => p.year === last.year - back);
  return last && then ? (last.ppm_median / then.ppm_median - 1) * 100 : null;
}

/** A % change as a green (up) or red (down) pill; nothing when unknown. `suffix` says against what ("عن السنة السابقة"). */
export function ChangePill({ value, suffix = "عن السنة السابقة" }: { value: number | null; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-extrabold", up ? "bg-success-bg text-success-text" : "bg-danger-bg text-danger-text")}>
      <i className={cn("ti", up ? "ti-arrow-up-left" : "ti-arrow-down-left")} aria-hidden />{fmt(Math.abs(Math.round(value * 10) / 10))}٪{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

/** Colours of the compared districts (market page), in the order they were added. */
/** Hex, not CSS variables (the map writes them into SVG attributes, where variables do not resolve); chosen to stand out
 *  from the map's cream → gold → navy price palette. */
export const COMPARE_COLORS = ["#d9534f", "#2a9d8f", "#7c5cbf"];

/** Small dependency-free SVG line chart: yearly median price per m² with deal counts as bars. RTL-safe (years run right→left).
 *  Drawn at the container's real width, so labels and lines keep their pixel size on any screen; `height` is the height at
 *  640px wide and grows with the width up to 1.5×. Hovering (or tapping) a year shows its numbers in a small card.
 *  `compare` draws up to three districts instead (one line each, COMPARE_COLORS, no deal bars). */
export function TrendChart({ district, city, height = 180, highlightYear, compare }: {
  district?: TrendPoint[]; city?: TrendPoint[]; height?: number; highlightYear?: number;
  compare?: { label: string; points: TrendPoint[] }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const d = (district ?? []).filter((p) => p.ppm_median > 0);
  const c = (city ?? []).filter((p) => p.ppm_median > 0);
  const cmp = (compare ?? []).map((s, i) => ({ ...s, points: s.points.filter((p) => p.ppm_median > 0), color: COMPARE_COLORS[i] }));
  const years = Array.from(new Set([...d, ...c, ...cmp.flatMap((s) => s.points)].map((p) => p.year))).sort((a, b) => a - b);
  const drawn = years.length >= 2;
  // the chart box only exists once there is something to draw, so observe it from then on
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawn]);
  if (!drawn) return <p className="py-6 text-center text-sm text-text-3">لا يكفي التاريخ لرسم اتجاه.</p>;

  const W = width, H = Math.round(height * Math.min(1.5, Math.max(0.75, width / 640))), padL = 46, padR = 12, padT = 12, padB = 26;
  const maxY = Math.max(...d.map((p) => p.ppm_median), ...c.map((p) => p.ppm_median), ...cmp.flatMap((s) => s.points.map((p) => p.ppm_median))) * 1.1;
  const maxN = Math.max(1, ...d.map((p) => p.n_deals));
  const x = (year: number) => padL + ((year - years[0]) / (years[years.length - 1] - years[0])) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxY) * (H - padT - padB);
  const path = (pts: TrendPoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.ppm_median).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const barW = Math.max(4, (W - padL - padR) / years.length - 6);
  // each year owns the full-height strip halfway to its neighbours, so the pointer does not have to hit the dot
  const step = (W - padL - padR) / (years.length - 1);

  const hd = hover == null ? undefined : d.find((p) => p.year === hover);
  const hc = hover == null ? undefined : c.find((p) => p.year === hover);
  // the card sits above the point; near the edges it is anchored inward so it stays inside the chart
  const hx = hover == null ? 0 : (x(hover) / W) * 100;
  const hcmp = hover == null ? [] : cmp.map((s) => ({ s, p: s.points.find((p) => p.year === hover) })).filter((x) => x.p);
  const hy = hover == null ? 0 : (y(hd?.ppm_median ?? hc?.ppm_median ?? Math.max(0, ...hcmp.map((x) => x.p!.ppm_median))) / H) * 100;
  const shift = hx < 18 ? "0%" : hx > 82 ? "-100%" : "-50%";

  return (
    <div ref={box} dir="ltr" className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="اتجاه سعر المتر">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 3" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{fmt(t)}</text>
          </g>
        ))}
        {d.map((p) => (
          <rect key={p.year} x={x(p.year) - barW / 2} width={barW} y={H - padB - (p.n_deals / maxN) * 40} height={(p.n_deals / maxN) * 40}
            fill={p.year === hover ? "var(--gold)" : "var(--gold-soft)"} />
        ))}
        {hover != null ? <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--border-md)" strokeWidth="1" /> : null}
        {c.length ? <path d={path(c)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="5 4" /> : null}
        {d.length ? <path d={path(d)} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" /> : null}
        {cmp.map((s) => (
          <g key={s.label}>
            <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />
            {s.points.map((p) => <circle key={p.year} cx={x(p.year)} cy={y(p.ppm_median)} r={p.year === hover ? 5.5 : 3} fill={s.color} />)}
          </g>
        ))}
        {highlightYear && highlightYear >= years[0] && highlightYear <= years[years.length - 1] ? (
          <line x1={x(highlightYear)} x2={x(highlightYear)} y1={padT} y2={H - padB} stroke="var(--gold)" strokeWidth="2" />
        ) : null}
        {d.map((p) => {
          const on = p.year === hover || p.year === highlightYear;
          return <circle key={p.year} cx={x(p.year)} cy={y(p.ppm_median)} r={p.year === hover ? 6 : on ? 5.5 : 3}
            fill={on ? "var(--gold)" : "var(--ink)"} stroke={p.year === hover ? "var(--surface)" : "none"} strokeWidth="2" />;
        })}
        {years.filter((_, i) => i % Math.ceil(years.length / 9) === 0 || i === years.length - 1).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fontSize="10" fill={yr === hover ? "var(--heading)" : "var(--text-2)"}
            fontWeight={yr === hover ? 700 : 400}>{yr}</text>
        ))}
        {/* hit areas last, transparent, on top of everything */}
        {years.map((yr) => (
          <rect key={yr} x={x(yr) - step / 2} width={step} y={padT} height={H - padT - padB + 6} fill="transparent"
            onMouseEnter={() => setHover(yr)} onClick={() => setHover((h) => (h === yr ? null : yr))}>
            <title>{yr}</title>
          </rect>
        ))}
      </svg>

      {hover != null && (hd || hc || hcmp.length) ? (
        <div dir="rtl" role="status"
          className="pointer-events-none absolute z-10 min-w-[150px] rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `${hx}%`, top: `${hy}%`, transform: `translate(${shift}, calc(-100% - 12px))` }}>
          <div className="mb-1 font-extrabold text-heading">{hover}</div>
          {hd ? (
            <>
              <div className="flex justify-between gap-4"><span className="text-text-3">سعر المتر في الحي</span><b className="tabular-nums text-heading">{fmt(hd.ppm_median)}</b></div>
              <div className="flex justify-between gap-4"><span className="text-text-3">عدد الصفقات</span><b className="tabular-nums text-heading">{fmt(hd.n_deals)}</b></div>
            </>
          ) : null}
          {hc ? <div className="flex justify-between gap-4"><span className="text-text-3">سعر المتر في المدينة</span><b className="tabular-nums text-heading">{fmt(hc.ppm_median)}</b></div> : null}
          {hcmp.map(({ s, p }) => (
            <div key={s.label} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-text-3"><span className="inline-block size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
              <b className="tabular-nums text-heading">{fmt(p!.ppm_median)}</b>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-text-3" dir="rtl">
        {cmp.length ? cmp.map((s) => (
          <span key={s.label}><span className="inline-block h-[3px] w-5 translate-y-[-3px]" style={{ background: s.color }} /> {s.label}</span>
        )) : (
          <>
            <span><span className="inline-block h-[3px] w-5 translate-y-[-3px] bg-ink" /> وسيط سعر المتر في الحي</span>
            {c.length ? <span><span className="inline-block h-[2px] w-5 translate-y-[-3px] border-t-2 border-dashed border-text-3" /> المدينة</span> : null}
            <span><span className="inline-block size-3 translate-y-[2px] bg-gold-soft" /> عدد الصفقات</span>
          </>
        )}
      </div>
    </div>
  );
}
