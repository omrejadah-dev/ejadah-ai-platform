"use client";

import { lazy, type ComponentType } from "react";

/**
 * `React.lazy` that stops suspending once its code is in. Plain `lazy` suspends on
 * its first render even when the chunk was preloaded (its promise settles a tick
 * later), and React then holds the fallback for its ~300ms throttle — so a
 * preloaded screen still flashed its loading box. After `preload()` settles this
 * renders the component directly. The lazy branch never commits once the code is
 * loaded (its promise resolves after `loaded` is set), so the switch cannot remount.
 *
 * ```ts
 * const matrix = preloadableLazy(() => import("./Matrix").then((m) => m.Matrix));
 * export const Matrix = matrix.Component;   // render inside <Suspense>
 * matrix.preload();                          // on idle / hover
 * ```
 */
export function preloadableLazy<P extends object>(
  load: () => Promise<ComponentType<P>>,
): { Component: ComponentType<P>; preload: () => Promise<ComponentType<P>> } {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () =>
    (pending ??= load().then((component) => (loaded = component)));
  const Lazy = lazy(() => preload().then((component) => ({ default: component })));
  function Preloadable(props: P) {
    const Component = loaded ?? Lazy;
    return <Component {...props} />;
  }
  return { Component: Preloadable, preload };
}

/** Run `task` when the browser is idle (or after `fallbackMs`); returns a cancel function. */
export function whenIdle(task: () => void, fallbackMs = 800): () => void {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, fallbackMs);
  return () => window.clearTimeout(id);
}
