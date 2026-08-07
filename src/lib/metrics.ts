import type {
  ConsumerStats,
  CustomerRecord,
  Metric,
  PlatformId,
  RevenuePoint,
  Snapshot,
} from "./types";
import { available, unavailable } from "./types";
import { STATE_NAMES } from "./states";
import { dayLabel, monthLabel } from "./format";
import type { RangeSpec } from "./range";

export interface StateCount {
  code: string;
  name: string;
  customers: number;
  mrrCents: number;
}

export interface MonthRevenue {
  month: string;
  saasCents: number;
  usageCents: number;
  totalCents: number;
  /** The calendar month still in progress — it will keep growing. */
  partial?: boolean;
}

/** One day of revenue. Same shape as a month, keyed by date. */
export interface DayRevenue {
  date: string;
  saasCents: number;
  usageCents: number;
  totalCents: number;
  /** Today — still accruing. */
  partial?: boolean;
}

/**
 * One plotted column, after the range has chosen which series to read.
 * Built here rather than in the card so the headline, the tiles and the chart
 * are all derived from the same slice.
 */
export interface Bar {
  key: string;
  label: string;
  full: string;
  saasCents: number;
  usageCents: number;
  totalCents: number;
  partial?: boolean;
}

/** "YYYY-MM" for right now, in UTC. */
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" for today, in UTC. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DashboardMetrics {
  // Customers
  customerCount: Metric;
  stateCount: Metric;
  customersByState: Metric<StateCount[]>;
  customersWithoutState: number;

  // Revenue
  monthlyRevenue: Metric<number>;
  avgGrossPerCustomer: Metric<number>;
  avgSaasPerCustomer: Metric<number>;
  avgUsagePerCustomer: Metric<number>;
  usageShare: Metric<number>;
  revenueByMonth: Metric<MonthRevenue[]>;
  revenueByDay: Metric<DayRevenue[]>;
  annualRunRate: Metric<number>;

  // --- Scoped to the selected time range ---------------------------------
  /** The columns the chart plots for this range. */
  bars: Metric<Bar[]>;
  /** Sum of `bars` — the headline figure. */
  windowTotal: Metric<number>;
  windowUsageShare: Metric<number>;
  /** This window vs the immediately preceding window of equal length. */
  revenueChange: Metric<number>;
  /** Customers whose first payment landed inside the window. */
  newCustomers: Metric<number>;
  /** States that gained their first customer inside the window. */
  newStates: Metric<number>;
  /** Consumer purchasers, on whichever fixed window fits the range. */
  consumersPurchased: Metric<number>;
  consumerWindowDays: 30 | 180;

  // Consumers
  consumersTracked: Metric<number>;
  consumersPurchased30d: Metric<number>;
  consumersPurchased180d: Metric<number>;
  consumerActivation30d: Metric<number>;
}

const NEEDS_CUSTOMERS =
  "Connect Stripe, the internal admin API, or add customers to data/network.json.";
const NEEDS_STATE =
  "Customer records exist, but none carry a state. Add an address state in Stripe, or a `state` field on each customer.";
const NEEDS_CONSUMERS =
  "Connect the platform database (consumer rollup query) or have the internal admin API return a `consumers` array.";
const NEEDS_DAILY_REVENUE =
  "Day-level revenue needs a source with timestamped transactions. Stripe supplies it automatically once STRIPE_SECRET_KEY is set; the admin API can send a `revenueDaily` array. Monthly totals can't be split into days after the fact.";
const NEEDS_REVENUE_HISTORY =
  "Needs at least 2 months of revenue history from Stripe invoices, the admin API, or data/network.json.";

/**
 * Everything on screen is derived here, from a snapshot already filtered to the
 * selected platforms. A metric with no source becomes `unavailable` with the
 * exact next step — never a silent zero.
 */
