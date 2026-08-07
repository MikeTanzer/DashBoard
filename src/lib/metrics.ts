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
  revenueMoMChange: Metric<number>;
  annualRunRate: Metric<number>;

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

  // Month-over-month compares the last two COMPLETE months. Including the
  // month in progress would show a fake decline that recovers by month end.
  const complete = months.filter((m) => !m.partial);
  const mom = (() => {
    if (complete.length < 2) return unavailable(NEEDS_REVENUE_HISTORY);
    const last = complete[complete.length - 1];
    const prev = complete[complete.length - 2];
    if (prev.totalCents === 0) return unavailable(NEEDS_REVENUE_HISTORY);
    return available((last.totalCents - prev.totalCents) / prev.totalCents);
  })();

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

    revenueMoMChange: mom,

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

function sum(list: CustomerRecord[], pick: (c: CustomerRecord) => number) {
  return list.reduce((acc, c) => acc + pick(c), 0);
}

function sumOf(list: ConsumerStats[], pick: (c: ConsumerStats) => number) {
  return list.reduce((acc, c) => acc + pick(c), 0);
}

export type { RevenuePoint };
