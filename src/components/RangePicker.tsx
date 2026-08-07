"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

  const today = new Date().toISOString().slice(0, 10);
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? today);
  const [error, setError] = useState<string | null>(null);

  // Click-outside and Escape both close the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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

  return (
    <div
      className="control-scroll flex items-center gap-2"
      style={{ opacity: pending ? 0.6 : 1, transition: "opacity 120ms" }}
    >
      <div className="seg" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => go(r.id)}
            aria-pressed={range === r.id}
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

        {open ? (
          <div className="date-pop" role="dialog" aria-label="Custom time range">
            <div className="flex gap-3">
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
              <p
                className="text-xs mt-2.5"
                style={{ color: "var(--status-critical)" }}
              >
                {error}
              </p>
            ) : (
              <p
                className="text-[11px] mt-2.5"
                style={{ color: "var(--text-muted)" }}
              >
                Spans under ~10 weeks chart by day, longer ones by month.
              </p>
            )}

            <div className="flex justify-end gap-2 mt-3">
              <button className="btn-quiet" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={applyCustom}>
                Apply
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
