"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "../lib/cn";

const BLINK_MS = 420;

/**
 * Show-all toggle eye — open lid + pupil when revealing extras; soft blink on open.
 * Closed state uses a lid line (not a slash) to keep the blink motion readable.
 */
export function ShowAllEye({
  open,
  blink = false,
  className,
}: {
  open: boolean;
  blink?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid size-[15px] shrink-0 [&>*]:[grid-area:1/1]",
        className,
      )}
    >
      <span
        className={cn(
          "inline-grid size-[15px] origin-center transition-transform duration-[320ms] ease-[cubic-bezier(0.34,1.2,0.64,1)] motion-reduce:transition-none [&>*]:[grid-area:1/1]",
          open ? "scale-y-100" : "scale-y-[0.08]",
          blink &&
            "animate-[show-all-eye-blink_0.42s_ease] motion-reduce:animate-none",
        )}
      >
        <svg
          className="overflow-visible"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        </svg>
        <span
          className={cn(
            "inline-grid size-[15px] origin-center transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            open ? "scale-100 opacity-100" : "scale-[0.2] opacity-0",
          )}
        >
          <svg
            className="overflow-visible"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
      </span>
      <svg
        className="overflow-visible"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path
          className={cn(
            "[stroke-dasharray:18] transition-[opacity,stroke-dashoffset] duration-[180ms] ease-out motion-reduce:transition-none",
            open
              ? "opacity-0 [stroke-dashoffset:18]"
              : "opacity-100 [stroke-dashoffset:0]",
          )}
          d="M3 12h18"
        />
      </svg>
    </span>
  );
}

/** Blink once when toggling toward the “open / show all” state. */
export function useShowAllEyeBlink() {
  const [blink, setBlink] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBlink = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBlink(true);
    timerRef.current = setTimeout(() => {
      setBlink(false);
      timerRef.current = null;
    }, BLINK_MS);
  }, []);

  const toggleOpen = useCallback(
    (prev: boolean) => {
      const next = !prev;
      if (next) triggerBlink();
      return next;
    },
    [triggerBlink],
  );

  return { blink, triggerBlink, toggleOpen };
}
