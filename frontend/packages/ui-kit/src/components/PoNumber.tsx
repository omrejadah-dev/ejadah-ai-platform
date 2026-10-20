import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** Display form of a PO code: bare numbers gain the `PO-` prefix. */
export function formatPoDisplay(poNumber: string): string {
  const n = poNumber.trim();
  if (!n) return "";
  if (/^PO[-\s]/i.test(n)) return n;
  return `PO-${n}`;
}

/** Base chrome for a PO code — bidi-isolated so it reads LTR inside RTL text. */
export const poNumberClassName =
  "inline-block font-sans text-[12px] font-medium [unicode-bidi:isolate]";

/** Added when the PO code is rendered as a link. */
export const poNumberLinkClassName =
  "text-primary underline decoration-primary underline-offset-2 hover:text-primary-mid";

/**
 * PO number isolated for correct display in RTL (Arabic label + LTR code).
 *
 * Presentational only — ui-kit stays framework-free, so routing and prefetch
 * live in the consumer. Pass `children` (e.g. a `next/link`) to wrap the code
 * in a link while keeping this display contract.
 */
export function PoNumber({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  /** Replaces the formatted code — for consumers that supply their own link. */
  children?: ReactNode;
}) {
  return (
    <span dir="ltr" className={cn(poNumberClassName, className)}>
      {children ?? formatPoDisplay(value)}
    </span>
  );
}
