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
  /**
   * Optional: tracked consumers per USPS state code.
   *
   * Consumers are counted per platform by default — there's no state dimension
   * unless the source groups by one. Supply it and the map tooltip gains a
   * consumer line; omit it and the tooltip says so.
   */
  consumersByState?: Record<string, number>;
  /**
   * Optional: purchaser counts per USPS state code, per trailing window —
   * `{ CA: { "7": 1200, "30": 4100, ... } }`, same window keys as `purchasers`.
   *
   * Required to scope the recency breakdown to a single state. It cannot be
   * derived from `consumersByState` (which is only a head count) or from the
   * national `purchasers` (which says nothing about where those people are),
   * so without it a state selection reports what it needs rather than
   * re-labelling national figures with a state name.
   */
  purchasersByState?: Record<string, Record<string, number>>;
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

/**
 * Gross merchandise value: what shoppers spent on our customers' storefronts.
 *
 * NOT our revenue — we take a fee on this, so GMV is far larger than anything
 * else on the dashboard and the two must never be conflated. It also can't be
 * derived from our revenue without assuming a take rate, so it comes from the
 * platform that processed the orders.
 *
 * Same monthly/daily pair as revenue, so it slices to the selected range with
 * the identical rules.
 */
export interface GmvPoint {
  /** "YYYY-MM" */
  month: string;
  platform: PlatformId;
  amountCents: number;
  /**
   * Optional split of this month's GMV by USPS state code.
   *
   * Monthly only — a per-day-per-state breakdown would multiply out to
   * thousands of rows for no visible gain, so day-grained windows report
   * per-state GMV as unavailable rather than approximating it.
   */
  byState?: Record<string, number>;
}

export interface GmvDayPoint {
  /** "YYYY-MM-DD" */
  date: string;
  platform: PlatformId;
  amountCents: number;
}

/**
 * A cash balance in one account, at a point in time.
 *
 * Cash on hand is a balance, not a flow — it can't be derived from revenue,
 * MRR or anything else already here, and it does NOT move with the dashboard's
 * time range any more than a bank balance changes because you looked at a
 * different quarter. It has to be reported by something that can see an
 * account.
 */
export interface CashPosition {
  /** Which account: "Stripe balance", "Operating account", "Reserve". */
  label: string;
  amountCents: number;
  /** ISO date the balance was observed. Staleness matters for a balance. */
  asOf?: string;
}

/**
 * One month of spend in one category.
 *
 * `platform` is OPTIONAL on purpose. Hosting for WebJoint belongs to WebJoint;
 * legal fees, exec salaries and the accounting subscription belong to the
 * company. Forcing every cost onto a platform would mean inventing an
 * allocation rule and baking that assumption into the numbers, so untagged
 * spend stays untagged and the dashboard says so wherever it matters.
 */
export interface ExpensePoint {
  /** "YYYY-MM". */
  month: string;
  /** Free text: "Payroll", "Hosting", "Marketing", "Payment fees". */
  category: string;
  amountCents: number;
  /** Set only when the cost is genuinely attributable to one platform. */
  platform?: PlatformId;
  /**
   * Cost of revenue rather than operating expense — hosting, payment fees,
   * support. Drives gross margin; without it every cost is treated as opex and
   * gross margin reports itself unavailable rather than equalling net.
   */
  costOfRevenue?: boolean;
}

/**
 * One day of spend. Same shape as ExpensePoint, keyed by date.
 *
 * Optional, exactly like revenueDaily: only a source with dated transactions
 * can produce it. Without it the 1W and 1M windows report every expense-derived
 * figure as untracked rather than setting a whole month of costs against seven
 * days of revenue.
 */
export interface ExpenseDayPoint {
  /** "YYYY-MM-DD". */
  date: string;
  category: string;
  amountCents: number;
  platform?: PlatformId;
  costOfRevenue?: boolean;
}

/**
 * One month of the consumer rollup, so the audience can be plotted over time.
 *
 * The live rollup is a snapshot with no history — it says how many consumers
 * exist now, not how many existed last March. This is that same shape,
 * recorded per month.
 */
export interface ConsumerHistoryPoint {
  /** "YYYY-MM". */
  month: string;
  platform: PlatformId;
  tracked: number;
  /** Same window keys as ConsumerStats.purchasers, as at that month. */
  purchasers: Record<string, number>;
}

/**
 * Total cash across all accounts, as at a month end.
 *
 * A single balance can't be plotted, and runway can't be plotted from one
 * either. Recording the total on a schedule is what makes both a series.
 */
export interface CashHistoryPoint {
  /** "YYYY-MM". */
  month: string;
  amountCents: number;
}

/**
 * Headcount at a point in time, for revenue per employee.
 *
 * A count, not a list of people: nothing here needs to identify anyone, and a
 * dashboard that could would be a liability rather than a feature.
 */
export interface HeadcountPoint {
  /** "YYYY-MM". */
  month: string;
  employees: number;
  /** Set only when a team maps cleanly to one platform. */
  platform?: PlatformId;
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
export type DataDomain =
  | "customers"
  | "consumers"
  | "revenue"
  | "cash"
  | "gmv"
  | "expenses";

export interface ConnectorResult {
  customers?: CustomerRecord[];
  consumers?: ConsumerStats[];
  revenue?: RevenuePoint[];
  revenueDaily?: RevenueDayPoint[];
  gmv?: GmvPoint[];
  gmvDaily?: GmvDayPoint[];
  cash?: CashPosition[];
  expenses?: ExpensePoint[];
  expensesDaily?: ExpenseDayPoint[];
  consumersMonthly?: ConsumerHistoryPoint[];
  cashMonthly?: CashHistoryPoint[];
  headcount?: HeadcountPoint[];
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
  gmv: GmvPoint[];
  gmvDaily: GmvDayPoint[];
  cash: CashPosition[];
  expenses: ExpensePoint[];
  expensesDaily: ExpenseDayPoint[];
  consumersMonthly: ConsumerHistoryPoint[];
  cashMonthly: CashHistoryPoint[];
  headcount: HeadcountPoint[];
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
