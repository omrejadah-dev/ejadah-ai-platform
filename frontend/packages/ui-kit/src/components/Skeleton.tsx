import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { opsIconBoxGold, opsPanelCard } from "../lib/ops-chrome";
import { GentleBusy } from "./GentleBusy";
import { Spinner } from "./Spinner";
import { Tr, Td } from "./Table";

/**
 * Brand loading mark — gold soft tile + gold spinner (matches ops chrome).
 */
function LoadingMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        opsIconBoxGold,
        "mx-auto grid h-12 w-12 place-items-center rounded-[12px]",
        className,
      )}
      aria-hidden
    >
      <Spinner className="size-[1.15rem] border-[2.5px] text-gold-d" />
    </span>
  );
}

/**
 * Centered middle card — used for page / MFE chunk waits.
 * Replaces the old top-corner “جاري التحميل …” line.
 */
function LoadingBox({
  className,
  title = "جاري التحميل…",
  hint = "نجهّز الصفحة…",
  compact = false,
}: {
  className?: string;
  title?: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        opsPanelCard,
        "w-full text-center",
        compact
          ? "max-w-[16rem] px-4 py-5"
          : "max-w-[20rem] px-6 py-8 shadow-[0_8px_28px_-12px_rgba(16,43,78,0.18)]",
        className,
      )}
    >
      <LoadingMark className={compact ? "mb-3 h-10 w-10" : "mb-4"} />
      <div
        className={cn(
          "font-extrabold text-heading",
          compact ? "text-[13px]" : "text-[14.5px]",
        )}
      >
        {title}
      </div>
      {hint ? (
        <div
          className={cn(
            "text-text-3",
            compact ? "mt-0.5 text-[12px]" : "mt-1 text-[12px]",
          )}
        >
          {hint}
        </div>
      ) : null}
      <div className={cn("space-y-2", compact ? "mt-3.5" : "mt-5")}>
        <Skeleton className="mx-auto h-1.5 w-[78%]" />
        <Skeleton className="mx-auto h-1.5 w-[52%]" />
      </div>
    </div>
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded bg-surface-3 ui-skeleton-shimmer",
        className,
      )}
      aria-hidden
      {...props}
    />
  );
}

/** Full panel / page block while content loads — centered brand card. */
export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid min-h-[min(50vh,28rem)] w-full place-items-center p-6",
        className,
      )}
      aria-busy
    >
      <GentleBusy>
        <LoadingBox />
      </GentleBusy>
    </div>
  );
}

/** Compact inline block (forms, tabs, side panels). */
export function InlineLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("grid w-full place-items-center py-3", className)}
      aria-busy
    >
      <GentleBusy>
        <LoadingBox compact hint="لحظات…" />
      </GentleBusy>
    </div>
  );
}

/** Spinner + label for settings-style pages — delayed so fast loads stay quiet. */
export function PageLoadingHint({
  className,
  label = "جاري التحميل…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 text-text-3",
        className ?? "py-16",
      )}
      aria-busy
    >
      <GentleBusy>
        <>
          <Spinner />
          <span className="text-[13px]">{label}</span>
        </>
      </GentleBusy>
    </div>
  );
}

export function SkeletonTableRows({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <GentleBusy>
      <>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <Tr key={rowIndex} hoverable={false} className={className}>
            {Array.from({ length: cols }, (_, colIndex) => (
              <Td key={colIndex}>
                <Skeleton
                  className={cn(
                    "h-3",
                    colIndex === 0 ? "w-20" : "w-full max-w-[120px]",
                  )}
                />
              </Td>
            ))}
          </Tr>
        ))}
      </>
    </GentleBusy>
  );
}
