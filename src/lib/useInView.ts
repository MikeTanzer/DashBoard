"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether an element has entered the viewport at least once.
 *
 * Sticky by design: this drives an entrance animation, and something that
 * replayed every time it scrolled past would be noise rather than emphasis.
 * The observer disconnects on the first hit, so there's no ongoing cost.
 *
 * Starts false so the server render and the first client paint agree; anything
 * already on screen at load flips on the observer's initial callback, which
 * fires immediately.
 */
export function useInView<T extends Element>(
  options?: IntersectionObserverInit,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (very old browsers, some test environments) —
    // show the content rather than leaving it stuck at opacity 0.
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(id);
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, ...options },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, seen];
}
