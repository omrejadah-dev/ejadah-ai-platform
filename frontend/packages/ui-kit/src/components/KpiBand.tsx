import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/** Connected KPI band — a single bordered strip of cells sharing internal dividers, as seen in PoListView. */
export function KpiBand({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-6 flex shrink-0 flex-wrap overflow-hidden rounded-xl border border-border bg-surface shadow-card sm:flex-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function KpiCell({
  first = false,
  last = false,
  icon,
  iconClass,
  label,
  value,
  valueClass,
  sub,
  dot = false,
  className,
}: {
  first?: boolean;
  last?: boolean;
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: ReactNode;
  valueClass?: string;
  sub: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex-1 px-4 py-4 min-w-[140px] sm:min-w-0 sm:px-6 sm:py-5",
        !last && "border-e border-border",
        first &&
          "before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-gold before:content-['']",
        className,
      )}
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-[30px] shrink-0 place-items-center rounded-md",
            iconClass,
          )}
        >
          {icon}
        </span>
        <span className="text-[12.5px] font-medium text-text-2">{label}</span>
      </div>
      <div
        className={cn(
          "text-start text-[26px] font-extrabold leading-none text-heading tabular-nums sm:text-[32px]",
          valueClass,
        )}
      >
        <bdi>{value}</bdi>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-text-3">
        {dot ? <span className="size-1.5 rounded-full bg-gold" /> : null}
        {sub}
      </div>
    </div>
  );
}
