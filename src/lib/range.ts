/**
 * The dashboard-wide time range. Shared by the server (which computes every
 * range-scoped figure) and the picker (which writes it to the URL), so the
 * headline, the tiles and the chart can never disagree about the window.
 */

import type { ConsumerWindow } from "./types";

export type Grain = "day" | "month" | "quarter" | "year";

/**
 * Bucket size for the revenue chart, chosen independently of the window.
 *
 * `minDays` is the shortest window that yields enough buckets to be worth
 * plotting — a quarterly chart over three months is one bar, which is a stat
 * tile pretending to be a chart. Picking a bucket the current window can't
 * support widens the window to `minRange` rather than silently drawing it.
 */
export interface BucketSpec {
  id: Grain;
  label: string;
  minDays: number;
  minRange: RangeId;
}

export const BUCKETS: BucketSpec[] = [
  { id: "day", label: "Daily", minDays: 0, minRange: "1m" },
  { id: "month", label: "Monthly", minDays: 80, minRange: "3m" },
  { id: "quarter", label: "Quarterly", minDays: 250, minRange: "12m" },
  { id: "year", label: "Annually", minDays: 600, minRange: "all" },
];

/** Daily data only exists for short windows; past ~10 weeks it's unreadable. */
const DAY_MAX_DAYS = 70;

/** The bucket a range uses when nothing is explicitly chosen. */
export function defaultBucket(range: RangeSpec): Grain {
  return range.days <= DAY_MAX_DAYS ? "day" : "month";
}

/**
 * Resolves the requested bucket against the window, widening the window when
 * the bucket needs more span. Returns the pair the whole dashboard runs on.
 */
export function resolveView(
  range: RangeSpec,
  bucketParam: string | undefined,
): { range: RangeSpec; bucket: Grain; widened: boolean } {
  const wanted = BUCKETS.find((b) => b.id === bucketParam);
  if (!wanted) return { range, bucket: defaultBucket(range), widened: false };

  if (wanted.id === "day" && range.days > DAY_MAX_DAYS) {
    const narrowed = RANGES.find((r) => r.id === "1m")!;
    return { range: narrowed, bucket: "day", widened: true };
  }

  if (range.days < wanted.minDays) {
    const wider = RANGES.find((r) => r.id === wanted.minRange)!;
    return { range: wider, bucket: wanted.id, widened: true };
  }

  return { range, bucket: wanted.id, widened: false };
}

export interface RangeSpec {
  id: RangeId;
  /** Button text. */
  label: string;
  /** Which stored series this range reads: the daily rows or the monthly ones. */
  grain: "day" | "month";
  /** How many buckets of that grain to plot. */
  count: number;
  /** Prose for the headline: "last 7 days". */
  window: string;
  /** Window length in days — used for "new in window" and prior-period compare. */
  days: number;
  /**
   * Which consumer-purchaser window this range asks the source for. A purchaser
   * count can't be derived from a neighbouring window, so if the source doesn't
   * compute this one the tile says so rather than reusing another.
   */
  consumerWindow: ConsumerWindow;
  /** Custom ranges only: inclusive ISO bounds. */
  from?: string;
  to?: string;
}

export type RangeId = "1w" | "1m" | "3m" | "6m" | "12m" | "all" | "custom";

export const RANGES: RangeSpec[] = [
  { id: "1w", label: "1W", grain: "day", count: 7, window: "last 7 days", days: 7, consumerWindow: "7" },
  { id: "1m", label: "1M", grain: "day", count: 30, window: "last 30 days", days: 30, consumerWindow: "30" },
  { id: "3m", label: "3M", grain: "month", count: 3, window: "last 3 months", days: 91, consumerWindow: "90" },
  { id: "6m", label: "6M", grain: "month", count: 6, window: "last 6 months", days: 182, consumerWindow: "180" },
  { id: "12m", label: "12M", grain: "month", count: 12, window: "last 12 months", days: 365, consumerWindow: "365" },
  { id: "all", label: "All", grain: "month", count: Infinity, window: "all time", days: Infinity, consumerWindow: "ever" },
];

/**
 * The window as a trailing phrase: "in the last 3 months" / "all time".
 * "in the all time" is the reason this exists.
 */
export function windowPhrase(range: RangeSpec): string {
  return range.window === "all time" ? "all time" : `in the ${range.window}`;
}

export const DEFAULT_RANGE: RangeId = "3m";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days between two ISO dates, inclusive of both ends. */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z");
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Builds the spec for an explicit from/to range.
 *
 * Grain is chosen from the span rather than fixed: under ~10 weeks a monthly
 * chart would be two or three columns, and over a year a daily one would be
 * 400+. The consumer window snaps to the nearest computed one, same rule the
 * preset ranges use — those counts only exist for fixed windows.
 */
export function customRange(from: string, to: string): RangeSpec | null {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null;
  if (from > to) return null;

  const days = daysBetween(from, to);
  const dayGrain = days <= 70;

  const nearest: ConsumerWindow =
    days <= 14 ? "7" : days <= 60 ? "30" : days <= 135 ? "90" : days <= 270 ? "180" : "365";

  return {
    id: "custom",
    label: "Custom",
    grain: dayGrain ? "day" : "month",
    // Bounded by explicit dates rather than a count; metrics slices on `from`.
    count: Infinity,
    window: `${from} to ${to}`,
    days,
    consumerWindow: nearest,
    from,
    to,
  };
}

/**
 * URL values are user-controlled — never index with one unchecked.
 * `range=custom` additionally needs valid from/to, or it falls back.
 */
export function readRange(
  raw: string | undefined,
  from?: string,
  to?: string,
): RangeSpec {
  if (raw === "custom" && from && to) {
    const custom = customRange(from, to);
    if (custom) return custom;
  }
  return (
    RANGES.find((r) => r.id === raw) ??
    RANGES.find((r) => r.id === DEFAULT_RANGE)!
  );
}
