"use client";

import { useEffect, useState, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";
import {
  statCardFlushClassName,
  statGridFlushClassName,
} from "../lib/page-layout-classes";

function useCountUp(target: number | undefined, enabled: boolean): number | undefined {
  const [display, setDisplay] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (target === undefined) {
      setDisplay(undefined);
      return;
    }
    if (!enabled) {
      setDisplay(target);
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const duration = 600;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(target * progress));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    setDisplay(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return display;
}

const accentClasses = {
  default: "border-t-primary",
  blue: "border-t-primary-light",
  green: "border-t-success",
  warn: "border-t-warning",
  red: "border-t-danger",
  amber: "border-t-amber",
  gray: "border-t-text-3",
} as const;

type StatAccent = keyof typeof accentClasses;

export function StatGrid({
  className,
  cols = 4,
  flush = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { cols?: 2 | 3 | 4; flush?: boolean }) {
  const colClasses = {
    2: "grid-cols-2",
    3: "grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  } as const;

  return (
    <div
      className={cn(
        "mb-[18px] grid gap-2.5",
        colClasses[cols],
        flush && statGridFlushClassName,
        className,
      )}
      {...props}
    />
  );
}

export function StatCard({
  className,
  accent = "default",
  flush = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { accent?: StatAccent; flush?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-start rounded-[var(--radius-lg)] border border-border border-t-[3px] bg-surface px-4 py-3.5",
        accentClasses[accent],
        flush && statCardFlushClassName,
        className,
      )}
      {...props}
    />
  );
}

export function StatLabel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-[7px] w-full text-start text-[12px] text-text-3",
        className,
      )}
      {...props}
    />
  );
}

export function StatValue({
  value,
  className,
  countUp = false,
}: {
  value?: number | string;
  className?: string;
  /** Animate numeric values from 0 on first load (dashboard KPIs). */
  countUp?: boolean;
}) {
  const numeric = typeof value === "number" ? value : undefined;
  const animated = useCountUp(numeric, countUp && numeric !== undefined);
  const display =
    countUp && numeric !== undefined ? (animated ?? 0) : value;
  const ready = value !== undefined;

  return (
    <div
      className={cn(
        "min-h-[1em] w-fit max-w-full self-start text-right text-[28px] font-extrabold leading-none text-heading [direction:ltr] [unicode-bidi:isolate]",
        ready ? "opacity-100 transition-opacity duration-200" : "opacity-0",
        className,
      )}
      aria-hidden={!ready}
    >
      {ready ? display : "\u00a0"}
    </div>
  );
}
