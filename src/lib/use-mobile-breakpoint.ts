"use client";

import { useSyncExternalStore } from "react";

/**
 * Same viewport threshold every mobile-aware component in this app uses
 * (concept-atlas's own renderer/detail-panel switch, AppShell's sidebar
 * collapse) -- one shared value and one shared subscription mechanism,
 * not independently-tuned copies that can drift.
 *
 * useSyncExternalStore, not useState+useEffect: a real bug found live
 * (2026-09-07, AppShell's own hydration warning) -- a `useState` lazy
 * initializer that reads `window.matchMedia(...)` directly produces
 * different markup on the server (where `window` doesn't exist, so it
 * always defaults to non-mobile) than on a client whose real viewport
 * IS mobile-sized, which React's hydration then flags as a real
 * mismatch. useSyncExternalStore's third argument (getServerSnapshot)
 * is the API React actually provides for this exact "the answer can
 * differ between server and client" case: SSR and the client's very
 * first render both honestly report `false`, then the client corrects
 * itself to the real value immediately after hydration -- consistent
 * with, not fighting, how React reconciles the two.
 */
export function useMobileBreakpoint(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
