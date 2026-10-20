import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type MobileKpiTone = "ink" | "gold" | "red";

type MobileKpiStatItem = {
  key: string;
  label: string;
  sub: ReactNode;
  value: ReactNode;
  icon: ReactNode;
  iconClass: string;
  tone?: MobileKpiTone;
  valueClass?: string;
};

const toneRail: Record<MobileKpiTone, string> = {
  ink: "border-s-ink",
  gold: "border-s-gold",
  red: "border-s-red",
};

const toneWash: Record<MobileKpiTone, string> = {
  ink: "bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_srgb,var(--ink)_8%,transparent),transparent_60%)]",
  gold: "bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_srgb,var(--gold)_16%,transparent),transparent_60%)]",
  red: "bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_srgb,var(--red)_10%,transparent),transparent_60%)]",
};

/**
 * Mobile 2×2 KPI cards — same language as property-inspection / inspector stat cards.
 * Pair with `<KpiBand className="hidden lg:flex">` for desktop.
 */
export function MobileKpiStatCards({
  items,
  className,
}: {
  items: MobileKpiStatItem[];
  className?: string;
}) {
  return (
    <div className={cn("mb-3 grid min-w-0 max-w-full grid-cols-2 gap-2.5 lg:hidden", className)}>
      {items.map((card, index) => {
        const tone = card.tone ?? "ink";
        return (
          <div
            key={card.key}
            className="ui-animate-fade-in min-w-0 max-w-full"
            style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
          >
            <div
              className={cn(
                "relative flex min-h-[88px] min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-[14px] border border-border border-s-[3px] bg-surface px-3.5 py-3.5",
                "shadow-[0_2px_8px_rgba(15,52,96,0.06)]",
                toneRail[tone],
              )}
            >
              <span
                className={cn(
                  "pointer-events-none absolute inset-0 opacity-90",
                  toneWash[tone],
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "relative z-[1] grid size-10 shrink-0 place-items-center rounded-[10px]",
                  card.iconClass,
                )}
              >
                {card.icon}
              </span>
              <div className="relative z-[1] min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[22px] font-extrabold leading-none tracking-tight text-heading tabular-nums",
                    card.valueClass,
                  )}
                >
                  <bdi>{card.value}</bdi>
                </div>
                <div className="mt-1.5 text-[12px] font-semibold leading-snug text-text">
                  {card.label}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-text-3">
                  {card.sub}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
