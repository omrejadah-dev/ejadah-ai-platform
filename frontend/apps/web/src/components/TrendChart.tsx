"use client";

import { useEffect, useRef, useState } from "react";
import type { TrendPoint } from "@/lib/api";
import { fmt } from "@/lib/format";

/** Small dependency-free SVG line chart: yearly median price per m² with deal counts as bars. RTL-safe (years run right→left).
 *  Drawn at the container's real width, so labels and lines keep their pixel size on any screen; `height` is the height at
 *  640px wide and grows with the width up to 1.5×. Hovering (or tapping) a year shows its numbers in a small card. */
export function TrendChart({ district, city, height = 180, highlightYear }: { district?: TrendPoint[]; city?: TrendPoint[]; height?: number; highlightYear?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const d = (district ?? []).filter((p) => p.ppm_median > 0);
  const c = (city ?? []).filter((p) => p.ppm_median > 0);
  const years = Array.from(new Set([...d, ...c].map((p) => p.year))).sort((a, b) => a - b);
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
  const maxY = Math.max(...d.map((p) => p.ppm_median), ...c.map((p) => p.ppm_median)) * 1.1;
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
  const hy = hover == null ? 0 : (y(hd?.ppm_median ?? hc?.ppm_median ?? 0) / H) * 100;
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

      {hover != null && (hd || hc) ? (
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
        </div>
      ) : null}

      <div className="mt-1 flex gap-4 text-[11px] text-text-3" dir="rtl">
        <span><span className="inline-block h-[3px] w-5 translate-y-[-3px] bg-ink" /> وسيط سعر المتر في الحي</span>
        {c.length ? <span><span className="inline-block h-[2px] w-5 translate-y-[-3px] border-t-2 border-dashed border-text-3" /> المدينة</span> : null}
        <span><span className="inline-block size-3 translate-y-[2px] bg-gold-soft" /> عدد الصفقات</span>
      </div>
    </div>
  );
}
