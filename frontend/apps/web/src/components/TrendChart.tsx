"use client";

import { fmt, type TrendPoint } from "@/lib/api";

/** Small dependency-free SVG line chart: yearly median price per m² with deal counts as bars. RTL-safe (years run right→left). */
export function TrendChart({ district, city, height = 180, highlightYear }: { district?: TrendPoint[]; city?: TrendPoint[]; height?: number; highlightYear?: number }) {
  const d = (district ?? []).filter((p) => p.ppm_median > 0);
  const c = (city ?? []).filter((p) => p.ppm_median > 0);
  const years = Array.from(new Set([...d, ...c].map((p) => p.year))).sort((a, b) => a - b);
  if (years.length < 2) return <p className="py-6 text-center text-sm text-text-3">لا يكفي التاريخ لرسم اتجاه.</p>;

  const W = 640, H = height, padL = 46, padR = 12, padT = 12, padB = 26;
  const maxY = Math.max(...d.map((p) => p.ppm_median), ...c.map((p) => p.ppm_median)) * 1.1;
  const maxN = Math.max(1, ...d.map((p) => p.n_deals));
  const x = (year: number) => padL + ((year - years[0]) / (years[years.length - 1] - years[0])) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxY) * (H - padT - padB);
  const path = (pts: TrendPoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.ppm_median).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const barW = Math.max(4, (W - padL - padR) / years.length - 6);

  return (
    <div dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="اتجاه سعر المتر">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 3" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{fmt(t)}</text>
          </g>
        ))}
        {d.map((p) => (
          <rect key={p.year} x={x(p.year) - barW / 2} width={barW} y={H - padB - (p.n_deals / maxN) * 40} height={(p.n_deals / maxN) * 40} fill="var(--gold-soft)" />
        ))}
        {c.length ? <path d={path(c)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="5 4" /> : null}
        {d.length ? <path d={path(d)} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" /> : null}
        {highlightYear && highlightYear >= years[0] && highlightYear <= years[years.length - 1] ? (
          <line x1={x(highlightYear)} x2={x(highlightYear)} y1={padT} y2={H - padB} stroke="var(--gold)" strokeWidth="2" />
        ) : null}
        {d.map((p) => <circle key={p.year} cx={x(p.year)} cy={y(p.ppm_median)} r={p.year === highlightYear ? 5.5 : 3} fill={p.year === highlightYear ? "var(--gold)" : "var(--ink)"} />)}
        {years.filter((_, i) => i % Math.ceil(years.length / 9) === 0 || i === years.length - 1).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-2)">{yr}</text>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-text-3" dir="rtl">
        <span><span className="inline-block h-[3px] w-5 translate-y-[-3px] bg-ink" /> وسيط سعر المتر في الحي</span>
        {c.length ? <span><span className="inline-block h-[2px] w-5 translate-y-[-3px] border-t-2 border-dashed border-text-3" /> المدينة</span> : null}
        <span><span className="inline-block size-3 translate-y-[2px] bg-gold-soft" /> عدد الصفقات</span>
      </div>
    </div>
  );
}
