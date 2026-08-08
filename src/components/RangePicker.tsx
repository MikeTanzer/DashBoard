"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  BUCKETS,
  DEFAULT_RANGE,
  RANGES,
  type Grain,
  type RangeId,
} from "@/lib/range";

/**
 * The time range lives in the URL, like the platform filter, so the server
 * computes every range-scoped figure in one place and a filtered view stays
 * shareable. Keeping it in component state would have scoped it to the chart
 * alone and let the tiles disagree with the headline.
 */
export function RangePicker({
  range,
  platform,
  from,
  to,
  bucket,
  rangeDays,
}: {
  range: RangeId;
  platform: string[];
  from?: string;
  to?: string;
  bucket: Grain;
  /** Span of the current window, for greying buckets it can't support. */
  rangeDays: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery("(max-width: 640px)");

  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Bring the selected range into view when the row is too narrow to show it.
   *
   * Deliberately NOT `scrollIntoView`: that walks up the ancestor chain and
   * scrolls the page as well, so landing on `?range=all` would jump the whole
   * dashboard down. Setting `scrollLeft` on the row moves only the row.
   *
   * Measured with getBoundingClientRect rather than offsetLeft — the buttons
   * sit inside `.seg` wrappers, so their offsetParent isn't this container and
   * offsetLeft would be relative to the wrong box.
   */
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    // Nothing to do when the whole row already fits (desktop, tablet).
    if (box.scrollWidth <= box.clientWidth + 1) return;

    const active = box.querySelector<HTMLElement>("[data-range-active]");
    if (!active) return;

    const boxRect = box.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const delta =
      activeRect.left +
      activeRect.width / 2 -
      (boxRect.left + boxRect.width / 2);
    if (Math.abs(delta) < 2) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({
      left: box.scrollLeft + delta,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [range, bucket]);

  const today = new Date().toISOString().slice(0, 10);
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? today);
  const [error, setError] = useState<string | null>(null);

  // Click-outside and Escape both close it. The click-outside half is skipped
  // on a phone: the modal is portalled to <body>, so it is never "inside"
  // popRef and every tap on it would read as an outside click and close it.
  // The backdrop handles dismissal there instead.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (!isPhone) document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isPhone]);

  // Stop the page scrolling behind the modal.
  useEffect(() => {
    if (!open || !isPhone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isPhone]);

  const push = (params: URLSearchParams) => {
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/", { scroll: false }));
  };

  // Changing the window drops any explicit bucket, so the pair goes back to
  // its natural pairing rather than stranding e.g. "Annually" on a 1-week view.
  const go = (next: RangeId) => {
    const params = new URLSearchParams();
    if (platform.length) params.set("platform", platform.join(","));
    if (next !== DEFAULT_RANGE) params.set("range", next);
    setOpen(false);
    push(params);
  };

  /**
   * Choosing a bucket keeps the window when it fits and widens it when it
   * doesn't — a quarterly chart over three months is a single bar. The button
   * shows which windows it will move you to.
   */
  const setBucket = (b: (typeof BUCKETS)[number]) => {
    const params = new URLSearchParams();
    if (platform.length) params.set("platform", platform.join(","));

    const fits =
      b.id === "day" ? rangeDays <= 70 : rangeDays >= b.minDays;

    if (fits) {
      if (range !== DEFAULT_RANGE) params.set("range", range);
      if (range === "custom" && from && to) {
        params.set("from", from);
        params.set("to", to);
      }
    } else if (b.minRange !== DEFAULT_RANGE) {
      params.set("range", b.minRange);
    }

    params.set("grain", b.id);
    push(params);
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return setError("Pick both dates.");
    if (draftFrom > draftTo) return setError("Start date is after the end date.");
    if (draftTo > today) return setError("The end date is in the future.");

    setError(null);
    const params = new URLSearchParams();
    if (platform.length) params.set("platform", platform.join(","));
    params.set("range", "custom");
    params.set("from", draftFrom);
    params.set("to", draftTo);
    setOpen(false);
    push(params);
  };

  /**
   * The form itself, shared by both presentations. On a phone it's a centred
   * modal portalled to <body>; on a larger screen it stays a popover anchored
   * to the button.
   */
  const formBody = (
    <>
      <div className="date-fields">
        <label className="flex flex-col gap-1.5 flex-1">
          <span className="eyebrow">From</span>
          <input
            type="date"
            value={draftFrom}
            max={draftTo || today}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 flex-1">
          <span className="eyebrow">To</span>
          <input
            type="date"
            value={draftTo}
            min={draftFrom || undefined}
            max={today}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="date-note" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      ) : (
        <p className="date-note" style={{ color: "var(--text-muted)" }}>
          Spans under ~10 weeks chart by day, longer ones by month.
        </p>
      )}

      <div className="date-actions">
        <button className="btn-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn-primary" onClick={applyCustom}>
          Apply
        </button>
      </div>
    </>
  );

  return (
    <div
      ref={scrollRef}
      className="control-scroll flex items-center gap-2"
      style={{ opacity: pending ? 0.6 : 1, transition: "opacity 120ms" }}
    >
      <div className="seg" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => go(r.id)}
            aria-pressed={range === r.id}
            // Marks the scroll target. aria-pressed alone wouldn't do: the
            // bucket segment sets it too, and a plain query would centre
            // whichever came first in the DOM.
            data-range-active={range === r.id ? "" : undefined}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Bucket size">
        {BUCKETS.map((b) => {
          const fits = b.id === "day" ? rangeDays <= 70 : rangeDays >= b.minDays;
          return (
            <button
              key={b.id}
              onClick={() => setBucket(b)}
              aria-pressed={bucket === b.id}
              title={
                fits
                  ? `Chart by ${b.label.toLowerCase()}`
                  : `Needs a longer window — switches to ${b.minRange.toUpperCase()}`
              }
              style={fits ? undefined : { opacity: 0.55 }}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <div className="relative" ref={popRef}>
        <button
          className="seg-solo"
          aria-pressed={range === "custom"}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
        >
          {range === "custom" && from && to ? `${from} → ${to}` : "Custom"}
        </button>

        {open && !isPhone ? (
          <div className="date-pop" role="dialog" aria-label="Custom time range">
            {formBody}
          </div>
        ) : null}

        {/* Portalled to <body> on a phone. The button lives inside the
            horizontally scrolling control row, and an absolutely positioned
            panel in there is clipped by that row's overflow AND pushed off the
            right edge of a 375px screen — the picker was simply unreachable.
            A fixed, portalled modal is outside both problems. */}
        {open && isPhone
          ? createPortal(
              <div
                className="date-modal-backdrop"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setOpen(false);
                }}
              >
                <div
                  className="date-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Custom time range"
                >
                  <div className="date-modal-head">
                    <h2>Custom range</h2>
                    <button
                      type="button"
                      className="date-modal-close"
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path
                          d="M1.5 1.5l9 9M10.5 1.5l-9 9"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                  {formBody}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
