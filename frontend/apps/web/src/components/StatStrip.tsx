import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@platform/ui-kit";

export type StripStat = {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  /** something needs attention (e.g. accounts about to expire): an amber cell */
  warn?: boolean;
  /** the cell links to the list it counts */
  href?: string;
  /** or does something (e.g. opens the number for editing) */
  onClick?: () => void;
};

/** One strip of numbers: one card with hairline dividers, instead of a card per number («تسعيراتي», the admin lists). */
export function StatStrip({ stats, className }: { stats: StripStat[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4", className)}>
      {stats.map((s) => {
        const body = (
          <>
            <div className="text-xs text-text-3">{s.label}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-heading">
              {s.value} {s.unit ? <span className="text-[13px] font-bold text-text-3">{s.unit}</span> : null}
            </div>
          </>
        );
        const cls = cn("block px-6 py-4 text-start", s.warn ? "bg-amber-light" : "bg-surface");
        const hover = "transition hover:bg-row-hover";
        if (s.href) return <Link key={s.label} href={s.href} className={cn(cls, hover)}>{body}</Link>;
        if (s.onClick) return <button key={s.label} type="button" onClick={s.onClick} className={cn(cls, hover)}>{body}</button>;
        return <div key={s.label} className={cls}>{body}</div>;
      })}
    </div>
  );
}