export function computeMetrics(
  snapshot: Snapshot,
  platformFilter: PlatformId[] | null,
  range: RangeSpec,
): DashboardMetrics {
  const inScope = (p: PlatformId) =>
    !platformFilter || platformFilter.length === 0 || platformFilter.includes(p);

  const customers = snapshot.customers.filter(
    (c) => inScope(c.platform) && c.status !== "churned",
  );
  const consumers = snapshot.consumers.filter((c) => inScope(c.platform));
  const revenue = snapshot.revenue.filter((r) => inScope(r.platform));
  const revenueDaily = snapshot.revenueDaily.filter((r) => inScope(r.platform));

  const hasCustomers = customers.length > 0;

  // --- Geography ------------------------------------------------------------
  const byState = new Map<string, StateCount>();
  let customersWithoutState = 0;
  for (const c of customers) {
    if (!c.state) {
      customersWithoutState++;
      continue;
    }
    const entry = byState.get(c.state) ?? {
      code: c.state,
      name: STATE_NAMES[c.state] ?? c.state,
      customers: 0,
      mrrCents: 0,
    };
    entry.customers++;
    entry.mrrCents += c.mrrSaasCents + c.mrrUsageCents;
    byState.set(c.state, entry);
  }
  const stateList = [...byState.values()].sort(
    (a, b) => b.customers - a.customers || a.name.localeCompare(b.name),
  );

  // --- Current MRR ----------------------------------------------------------
  const saasCents = sum(customers, (c) => c.mrrSaasCents);
  const usageCents = sum(customers, (c) => c.mrrUsageCents);
  const totalCents = saasCents + usageCents;

  // Only count customers who actually pay for that stream, so a $0 usage
  // customer doesn't drag the usage average down toward zero.
  const payingSaas = customers.filter((c) => c.mrrSaasCents > 0).length;
  const payingUsage = customers.filter((c) => c.mrrUsageCents > 0).length;

  // --- Revenue history ------------------------------------------------------
  const monthMap = new Map<string, MonthRevenue>();
  for (const r of revenue) {
    const m = monthMap.get(r.month) ?? {
      month: r.month,
      saasCents: 0,
      usageCents: 0,
      totalCents: 0,
    };
    m.saasCents += r.saasCents;
    m.usageCents += r.usageCents;
    m.totalCents = m.saasCents + m.usageCents;
    monthMap.set(r.month, m);
  }
  const thisMonth = currentMonthKey();
  const months = [...monthMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => (m.month === thisMonth ? { ...m, partial: true } : m));


  // --- Daily revenue --------------------------------------------------------
  // Only sources with timestamped transactions produce this. When it's absent
  // the short ranges say what's needed instead of resampling monthly buckets,
  // which would invent a shape the data never had.
  const today = todayKey();
  const dayMap = new Map<string, DayRevenue>();
  for (const r of revenueDaily) {
    const d = dayMap.get(r.date) ?? {
      date: r.date,
      saasCents: 0,
      usageCents: 0,
      totalCents: 0,
    };
    d.saasCents += r.saasCents;
    d.usageCents += r.usageCents;
    d.totalCents = d.saasCents + d.usageCents;
    dayMap.set(r.date, d);
  }
  const days = [...dayMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => (d.date === today ? { ...d, partial: true } : d));

  // --- The selected window --------------------------------------------------
  // Everything range-scoped is derived from this one slice, so the headline,
  // the tiles and the chart cannot drift apart.
  const dayGrain = range.grain === "day";
  const source: (MonthRevenue | DayRevenue)[] = dayGrain ? days : months;
  const dailyMissing = dayGrain && days.length === 0;

  const take = range.count === Infinity ? source.length : range.count;
  const windowRows = source.slice(-take);

  const toBar = (r: MonthRevenue | DayRevenue): Bar => {
    const isDay = "date" in r;
    const key = isDay ? r.date : r.month;
    return {
      key,
      label: isDay ? dayLabel(key) : monthLabel(key, spansYears(windowRows)),
      full: isDay ? dayLabel(key, true) : monthLabel(key, true),
      saasCents: r.saasCents,
      usageCents: r.usageCents,
      totalCents: r.totalCents,
      partial: r.partial,
    };
  };

  const bars = windowRows.map(toBar);
  const windowSum = sumBy(windowRows, (r) => r.totalCents);
  const windowUsageSum = sumBy(windowRows, (r) => r.usageCents);

  /**
   * Period-over-period, on COMPLETE buckets only.
   *
   * The plotted window deliberately includes the period in progress — you want
   * to see the month accruing. The comparison must not: a 3-month window whose
   * newest month is 7 days old, measured against three whole months, reports a
   * double-digit collapse that isn't happening. So this drops partial buckets
   * from both sides and compares equal numbers of finished periods.
   */
  const completeRows = source.filter((r) => !r.partial);
  const cmpTake = range.count === Infinity ? completeRows.length : range.count;
  const cmpWindow = completeRows.slice(-cmpTake);
  const cmpPrior = completeRows.slice(-(cmpTake * 2), -cmpTake);
  const cmpWindowSum = sumBy(cmpWindow, (r) => r.totalCents);
  const cmpPriorSum = sumBy(cmpPrior, (r) => r.totalCents);

  const revenueChange = dailyMissing
    ? unavailable(NEEDS_DAILY_REVENUE)
    : cmpPrior.length === cmpTake && cmpWindow.length === cmpTake && cmpPriorSum > 0
      ? available((cmpWindowSum - cmpPriorSum) / cmpPriorSum)
      : unavailable(
          `Needs ${cmpTake * 2} complete ${dayGrain ? "days" : "months"} of history to compare this window against the one before it. There ${completeRows.length === 1 ? "is" : "are"} ${completeRows.length}.`,
        );

  // --- New customers in the window -----------------------------------------
  // Exact: `startedAt` is the first payment date. Note this is arrivals, not
  // net growth — no source gives us cancellation dates yet, so churn can't be
  // subtracted and a "customers as of date X" series would only ever rise.
  const windowStart =
    range.days === Infinity
      ? "0000-00-00"
      : new Date(Date.now() - range.days * 86_400_000)
          .toISOString()
          .slice(0, 10);

  const datedCustomers = customers.filter((c) => c.startedAt);
  const arrived = datedCustomers.filter((c) => c.startedAt! >= windowStart);

  const newCustomers = datedCustomers.length
    ? available(arrived.length)
    : unavailable(
        "Needs a start date per customer. Stripe supplies it from the subscription; the admin API can send `startedAt`.",
      );

  // A state counts as new when its EARLIEST customer landed in the window.
  const firstSeen = new Map<string, string>();
  for (const c of datedCustomers) {
    if (!c.state) continue;
    const prev = firstSeen.get(c.state);
    if (!prev || c.startedAt! < prev) firstSeen.set(c.state, c.startedAt!);
  }
  const newStates = datedCustomers.length
    ? available(
        [...firstSeen.values()].filter((d) => d >= windowStart).length,
      )
    : unavailable(
        "Needs a start date per customer, to know when a state was first entered.",
      );

  // --- Consumers ------------------------------------------------------------
  const hasConsumers = consumers.length > 0;
  const tracked = sumOf(consumers, (c) => c.tracked);
  const p30 = sumOf(consumers, (c) => c.purchased30d);
  const p180 = sumOf(consumers, (c) => c.purchased180d);

  return {
    customerCount: hasCustomers
      ? available(customers.length)
      : unavailable(NEEDS_CUSTOMERS),

    stateCount: !hasCustomers
      ? unavailable(NEEDS_CUSTOMERS)
      : stateList.length === 0
        ? unavailable(NEEDS_STATE)
        : available(
            stateList.length,
            customersWithoutState
              ? `${customersWithoutState} customer${customersWithoutState === 1 ? "" : "s"} missing a state`
              : undefined,
          ),

    customersByState:
      stateList.length > 0
        ? available(stateList)
        : unavailable(hasCustomers ? NEEDS_STATE : NEEDS_CUSTOMERS),

    customersWithoutState,

    monthlyRevenue: hasCustomers
      ? available(totalCents)
      : unavailable(NEEDS_CUSTOMERS),

    avgGrossPerCustomer: hasCustomers
      ? available(Math.round(totalCents / customers.length))
      : unavailable(NEEDS_CUSTOMERS),

    avgSaasPerCustomer: payingSaas
      ? available(
          Math.round(saasCents / payingSaas),
          `Across ${payingSaas} of ${customers.length} customers on a subscription`,
        )
      : unavailable(
          hasCustomers
            ? "No customer has SaaS revenue. Tag subscription prices with metadata pyrotree_revenue_type=saas in Stripe."
            : NEEDS_CUSTOMERS,
        ),

    avgUsagePerCustomer: payingUsage
      ? available(
          Math.round(usageCents / payingUsage),
          `Across ${payingUsage} of ${customers.length} customers with usage billing`,
        )
      : unavailable(
          hasCustomers
            ? "No customer has usage revenue. Tag metered prices with metadata pyrotree_revenue_type=usage in Stripe."
            : NEEDS_CUSTOMERS,
        ),

    usageShare:
      totalCents > 0
        ? available(usageCents / totalCents)
        : unavailable(NEEDS_CUSTOMERS),

    revenueByMonth: months.length
      ? available(months)
      : unavailable(NEEDS_REVENUE_HISTORY),

    revenueByDay: days.length
      ? available(days)
      : unavailable(NEEDS_DAILY_REVENUE),

    bars: dailyMissing ? unavailable(NEEDS_DAILY_REVENUE) : available(bars),
    windowTotal: dailyMissing
      ? unavailable(NEEDS_DAILY_REVENUE)
      : available(windowSum),
    windowUsageShare:
      !dailyMissing && windowSum > 0
        ? available(windowUsageSum / windowSum)
        : unavailable(NEEDS_DAILY_REVENUE),
    revenueChange,
    newCustomers,
    newStates,

    // Consumer purchase counts exist for exactly two windows, defined by the
    // source query. The range picks whichever is the honest match rather than
    // interpolating a number nobody measured.
    consumersPurchased: hasConsumers
      ? available(range.consumerWindow === 30 ? p30 : p180)
      : unavailable(NEEDS_CONSUMERS),
    consumerWindowDays: range.consumerWindow,

    annualRunRate: hasCustomers
      ? available(totalCents * 12)
      : unavailable(NEEDS_CUSTOMERS),

    consumersTracked: hasConsumers
      ? available(tracked)
      : unavailable(NEEDS_CONSUMERS),

    consumersPurchased30d: hasConsumers
      ? available(p30)
      : unavailable(NEEDS_CONSUMERS),

    consumersPurchased180d: hasConsumers
      ? available(p180)
      : unavailable(NEEDS_CONSUMERS),

    consumerActivation30d:
      hasConsumers && tracked > 0
        ? available(p30 / tracked)
        : unavailable(NEEDS_CONSUMERS),
  };
}

