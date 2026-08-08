"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query currently matches.
 *
 * useSyncExternalStore rather than useState + useEffect: matchMedia IS an
 * external store, and this way React reads it during render on the client
 * while the server snapshot stays a fixed `false`, so hydration can't
 * mismatch. Anything gated on this should be additive — a layout that only
 * exists on small screens — not something whose absence for one frame would
 * be wrong.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  // The build machine has no viewport, so the prerendered HTML is always the
  // wide layout; the client corrects it on first paint.
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
