/**
 * The dashboard-wide time range. Shared by the server (which computes every
 * range-scoped figure) and the picker (which writes it to the URL), so the
 * headline, the tiles and the chart can never disagree about the window.
 */

import type { ConsumerWindow } from "./types";

export type Grain = "day" | "month";

export interface RangeSpec {
  id: RangeId;
  /** Button text. */
  label: string;
  /** Which series the chart reads. */
  grain: Grain;
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
}

export type RangeId = "1w" | "1m" | "3m" | "6m" | "12m" | "all";

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

/** URL values are user-controlled — never index with one unchecked. */
export function readRange(raw: string | undefined): RangeSpec {
  return (
    RANGES.find((r) => r.id === raw) ??
    RANGES.find((r) => r.id === DEFAULT_RANGE)!
  );
}
