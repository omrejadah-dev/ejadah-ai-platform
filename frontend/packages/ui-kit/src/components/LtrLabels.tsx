import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** LTR code/number for RTL tables (PO, invoice, deed). */
export function LtrCode({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      dir="ltr"
      className={cn(
        "inline-block tabular-nums [unicode-bidi:isolate]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Deed / property code — gold weight used across queues and finance. */
export function DeedLabel({
  value,
  className,
  empty = "—",
}: {
  value?: string | null;
  className?: string;
  empty?: string;
}) {
  const text = (value || "").trim() || empty;
  return (
    <LtrCode className={cn("text-[12.5px] font-bold text-gold-d", className)}>
      {text}
    </LtrCode>
  );
}

/** Work-order / PO display (no routing — use app PoNumber for links). */
export function PoLabel({
  value,
  className,
  empty = "—",
}: {
  value?: string | null;
  className?: string;
  empty?: string;
}) {
  const text = (value || "").trim() || empty;
  return (
    <LtrCode className={cn("text-[12px] font-semibold text-heading", className)}>
      {text}
    </LtrCode>
  );
}

export function EmptyIconSearch({ className }: { className?: string }) {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("mx-auto mb-3 opacity-60", className)}
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function EmptyIconBuilding({ className }: { className?: string }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className={cn("mx-auto mb-3 opacity-60", className)}
      aria-hidden
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  );
}