/** Per-platform table rows, so the network view can be broken down. */
export interface PlatformRow {
  id: PlatformId;
  name: string;
  customers: number;
  states: number;
  mrrCents: number;
  saasCents: number;
  usageCents: number;
  consumersTracked: number | null;
  consumers30d: number | null;
}

export function platformBreakdown(snapshot: Snapshot): PlatformRow[] {
  const rows = new Map<PlatformId, PlatformRow>();

  for (const p of snapshot.platforms) {
    rows.set(p.id, {
      id: p.id,
      name: p.name,
      customers: 0,
      states: 0,
      mrrCents: 0,
      saasCents: 0,
      usageCents: 0,
      consumersTracked: null,
      consumers30d: null,
    });
  }

  const statesByPlatform = new Map<PlatformId, Set<string>>();

  for (const c of snapshot.customers) {
    if (c.status === "churned") continue;
    const row = rows.get(c.platform);
    if (!row) continue;
    row.customers++;
    row.saasCents += c.mrrSaasCents;
    row.usageCents += c.mrrUsageCents;
    row.mrrCents += c.mrrSaasCents + c.mrrUsageCents;
    if (c.state) {
      const set = statesByPlatform.get(c.platform) ?? new Set<string>();
      set.add(c.state);
      statesByPlatform.set(c.platform, set);
    }
  }

  for (const [id, set] of statesByPlatform) {
    const row = rows.get(id);
    if (row) row.states = set.size;
  }

  for (const c of snapshot.consumers) {
    const row = rows.get(c.platform);
    if (!row) continue;
    row.consumersTracked = c.tracked;
    row.consumers30d = c.purchased30d;
  }

  return [...rows.values()]
    .filter((r) => r.customers > 0 || r.consumersTracked !== null)
    .sort((a, b) => b.mrrCents - a.mrrCents);
}

/** Do the rows in view straddle a year boundary? Controls the axis label. */
function spansYears(rows: (MonthRevenue | DayRevenue)[]): boolean {
  const years = new Set(
    rows.map((r) => ("date" in r ? r.date : r.month).slice(0, 4)),
  );
  return years.size > 1;
}

function sumBy<T>(list: T[], pick: (r: T) => number) {
  return list.reduce((acc, r) => acc + pick(r), 0);
}

function sum(list: CustomerRecord[], pick: (c: CustomerRecord) => number) {
  return list.reduce((acc, c) => acc + pick(c), 0);
}

function sumOf(list: ConsumerStats[], pick: (c: ConsumerStats) => number) {
  return list.reduce((acc, c) => acc + pick(c), 0);
}

export type { RevenuePoint };
