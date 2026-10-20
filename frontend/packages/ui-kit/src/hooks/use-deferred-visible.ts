"use client";

import { useEffect, useState } from "react";

/** Wait this long before showing loading chrome so fast cached opens stay quiet. */
export const GENTLE_LOADING_DELAY_MS = 300;

/**
 * Becomes true only after `active` has stayed true for `delayMs`.
 * Turns off immediately when `active` is false — no trailing spinner.
 */
export function useDeferredVisible(
  active: boolean,
  delayMs = GENTLE_LOADING_DELAY_MS,
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return visible;}
