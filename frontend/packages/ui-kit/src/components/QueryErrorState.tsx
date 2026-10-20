import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import { emptyStateClassName } from "../lib/page-layout-classes";
import { Button } from "./Button";

export const QUERY_ERROR_DEFAULT_LINE = "تعذّر تحميل البيانات";
const QUERY_ERROR_DEFAULT_HINT = "تحقّق من الاتصال ثم أعد المحاولة.";

/**
 * The thrown message when it is user-facing Arabic (api-client / unwrapApiResult
 * throw Arabic text); raw browser errors ("Failed to fetch") stay hidden.
 */
export function queryErrorText(error: unknown): string | null {
  if (error instanceof Error && /[؀-ۿ]/.test(error.message)) {
    return error.message.trim() || null;
  }
  return null;
}

export type QueryErrorStateProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** The query error — shown as the hint when its message is Arabic. */
  error?: unknown;
  /** Headline. @default "تعذّر تحميل البيانات" */
  line?: ReactNode;
  /** Overrides the hint (and the error's own message). */
  hint?: ReactNode;
  /** Usually `query.refetch`. Without it no retry button is shown. */
  onRetry?: () => void;
  /** Busy state for the retry button (`query.isFetching`). */
  retrying?: boolean;
  /** Same density as `EmptyState panel`. @default false */
  panel?: boolean;
};

/**
 * A failed load — takes the place of the empty state so a server error never
 * reads as "no data". Order screens as pending → error → empty → rows.
 */
export function QueryErrorState({
  error,
  line = QUERY_ERROR_DEFAULT_LINE,
  hint,
  onRetry,
  retrying = false,
  panel = false,
  className,
  ...props
}: QueryErrorStateProps) {
  const detail = hint ?? queryErrorText(error) ?? QUERY_ERROR_DEFAULT_HINT;
  return (
    <div
      role="alert"
      className={cn(emptyStateClassName, panel && "px-5 py-[54px]", className)}
      {...props}
    >
      <p
        className={cn(
          "m-0 font-bold text-danger-text",
          panel ? "text-[14px]" : "text-[13px]",
        )}
      >
        {line}
      </p>
      {detail ? (
        <p className={cn("text-text-3", panel ? "mt-1 text-[13px]" : "mt-1.5 text-[12px]")}>
          {detail}
        </p>
      ) : null}
      {onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          loading={retrying}
          showActionToast={false}
          onClick={() => onRetry()}
        >
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
