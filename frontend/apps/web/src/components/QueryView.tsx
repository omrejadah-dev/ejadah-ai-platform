"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { cn, QueryErrorState, Skeleton, Spinner } from "@platform/ui-kit";

type Props<T> = {
  q: UseQueryResult<T>;
  /** Rendered with the loaded data. */
  children: (data: T) => ReactNode;
  /** Shown instead of `children` when the data is empty (an empty list by default, or `isEmpty`). */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  /** While loading; a centred spinner by default. */
  loading?: ReactNode;
  /** Headline of the error state; "تعذّر تحميل البيانات" by default. */
  errorLine?: string;
  className?: string;
};

/**
 * One way to show a query: loading → failed (with a retry) → empty → content.
 * A failed load never reads as "no data" or spins forever. Once data has loaded, a failed
 * background refresh keeps showing it.
 */
export function QueryView<T>({ q, children, empty, isEmpty, loading, errorLine, className }: Props<T>) {
  if (q.data === undefined) {
    if (q.isError) {
      return <QueryErrorState className={className} error={q.error} line={errorLine} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
    }
    return <>{loading ?? <CenteredSpinner className={className} />}</>;
  }
  const blank = isEmpty ? isEmpty(q.data) : Array.isArray(q.data) && q.data.length === 0;
  if (blank && empty !== undefined) return <>{empty}</>;
  return <>{children(q.data)}</>;
}

export function CenteredSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("grid place-items-center py-10", className)} role="status" aria-label="جاري التحميل">
      <Spinner />
    </div>
  );
}

/** Grey bars in the shape of a list while it loads. */
export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 py-2", className)} role="status" aria-label="جاري التحميل">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Centred muted line for "nothing here yet". */
export function EmptyLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("py-8 text-center text-sm text-text-3", className)}>{children}</p>;
}
