import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const toneClasses = {
  default: "bg-surface-2 text-text-2",
  primary: "bg-navy-soft text-heading",
  success: "bg-success-bg text-success-text",
  warning: "bg-amber-light text-amber-text",
  danger: "bg-danger-bg text-danger-text",
  info: "bg-info-bg text-info-text",
  purple: "bg-purple-bg text-purple",
  orange: "bg-orange-bg text-orange",
} as const;

/** Solid-fill pairing for `inTable` — the status color itself, not its light wash. */
const toneFilledClasses = {
  default: "bg-text-2 text-white",
  primary: "bg-ink text-on-ink",
  success: "bg-success text-on-ink",
  warning: "bg-warning text-amber-text",
  danger: "bg-danger text-on-ink",
  info: "bg-info text-on-ink",
  purple: "bg-purple text-white",
  orange: "bg-orange text-white",
} as const;

export type BadgeTone = keyof typeof toneClasses;

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  /** Semantic tone — picks the fill/text pair from `tokens/colors.css`. @default "default" */
  tone?: BadgeTone;
  /** Leading status dot in `currentColor`. @default false */
  dot?: boolean;
  /**
   * Uniform filled chip for a table cell — fixed 108×26px, centered text,
   * no dot, `font-medium`/12px, filled with the tone's solid color instead
   * of its light wash. Pair with a 132px-wide status column.
   * @default false
   */
  inTable?: boolean;
};

/**
 * Small pill for a status/tag value — tone-filled, optional leading dot.
 * Inside a table cell it should render as `StatusBadge` instead, which
 * standardizes size for column alignment.
 */
export function Badge({
  className,
  tone = "default",
  dot = false,
  inTable = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      dir="rtl"
      className={cn(
        inTable
          ? "inline-flex h-[26px] w-[108px] items-center justify-center rounded-md text-[12px] font-medium whitespace-nowrap"
          : "inline-flex items-center gap-1.5 rounded-md px-[11px] py-[3px] text-xs font-bold whitespace-nowrap",
        inTable ? toneFilledClasses[tone] : toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && !inTable ? (
        <span className="size-1.5 shrink-0 rounded-full bg-current opacity-90" />
      ) : null}
      {children}
    </span>
  );
}
