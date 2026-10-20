"use client";

import { useSyncExternalStore } from "react";

/** Hydration flips once and never changes, so there is nothing to subscribe to. */
const subscribe = () => () => {};

/**
 * `false` while rendering on the server and during the first client render,
 * `true` afterwards. Portal hosts read this instead of setting a `mounted`
 * flag from an effect, which cost an extra render pass on every mount.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
