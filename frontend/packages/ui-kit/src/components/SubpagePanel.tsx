import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/** Flat full-width panel (replaces `.page-shell`). */
export function SubpagePanel({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-none border-none bg-surface shadow-none",
        className,
      )}
      {...props}
    />
  );
}

export function SubpageHeader({
  className,
  title,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "mb-0 flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-2.5",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <h2 className="m-0 mb-1 text-base font-bold text-text">{title}</h2>
      </div>
      {children}
    </header>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "primary",
  className,
}: {
  value: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const fillClasses = {
    primary: "bg-primary-light",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  } as const;

  return (
    <div
      className={cn(
        "h-[5px] overflow-hidden rounded bg-surface-3",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded transition-[width] duration-400",
          fillClasses[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
