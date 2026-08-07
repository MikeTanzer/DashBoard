/**
 * The normalized shape every connector produces. Adding a new platform (or a
 * whole new industry) means emitting more of these records — no UI changes.
 */

/** Slug for a platform in the Pyrotree network. Free-form so new ones just work. */
export type PlatformId = string;

export interface Platform {
  id: PlatformId;
  name: string;
  /** Broad vertical, so the network can span industries later. */
  industry?: string;
}

export type CustomerStatus = "active" | "trial" | "churned";

/**
 * A paying (or trialing) business customer of one of our platforms.
 * Money is always in whole cents to avoid float drift.
 */
export interface CustomerRecord {
  id: string;
  name: string;
  platform: PlatformId;
  /** USPS two-letter code, uppercase. null when we genuinely don't know. */
  state: string | null;
  status: CustomerStatus;
  /** Recurring subscription revenue, cents per month. */
  mrrSaasCents: number;
  /** Usage / transaction-based revenue, cents per month (trailing month). */
  mrrUsageCents: number;
  /** ISO date the customer started paying. */
  startedAt?: string;
  source: SourceId;
}

/**
 * Consumer = end user of a customer's storefront (a shopper), not a Pyrotree
 * customer. Aggregate only — we never pull consumer PII into this dashboard.
 */
export interface ConsumerStats {
  platform: PlatformId;
  /** Distinct consumers we have any record of. */
  tracked: number;
  /**
   * Distinct consumers with >= 1 purchase in a trailing window, keyed by the
   * window in days ("7", "30", "90", "180", "365") plus "ever" for all-time.
   *
   * A map rather than fixed fields because the dashboard's time range is
   * arbitrary and a purchaser count is NOT derivable from another window —
   * you cannot infer 365-day purchasers from a 180-day figure, in either
   * direction. Whatever the source computes is what can be shown; the rest
   * reports itself as untracked.
   */
  purchasers: Record<string, number>;
}

/** Window keys the UI knows how to ask for. */
export const CONSUMER_WINDOWS = ["7", "30", "90", "180", "365", "ever"] as const;
export type ConsumerWindow = (typeof CONSUMER_WINDOWS)[number];

export function consumerWindowLabel(w: string): string {
  return w === "ever" ? "ever" : `last ${w} days`;
}

/**
 * Normalizes whatever a source hands us into the map, accepting the older
 * `purchased30d` / `purchased180d` shape so existing payloads keep working.
 */
export function toPurchasers(input: {
  purchasers?: Record<string, number | undefined>;
  purchased30d?: number;
  purchased180d?: number;
}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.purchasers ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  if (out["30"] === undefined && typeof input.purchased30d === "number") {
    out["30"] = input.purchased30d;
  }
  if (out["180"] === undefined && typeof input.purchased180d === "number") {
    out["180"] = input.purchased180d;
  }
  return out;
}

/** One month of recognized revenue, split by type. */
export interface RevenuePoint {
  /** "YYYY-MM" */
  month: string;
  platform: PlatformId;
  saasCents: number;
  usageCents: number;
}

/**
 * One day of recognized revenue. Optional: only sources with timestamped
 * transactions can produce it (Stripe can; a hand-maintained file usually
 * can't). Ranges shorter than a few months read off this series; without it
 * those ranges say so rather than faking a week out of monthly buckets.
 */
export interface RevenueDayPoint {
  /** "YYYY-MM-DD" */
  date: string;
  platform: PlatformId;
  saasCents: number;
  usageCents: number;
}

export type SourceId = "manual" | "stripe" | "database" | "internal-api";

export type SourceState = "ok" | "not_configured" | "error" | "partial";

export interface SourceStatus {
  id: SourceId;
  label: string;
  state: SourceState;
  /** Human-readable: what it returned, or what it still needs. */
  detail: string;
  /** Which parts of the model this source filled in on this run. */
  provides: DataDomain[];
  fetchedAt?: string;
  durationMs?: number;
}

/** The four independent things a connector can supply. */
export type DataDomain = "customers" | "consumers" | "revenue";

export interface ConnectorResult {
  customers?: CustomerRecord[];
  consumers?: ConsumerStats[];
  revenue?: RevenuePoint[];
  revenueDaily?: RevenueDayPoint[];
  platforms?: Platform[];
  status: SourceStatus;
}

export interface Snapshot {
  generatedAt: string;
  /** True when any part of the data on screen is seeded demo data. */
  demo: boolean;
  platforms: Platform[];
  customers: CustomerRecord[];
  consumers: ConsumerStats[];
  revenue: RevenuePoint[];
  revenueDaily: RevenueDayPoint[];
  sources: SourceStatus[];
}

/**
 * A metric that may not have a source yet. Every tile renders from one of
 * these, so "Not yet tracked" is a first-class state rather than a zero.
 */
export type Metric<T = number> =
  | { available: true; value: T; note?: string }
  | { available: false; needs: string };

export const unavailable = (needs: string): Metric<never> => ({
  available: false,
  needs,
});

export const available = <T>(value: T, note?: string): Metric<T> => ({
  available: true,
  value,
  note,
});
