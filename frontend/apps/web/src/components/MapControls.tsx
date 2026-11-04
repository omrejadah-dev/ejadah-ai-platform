"use client";

import { cn } from "@platform/ui-kit";
import { fmt } from "@/lib/format";
import { PALETTE, type Period } from "./mapScale";

/** Small segmented toggle (one of a few options). */
export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="flex rounded-lg border border-border-md bg-surface p-0.5" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-bold", v === value ? "bg-ink text-white" : "text-text-2 hover:bg-row-hover")}>{l}</button>
      ))}
    </div>
  );
}

/** Play button + year slider. The slider's last notch (past the last year) is the last 24 months. */
export function YearPlayer({ first, last, period, playing, onToggle, onPeriod }: {
  first: number; last: number; period: Period; playing: boolean; onToggle: () => void; onPeriod: (p: Period) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
      <button type="button" onClick={onToggle}
        className="grid size-8 place-items-center rounded-full bg-gold-soft text-gold-d hover:bg-gold-2 hover:text-white" aria-label={playing ? "إيقاف" : "تشغيل السنين"}>
        <i className={cn("ti text-base", playing ? "ti-player-pause" : "ti-player-play")} aria-hidden />
      </button>
      <div className="flex min-w-[240px] flex-1 items-center gap-3" dir="ltr">
        <span className="text-[11px] font-bold text-text-3">{first}</span>
        <input type="range" min={first} max={last + 1} step={1} value={period === "recent" ? last + 1 : period}
          onChange={(e) => { const y = Number(e.target.value); onPeriod(y > last ? "recent" : y); }}
          className="h-1.5 flex-1 cursor-pointer accent-[var(--ink)]" aria-label="السنة"
          aria-valuetext={period === "recent" ? "آخر 24 شهراً" : String(period)} />
        <span className="text-[11px] font-bold text-text-3">{last}</span>
      </div>
    </div>
  );
}

/** Colour key in the map's corner: title, the palette, its two ends, a footnote. */
export function MapLegend({ title, scale, unit, footnote }: { title: string; scale: number[]; unit: string; footnote: string }) {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-xl border border-border bg-surface/95 px-3 py-2 text-[11px] shadow-sm">
      <div className="mb-1 font-bold text-heading">{title}</div>
      <div className="flex items-center gap-1" dir="ltr">
        {PALETTE.map((c) => <span key={c} className="h-2.5 w-6" style={{ background: c }} />)}
      </div>
      <div className="mt-0.5 flex justify-between text-text-3" dir="ltr">
        <span dir="rtl">{fmt(scale[0])} {unit}</span><span dir="rtl">+{fmt(scale.at(-1))} {unit}</span>
      </div>
      <div className="mt-1 text-text-3">{footnote}</div>
    </div>
  );
}
