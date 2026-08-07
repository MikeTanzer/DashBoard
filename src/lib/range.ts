/**
 * The dashboard-wide time range. Shared by the server (which computes every
 * range-scoped figure) and the picker (which writes it to the URL), so the
 * headline, the tiles and the chart can never disagree about the window.
 */

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
   * Consumer purchase counts exist only for two fixed windows (the source query
   * defines them). This is whichever of the two is the honest match.
   */
  consumerWindow: 30 | 180;
}

export type RangeId = "1w" | "1m" | "3m" | "6m" | "12m" | "all";

export const RANGES: RangeSpec[] = [
  { id: "1w", label: "1W", grain: "day", count: 7, window: "last 7 days", days: 7, consumerWindow: 30 },
  { id: "1m", label: "1M", grain: "day", count: 30, window: "last 30 days", days: 30, consumerWindow: 30 },
  { id: "3m", label: "3M", grain: "month", count: 3, window: "last 3 months", days: 91, consumerWindow: 180 },
  { id: "6m", label: "6M", grain: "month", count: 6, window: "last 6 months", days: 182, consumerWindow: 180 },
  { id: "12m", label: "12M", grain: "month", count: 12, window: "last 12 months", days: 365, consumerWindow: 180 },
  { id: "all", label: "All", grain: "month", count: Infinity, window: "all time", days: Infinity, consumerWindow: 180 },
];

export const DEFAULT_RANGE: RangeId = "3m";

/** URL values are user-controlled — never index with one unchecked. */
export function readRange(raw: string | undefined): RangeSpec {
  return (
    RANGES.find((r) => r.id === raw) ??
    RANGES.find((r) => r.id === DEFAULT_RANGE)!
  );
}
