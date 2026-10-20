import { Fragment, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { StatusBadge, statusTone } from "../badges";
import type { BadgeTone } from "./Badge";

const edgeToneClasses: Record<BadgeTone, string> = {
  default: "border-s-border-md",
  primary: "border-s-ink",
  success: "border-s-ink",
  warning: "border-s-amber",
  danger: "border-s-red",
  info: "border-s-info",
  purple: "border-s-purple",
  orange: "border-s-orange",
};

export type TransactionRowProps = {
  href: string;
  /** Status key from the shared vocabulary (`StatusBadge`'s `STATUS_MAP`) — colors the 3px edge and feeds the row's own `StatusBadge`. */
  status: string;
  /** Property name — the row's one identifying line. */
  property: ReactNode;
  /** Reference code (PO/deed number) — rendered LTR-isolated, like `TdLtr`. */
  reference: ReactNode;
  /** One truncated data line, e.g. `["الجهة", "المقيّم", "العمر"]` — joined with " · ". */
  meta: ReactNode[];
  /** The row's `⋮` menu — pass one `RowMoreMenu`. */
  menu?: ReactNode;
  className?: string;
};

/**
 * One transaction as a ≥44px tap target — the sub-900px replacement for a
 * `Table` row (compose both inside `ResponsiveList`). 3px status-colored
 * edge, property + LTR reference, one truncated meta line, the uniform
 * `StatusBadge`, one `RowMoreMenu`. The whole row is a link — its
 * accessible name comes from `property`, not the (mostly decorative) meta
 * line, so keep `property` meaningful on its own.
 */
export function TransactionRow({
  href,
  status,
  property,
  reference,
  meta,
  menu,
  className,
}: TransactionRowProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-11 w-full min-w-0 items-center gap-3 border-b border-s-[3px] border-border bg-surface py-3 pe-2 ps-3.5",
        edgeToneClasses[statusTone(status)],
        className,
      )}
    >
      <a href={href} className="absolute inset-0">
        <span className="sr-only">{property}</span>
      </a>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-heading">
            {property}
          </span>
          <span
            dir="ltr"
            className="shrink-0 text-[12px] text-text-2 tabular-nums [unicode-bidi:isolate]"
          >
            {reference}
          </span>
        </div>
        <div className="mt-1 truncate text-[12px] text-text-3">
          {meta.map((m, i) => (
            <Fragment key={i}>
              {i > 0 ? " · " : null}
              {m}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="relative shrink-0">
        <StatusBadge status={status} inTable />
      </div>
      {menu ? <div className="relative z-[1] shrink-0">{menu}</div> : null}
    </div>
  );
}

export type ResponsiveListProps = {
  /** The desktop `Table` — hidden below 900px. */
  table: ReactNode;
  /** The mobile `TransactionRow` stack — hidden at/above 900px. */
  rows: ReactNode;
  className?: string;
};

/**
 * Swaps between a desktop `Table` and a stack of `TransactionRow`s at
 * 900px. Renders both trees and toggles visibility with CSS (no
 * client-only breakpoint check), so there's no hydration flash.
 */
export function ResponsiveList({ table, rows, className }: ResponsiveListProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="hidden min-[900px]:block">{table}</div>
      <div className="min-[900px]:hidden">{rows}</div>
    </div>
  );
}
