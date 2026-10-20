import type { HTMLAttributes, ReactNode } from "react";
import { GentleLoadingCopy } from "./GentleBusy";
import { cn } from "../lib/cn";
import {
  emptyStateClassName,
  operationalPageBodyClassName,
  operationalPanelClassName,
  pageBodyClassName,
  pageGutterClassName,
  pageShellHeaderClassName,
  pageToolbarClassName,
  queueTableHintClassName,
} from "../lib/page-layout-classes";

export {
  emptyStateClassName,
  pageGutterClassName,
  pageToolbarClassName,
  queueTableRowActiveClassName,
  queueTableRowClassName,
  queueTableWrapClassName,
} from "../lib/page-layout-classes";

export type PageShellProps = HTMLAttributes<HTMLDivElement> & {
  /** `canvas` — gray KPI-style background; `sheet` — full white surface. @default "sheet" */
  variant?: "sheet" | "canvas";
};

/** Full-width flat page shell (replaces `.page-shell`). */
export function PageShell({
  className,
  variant = "sheet",
  ...props
}: PageShellProps) {
  return (
    <div
      className={cn(
        "w-full rounded-none border-none shadow-none",
        variant === "sheet" &&
          "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface",
        variant === "canvas" && operationalPageBodyClassName,
        className,
      )}
      {...props}
    />
  );
}

export type OperationalPanelProps = HTMLAttributes<HTMLDivElement>;

/** White bordered panel on the operational canvas (tables, queues, forms). */
export function OperationalPanel({
  className,
  ...props
}: OperationalPanelProps) {
  return (
    <div className={cn(operationalPanelClassName, className)} {...props} />
  );
}

/** Scrollable page body with standard padding (replaces `.page-body`). */
function PageBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(pageBodyClassName, className)} {...props} />;
}

export type PageGutterProps = HTMLAttributes<HTMLDivElement>;

/** Horizontal gutter padding only (replaces `.page-gutter`). */
export function PageGutter({
  className,
  ...props
}: PageGutterProps) {
  return <div className={cn(pageGutterClassName, className)} {...props} />;
}

export type PageShellHeaderProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  /** Render `meta`/`children` without the `<h1>` row. @default false */
  hideTitle?: boolean;
  /** Small text row under the title (breadcrumbs, counts). */
  meta?: ReactNode;
  /** Right-aligned controls (usually `Button`s). */
  actions?: ReactNode;
};

/** Gradient header strip used on queue / PO / operational pages. */
export function PageShellHeader({
  title,
  hideTitle,
  meta,
  actions,
  children,
  className,
}: PageShellHeaderProps) {
  return (
    <header className={cn(pageShellHeaderClassName, className)}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {!hideTitle && title ? (
            <h1 className="m-0 text-base font-bold text-text">{title}</h1>
          ) : null}
          {meta ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-2">
              {meta}
            </div>
          ) : null}
          {children}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export type PageToolbarProps = HTMLAttributes<HTMLDivElement>;

/**
 * Toolbar row under the page header — row one of a stacked FilterBar:
 * `OperationalToolbarSearch` | spacer | a "تصفية" `Button` (pair it with a
 * live-count `Badge`/`StatusBadge` for the active-filter count, opens a
 * `SideSheet`) | `OperationalToolbarPrimaryButton`. Put `FilterChips` (row
 * two) directly below this as a sibling, not nested inside it.
 */
export function PageToolbar({
  className,
  ...props
}: PageToolbarProps) {
  return <div className={cn(pageToolbarClassName, className)} {...props} />;
}

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  line: ReactNode;
  hint?: ReactNode;
  /** Denser panel empty (keys / finance / properties). @default false */
  panel?: boolean;
};

/** Standard empty queue / table state. */
export function EmptyState({
  line,
  hint,
  className,
  children,
  panel = false,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        emptyStateClassName,
        panel && "px-5 py-[54px]",
        className,
      )}
      {...props}
    >
      {children}
      <p
        className={cn(
          "m-0",
          panel
            ? "text-[14px] font-bold text-text-2"
            : "text-[13px] text-text-3",
        )}
      >
        <GentleLoadingCopy>{line}</GentleLoadingCopy>
      </p>
      {hint ? (
        <p
          className={cn(
            "text-text-3",
            panel ? "mt-1 text-[13px]" : "mt-2 text-[12px]",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type QueueTableHintProps = HTMLAttributes<HTMLParagraphElement>;

/** Hint line under operational queue tables. */
export function QueueTableHint({
  className,
  children,
  ...props
}: QueueTableHintProps) {
  return (
    <p className={cn(queueTableHintClassName, className)} {...props}>
      {children}
    </p>
  );
}

export type ReportPageBodyProps = HTMLAttributes<HTMLDivElement>;

/** Dashboard / reporting pages — scrollable body with vertical rhythm. */
export function ReportPageBody({
  className,
  ...props
}: ReportPageBodyProps) {
  return (
    <PageBody className={cn("flex flex-col gap-4", className)} {...props} />
  );
}
