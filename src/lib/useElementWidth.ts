"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * The rendered width of an element, in CSS pixels.
 *
 * Charts here draw into a fixed viewBox and let SVG scale it to fit. That's
 * fine on a desktop where the two are roughly 1:1, but on a phone a 1100-unit
 * viewBox squeezed into 310px scales EVERYTHING by 0.28 — including the axis
 * labels, which end up around 3px and unreadable. Measuring the container and
 * drawing at 1 unit = 1 pixel keeps type at its intended size no matter the
 * screen.
 *
 * Returns `fallback` until the first measurement, so the server render and the
 * first client paint agree.
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
  fallback: number,
): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width;
      // A hidden or not-yet-laid-out element measures 0; keeping the fallback
      // avoids a divide-by-zero collapse in the chart geometry.
      if (w > 0) setWidth(w);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
