"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const SWAP_ANIMATION_MS = 180;

/**
 * Fades the panel in, with a short rise, each time `swapKey` changes — never on
 * first paint. Uses the Web Animations API instead of a `key` change, so the
 * panel's subtree is not remounted and hidden tabs keep their state. Starts
 * before paint (layout effect) so the new content never flashes at full
 * opacity first. Skipped under prefers-reduced-motion.
 */
export function useSwapAnimation(
  ref: RefObject<HTMLElement | null>,
  swapKey: unknown,
): void {
  const prevKeyRef = useRef(swapKey);

  useIsomorphicLayoutEffect(() => {
    if (Object.is(prevKeyRef.current, swapKey)) return;
    prevKeyRef.current = swapKey;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = el.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: SWAP_ANIMATION_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    // A quick second switch restarts from the new panel instead of stacking.
    return () => animation.cancel();
  }, [ref, swapKey]);
}
