import type {
  ConsumerStats,
  CustomerRecord,
  Metric,
  PlatformId,
  RevenuePoint,
  Snapshot,
} from "./types";
import { available, unavailable, consumerWindowLabel } from "./types";
import { STATE_NAMES } from "./states";
import { dayLabel, monthLabel } from "./format";
import type { Grain, RangeSpec } from "./range";

export interface StateCount {
  code: string;
  name: string;
  customers: number;
  mrrCents: number;
  /** Tracked consumers in this state — null when no source breaks them down. */
  consumers: number | null;
  /** GMV in this state over the selected window — null when unavailable. */
  gmvCents: number | null;
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

/** One point of a single-value series, bucketed exactly like the revenue bars. */
export interface SeriesPoint {
  key: string;
  label: string;
  full: string;
  value: number;
  partial?: boolean;
}

/**
 * One period with both profit lines.
 *
 * Gross is revenue less cost of revenue; net is revenue less every cost. The
 * gap between them is operating expense, which is the whole reason to show
 * them together rather than picking one.
 */
export interface ProfitPoint {
  key: string;
  label: string;
  full: string;
  grossCents: number;
  netCents: number;
  partial?: boolean;
}

/** Which stat tile a series belongs to. */
export type TileKey =
  | "customers"
  | "consumers"
  | "states"
  | "purchasers"
  | "arpc"
  | "cash"
  | "gmv"
  | "change"
  | "expenses"
  | "net"
  | "runway"
  | "margin"
  | "revPerEmployee";

export interface TileSeries {
  /** Chart heading when this tile is selected. */
  title: string;
  /** How to render a value. */
  format: "money" | "count" | "percent";
  /** Appended to money values, e.g. "/mo". */
  unit?: string;
  points: Metric<SeriesPoint[]>;
}


/**
 * One slice of the consumer base, by how recently they last bought.
 *
 * These are MUTUALLY EXCLUSIVE and sum to `tracked` — which is the whole point.
 * The source's purchaser windows are cumulative and nested (everyone in the
 * 30-day figure is also in the 180-day one), so plotting those directly as
 * slices would count the same person up to five times and produce a total
 * larger than the audience. Each band is the gap between consecutive windows.
 */
export interface RecencyBand {
  key: string;
  label: string;
  value: number;
  share: number;
  /** Sequential ramp step, or null for the neutral "never" slice. */
  step: number | null;
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
  /**
   * SaaS and usage per customer over ALL customers, so the two SUM to
   * avgGrossPerCustomer. The pair above divides by paying customers only,
   * which is the right way to read "what does a usage customer spend" but
   * cannot be stacked under a gross figure — different denominators.
   */
  avgSaasShareCents: Metric<number>;
  avgUsageShareCents: Metric<number>;
  /** How many customers are billed for usage at all. */
  usageBillingCustomers: number;
  usageShare: Metric<number>;
  revenueByMonth: Metric<MonthRevenue[]>;
  revenueByDay: Metric<DayRevenue[]>;
  annualRunRate: Metric<number>;

  // --- Scoped to the selected time range ---------------------------------
  /**
   * What the window ACTUALLY covers, which can differ from the button pressed.
   * Quarter and year boundaries don't align to a trailing month count — "last
   * 6 months" bucketed quarterly is the last two quarters, i.e. five months —
   * so the label has to describe the buckets, not the button.
   */
  windowLabel: string;
  /** The columns the chart plots for this range. */
  bars: Metric<Bar[]>;
  /** Calendar months the plotted window covers — 0 for day-grain windows. */
  windowMonthCount: number;
  /** Sum of `bars` — the headline figure. */
  windowTotal: Metric<number>;
  windowUsageShare: Metric<number>;
  /** This window vs the immediately preceding window of equal length. */
  revenueChange: Metric<number>;
  /** Customers whose first payment landed inside the window. */
  newCustomers: Metric<number>;
  /** States that gained their first customer inside the window. */
  newStates: Metric<number>;
  /** Consumer purchasers for the window this range asks for. */
  consumersPurchased: Metric<number>;
  /** Prose for that window: "last 90 days" / "ever". */
  consumerWindowLabel: string;
  /**
   * Tracked consumers who did NOT buy in the selected window.
   *
   * The tracked total itself has no time dimension — it's a running count the
   * source keeps no history for — but its complement does, and it's the more
   * actionable half: dormant shoppers are the reactivation pool.
   */
  consumersDormant: Metric<number>;
  /** A plottable series per stat tile, so a tile can drive the main chart. */
  tileSeries: Record<TileKey, TileSeries>;
  /** Gross and net profit per plotted period, for the profit view. */
  profitPair: Metric<ProfitPoint[]>;
  /** Exclusive recency slices of the consumer base. */
  consumerRecency: Metric<RecencyBand[]>;
  /** The same slices scoped to one state, keyed by USPS code. */
  consumerRecencyByState: Record<string, Metric<RecencyBand[]>>;
  /** The customer-side counterpart: how long each customer has been with us. */
  customerTenure: Metric<RecencyBand[]>;
  /** Customer tenure scoped to one state, keyed by USPS code. */
  customerTenureByState: Record<string, Metric<RecencyBand[]>>;
  /** Why per-state recency is missing, when it is. null when it's available. */
  stateRecencyUnavailable: string | null;

  /** Why per-state GMV is missing, when it is. null when it's shown. */
  stateGmvUnavailable: string | null;
  /** GMV over the selected window — shopper spend, not our revenue. */
  gmvWindow: Metric<number>;
  /** Our revenue as a share of that GMV, when both are known. */
  takeRate: Metric<number>;

  // --- Expenses -----------------------------------------------------------
  /** Total spend over the window, scoped to the platform filter. */
  expensesWindow: Metric<number>;
  /** Revenue minus expenses over the same months. Negative means burning. */
  netProfitWindow: Metric<number>;
  /** Months of cash left at the current burn. Unavailable when profitable. */
  runwayMonths: Metric<number>;
  /** (Revenue − cost of revenue) / revenue. Needs costOfRevenue flags. */
  grossMargin: Metric<number>;
  /** Annual run rate per employee. */
  revenuePerEmployee: Metric<number>;
  /** Spend split by category, largest first. */
  expenseByCategory: Metric<RecencyBand[]>;
  /**
   * Shared overhead left OUT of the figures above because a platform filter is
   * active. Zero when unfiltered. Surfaced so a filtered margin is never
   * mistaken for a full one.
   */
  sharedExcludedCents: number;
  /** Headcount behind revenuePerEmployee, or null when unknown. */
  employees: number | null;

  /** Total cash across reported accounts. A balance — the range doesn't move it. */
  cashOnHand: Metric<number>;
  /** How many months of current burn that covers, when burn is knowable. */
  cashAsOf: string | null;

  // Consumers
  consumersTracked: Metric<number>;
  consumersPurchased30d: Metric<number>;
  consumersPurchased180d: Metric<number>;
  consumerActivation30d: Metric<number>;
}

/**
 * Tenure buckets, newest first so the pie reads the same direction as consumer
 * recency (most recent nearest the top). The last band has no upper bound.
 */
const TENURE_BANDS: { label: string; maxDays: number | null }[] = [
  { label: "Joined in the last 30 days", maxDays: 30 },
  { label: "1–3 months ago", maxDays: 90 },
  { label: "3–6 months ago", maxDays: 180 },
  { label: "6–12 months ago", maxDays: 365 },
  { label: "1–2 years ago", maxDays: 730 },
  { label: "Over 2 years ago", maxDays: null },
];

const TENURE_RAMP = [600, 500, 400, 300, 200, 100];

/** USPS codes the map draws that are not states. */
const NON_STATE_CODES = new Set(["DC", "PR", "VI", "GU", "AS", "MP"]);

const NEEDS_CUSTOMERS =
  "Connect Stripe, the internal admin API, or add customers to data/network.json.";
const NEEDS_STATE =
  "Customer records exist, but none carry a state. Add an address state in Stripe, or a `state` field on each customer.";
const NEEDS_CONSUMERS =
  "Connect the platform database (consumer rollup query) or have the internal admin API return a `consumers` array.";
const NEEDS_GMV =
  "GMV is what shoppers spent on our customers' storefronts — we only take a fee on it, so it can't be derived from our own revenue. It comes from the platform that processed the orders: add a GMV query to the platform database, or send `gmv` / `gmvDaily` from the admin API.";
const NEEDS_CASH =
  "Cash on hand is a bank balance, not something derivable from revenue or MRR. Supply it via `cash` in data/network.json or from the admin API, or set STRIPE_SECRET_KEY to pull the Stripe balance (Stripe covers money held there, not your operating account).";
const NEEDS_DAILY_REVENUE =
  "Day-level revenue needs a source with timestamped transactions. Stripe supplies it automatically once STRIPE_SECRET_KEY is set; the admin API can send a `revenueDaily` array. Monthly totals can't be split into days after the fact.";
const NEEDS_STATE_RECENCY =
  "Per-state recency needs the consumer source to break purchasers down by state. Add a `purchasersByState` map to each consumer rollup (see PYROTREE_SQL_CONSUMERS_BY_STATE in src/connectors/queries.ts). It can't be inferred from the national figures — those say how many people bought, not where they are.";
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
  bucket: Grain = range.grain,
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
      consumers: null as number | null,
      gmvCents: null as number | null,
    };
    entry.customers++;
    entry.mrrCents += c.mrrSaasCents + c.mrrUsageCents;
    byState.set(c.state, entry);
  }
  // Per-state consumer counts, if any source breaks them down that way.
  // Summed across the in-scope platforms; a state absent from every map stays
  // null rather than becoming a zero we never measured.
  const consumersByState = new Map<string, number>();
  for (const c of consumers) {
    for (const [code, n] of Object.entries(c.consumersByState ?? {})) {
      if (typeof n === "number" && Number.isFinite(n)) {
        consumersByState.set(code, (consumersByState.get(code) ?? 0) + n);
      }
    }
  }
  for (const entry of byState.values()) {
    const n = consumersByState.get(entry.code);
    if (n !== undefined) entry.consumers = n;
  }

  // A state can hold shoppers without holding a customer — someone in New
  // Jersey ordering from a storefront in New York. The list was built purely
  // from customer addresses, so those states were dropped and the consumer map
  // silently undercounted (33k of 1.16M in the demo data). They join the list
  // with zero customers; `stateCount` below still counts customer states only.
  for (const [code, n] of consumersByState) {
    if (byState.has(code)) continue;
    byState.set(code, {
      code,
      name: STATE_NAMES[code] ?? code,
      customers: 0,
      mrrCents: 0,
      consumers: n,
      gmvCents: null,
    });
  }

  const stateList = [...byState.values()].sort(
    (a, b) => b.customers - a.customers || a.name.localeCompare(b.name),
  );
  /**
   * States holding at least one customer.
   *
   * DC is excluded from the count: it carries a USPS code and appears on the
   * map, but it is not a state, and counting it made the denominator 51. It is
   * still shaded and still hoverable — it just isn't one of the fifty.
   */
  const customerStateCount = stateList.filter(
    (s) => s.customers > 0 && !NON_STATE_CODES.has(s.code),
  ).length;

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
  const dayGrain = bucket === "day";
  const dailyMissing = dayGrain && days.length === 0;

  // Quarters and years are rolled up from the monthly series — the source has
  // no coarser grain of its own, and monthly totals aggregate exactly.
  const source: (MonthRevenue | DayRevenue)[] = dayGrain
    ? days
    : bucket === "month"
      ? months
      : rollUpMonths(months, bucket);

  /**
   * The span of months a row covers, as inclusive "YYYY-MM" bounds.
   *
   * Quarter and year keys ("2026-Q2", "2026") don't compare against a date
   * bound as plain strings — "2026-Q2" sorts ABOVE "2026-08" because "Q" beats
   * any digit, so a naive prefix comparison silently excluded every quarter.
   */
  const monthSpan = (key: string): { start: string; end: string } => {
    if (key.includes("-Q")) {
      const [y, q] = key.split("-Q");
      const first = (Number(q) - 1) * 3 + 1;
      return {
        start: `${y}-${String(first).padStart(2, "0")}`,
        end: `${y}-${String(first + 2).padStart(2, "0")}`,
      };
    }
    if (key.length === 4) return { start: `${key}-01`, end: `${key}-12` };
    return { start: key, end: key };
  };

  // A bounded range (custom, YTD) filters by explicit dates; the presets take a
  // trailing count. Both end as one contiguous slice, so everything downstream
  // is identical either way.
  const inBounds = (r: MonthRevenue | DayRevenue): boolean => {
    if (!range.from || !range.to) return true;
    if ("date" in r) return r.date >= range.from && r.date <= range.to;
    // A bucket counts as in-window if it OVERLAPS the bounds at all —
    // requiring full containment would drop the quarter the range ends inside.
    const span = monthSpan(r.month);
    return (
      span.end >= range.from.slice(0, 7) && span.start <= range.to.slice(0, 7)
    );
  };

  const bounded = range.from && range.to ? source.filter(inBounds) : source;

  /**
   * `range.count` is a number of MONTHS (or days). Once the rows are quarters
   * or years, slicing by it directly takes far too many — "last 6 months" on a
   * quarterly chart was returning six quarters, i.e. the whole 12-month series
   * under a 6-month label. Convert to the bucket's own unit.
   */
  const take =
    range.count === Infinity
      ? bounded.length
      : bucket === "quarter"
        ? Math.max(1, Math.ceil(range.count / 3))
        : bucket === "year"
          ? Math.max(1, Math.ceil(range.count / 12))
          : range.count;

  const windowRows = bounded.slice(-take);

  /**
   * Every calendar month the plotted window covers, expanded from its buckets.
   * Anything that needs to line up with the chart by month (per-state GMV, the
   * GMV total) reads this rather than re-deriving the bucket maths.
   */
  const windowMonths = new Set<string>();
  for (const r of windowRows) {
    if ("date" in r) continue;
    const span = monthSpan(r.month);
    const [sy, sm] = span.start.split("-").map(Number);
    const [ey, em] = span.end.split("-").map(Number);
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em); ) {
      windowMonths.add(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  const toBar = (r: MonthRevenue | DayRevenue): Bar => {
    const isDay = "date" in r;
    const key = isDay ? r.date : r.month;
    return {
      key,
      label: isDay
        ? dayLabel(key)
        : bucket === "month"
          ? monthLabel(key, spansYears(windowRows))
          : bucketShortLabel(key),
      full: isDay
        ? dayLabel(key, true)
        : bucket === "month"
          ? monthLabel(key, true)
          : bucketLongLabel(key),
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
  const cmpTake =
    range.from && range.to
      ? bounded.filter((r) => !r.partial).length
      : range.count === Infinity
        ? completeRows.length
        : range.count;
  const cmpWindow = completeRows.slice(-cmpTake);
  const cmpPrior = completeRows.slice(-(cmpTake * 2), -cmpTake);
  const cmpWindowSum = sumBy(cmpWindow, (r) => r.totalCents);
  const cmpPriorSum = sumBy(cmpPrior, (r) => r.totalCents);

  const revenueChange = dailyMissing
    ? unavailable(NEEDS_DAILY_REVENUE)
    : range.count === Infinity && !range.from
      ? // "All time" has nothing before it, by definition. The history message
        // below would name a number of months that, once reached, would simply
        // grow again — an ask that can never be satisfied reads as a data gap
        // when it's really a category error.
        unavailable(
          "All time has no period before it to compare against. Pick a bounded range — 3M, 12M or a custom window — to see a change.",
        )
      : cmpPrior.length === cmpTake && cmpWindow.length === cmpTake && cmpPriorSum > 0
        ? available((cmpWindowSum - cmpPriorSum) / cmpPriorSum)
        : unavailable(
            `Needs ${cmpTake * 2} complete ${dayGrain ? "days" : "months"} of history to compare this window against the one before it. There ${completeRows.length === 1 ? "is" : "are"} ${completeRows.length}.`,
          );

  // --- New customers in the window -----------------------------------------
  // Exact: `startedAt` is the first payment date. Note this is arrivals, not
  // net growth — no source gives us cancellation dates yet, so churn can't be
  // subtracted and a "customers as of date X" series would only ever rise.
  const windowStart = range.from
    ? range.from
    : range.days === Infinity
      ? "0000-00-00"
      : new Date(Date.now() - range.days * 86_400_000).toISOString().slice(0, 10);
  const windowEnd = range.to ?? "9999-12-31";

  const datedCustomers = customers.filter((c) => c.startedAt);
  const arrived = datedCustomers.filter(
    (c) => c.startedAt! >= windowStart && c.startedAt! <= windowEnd,
  );

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
        [...firstSeen.values()].filter(
          (d) => d >= windowStart && d <= windowEnd,
        ).length,
      )
    : unavailable(
        "Needs a start date per customer, to know when a state was first entered.",
      );

  // --- Consumers ------------------------------------------------------------
  const hasConsumers = consumers.length > 0;
  const tracked = sumOf(consumers, (c) => c.tracked);

  /**
   * Purchasers for one trailing window, summed across the in-scope platforms.
   * Returns null unless EVERY platform in scope reports that window — a partial
   * sum would silently undercount the network, which is worse than saying the
   * window isn't computed.
   */
  const purchasersFor = (w: string): number | null => {
    if (!consumers.length) return null;
    if (!consumers.every((c) => typeof c.purchasers[w] === "number")) return null;
    return consumers.reduce((a, c) => a + c.purchasers[w], 0);
  };

  const p30 = purchasersFor("30");
  const p180 = purchasersFor("180");
  const pWindow = purchasersFor(range.consumerWindow);

  // --- Consumer recency ------------------------------------------------------
  /**
   * Turns cumulative purchaser windows into mutually-exclusive recency slices.
   *
   * Factored out so the national view and a single-state view run the exact
   * same validation and arithmetic — a state breakdown that silently skipped
   * the cumulative-ordering checks could render negative slices from bad
   * source data.
   */
  const buildBands = (
    base: number,
    windowValue: (w: string) => number | null,
  ): Metric<RecencyBand[]> => {
    if (base <= 0) return unavailable(NEEDS_CONSUMERS);

    const order = ["7", "30", "90", "180", "365", "ever"];
    const present = order
      .map((w) => ({ w, v: windowValue(w) }))
      .filter((x): x is { w: string; v: number } => x.v !== null);

    if (!present.length) {
      return unavailable(
        "Needs at least one purchaser window. Add a purchased_* column to the consumer query in src/connectors/queries.ts.",
      );
    }

    // Cumulative windows must not shrink as they widen, and none may exceed the
    // tracked base. Either would produce a negative slice — bad source data
    // rather than a rendering problem, so say so instead of drawing it.
    for (let i = 1; i < present.length; i++) {
      if (present[i].v < present[i - 1].v) {
        return unavailable(
          `Purchaser windows aren't cumulative: the ${present[i].w}-day figure (${present[i].v}) is below the ${present[i - 1].w}-day one (${present[i - 1].v}). A wider window can only contain more people.`,
        );
      }
    }
    if (present[present.length - 1].v > base) {
      return unavailable(
        "More purchasers than tracked consumers — check the consumer query.",
      );
    }

    const RAMP = [600, 500, 400, 300, 200];
    const bands: RecencyBand[] = [];

    present.forEach((cur, i) => {
      const prev = i === 0 ? null : present[i - 1];
      const value = cur.v - (prev?.v ?? 0);
      if (value <= 0) return;
      bands.push({
        key: cur.w,
        label: bandLabel(prev?.w ?? null, cur.w),
        value,
        share: value / base,
        step: RAMP[Math.min(i, RAMP.length - 1)],
      });
    });

    const never = base - present[present.length - 1].v;
    if (never > 0) {
      bands.push({
        key: "never",
        label: "Never purchased",
        value: never,
        share: never / base,
        step: null,
      });
    }

    return bands.length ? available(bands) : unavailable(NEEDS_CONSUMERS);
  };

  const recency = !hasConsumers
    ? unavailable(NEEDS_CONSUMERS)
    : buildBands(tracked, purchasersFor);

  /**
   * The same breakdown, scoped to one state.
   *
   * Both halves have to come from the source: the head count from
   * `consumersByState` and the windows from `purchasersByState`. A state is
   * only offered when EVERY in-scope platform reports it, for the same reason
   * `purchasersFor` demands full coverage — a partial sum would undercount the
   * state while looking like a complete figure.
   */
  const stateRecencyUnavailable = !hasConsumers
    ? NEEDS_CONSUMERS
    : consumers.every((c) => c.purchasersByState && c.consumersByState)
      ? null
      : NEEDS_STATE_RECENCY;

  const consumerRecencyByState: Record<string, Metric<RecencyBand[]>> = {};
  if (stateRecencyUnavailable === null) {
    const codes = new Set<string>();
    for (const c of consumers) {
      for (const code of Object.keys(c.consumersByState ?? {})) codes.add(code);
    }
    for (const code of codes) {
      const base = consumers.reduce(
        (a, c) => a + (c.consumersByState?.[code] ?? 0),
        0,
      );
      consumerRecencyByState[code] = buildBands(base, (w) => {
        // Two different absences here, and conflating them broke every
        // single-platform state: a platform with NO row for this state simply
        // doesn't operate there, which is a true zero. A platform that has the
        // state but omits this window hasn't computed it, which is unknown —
        // and one unknown makes the whole sum unknown, same rule as the
        // national windows.
        let total = 0;
        for (const c of consumers) {
          const forState = c.purchasersByState?.[code];
          if (!forState) continue;
          const v = forState[w];
          if (typeof v !== "number") return null;
          total += v;
        }
        return total;
      });
    }
  }

  // --- Customer tenure ------------------------------------------------------
  /**
   * The customer-side counterpart to consumer recency.
   *
   * Recency asks "how long since they last bought", which only makes sense for
   * shoppers — a customer is on a subscription and doesn't buy in windows. The
   * equivalent question for customers is how long they've been with us, which
   * `startedAt` answers exactly. Same mutually-exclusive band shape, so the
   * same pie renders either one.
   */
  const buildTenure = (list: CustomerRecord[]): Metric<RecencyBand[]> => {
    if (!list.length) return unavailable(NEEDS_CUSTOMERS);
    if (!list.every((c) => c.startedAt)) {
      return unavailable(
        "Needs a start date on every customer. Stripe supplies it from the subscription; otherwise add `startedAt` to each record.",
      );
    }

    const nowMs = Date.parse(`${todayKey()}T00:00:00Z`);
    const ageDays = (d: string) =>
      Math.floor((nowMs - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);

    const counts = TENURE_BANDS.map(() => 0);
    for (const c of list) {
      const age = ageDays(c.startedAt as string);
      let i = TENURE_BANDS.findIndex(
        (b) => b.maxDays === null || age <= b.maxDays,
      );
      if (i < 0) i = TENURE_BANDS.length - 1;
      counts[i]++;
    }

    const total = list.length;
    const bands: RecencyBand[] = TENURE_BANDS.map((b, i) => ({
      key: `t${i}`,
      label: b.label,
      value: counts[i],
      share: counts[i] / total,
      step: TENURE_RAMP[Math.min(i, TENURE_RAMP.length - 1)],
    })).filter((b) => b.value > 0);

    return bands.length ? available(bands) : unavailable(NEEDS_CUSTOMERS);
  };

  const customerTenure = buildTenure(customers);
  const customerTenureByState: Record<string, Metric<RecencyBand[]>> = {};
  for (const s of stateList) {
    if (s.customers <= 0) continue;
    customerTenureByState[s.code] = buildTenure(
      customers.filter((c) => c.state === s.code),
    );
  }

  // --- GMV ------------------------------------------------------------------
  // Windowed with the SAME rules as revenue — same grain, same bounds, same
  // slice — so the two figures always describe the identical period.
  const gmvMonths = new Map<string, number>();
  for (const g of snapshot.gmv.filter((g) => inScope(g.platform))) {
    gmvMonths.set(g.month, (gmvMonths.get(g.month) ?? 0) + g.amountCents);
  }
  const gmvDays = new Map<string, number>();
  for (const g of snapshot.gmvDaily.filter((g) => inScope(g.platform))) {
    gmvDays.set(g.date, (gmvDays.get(g.date) ?? 0) + g.amountCents);
  }

  // --- Expenses -------------------------------------------------------------
  /**
   * Expense scoping, and the honesty problem it creates.
   *
   * An expense may carry a platform (hosting for WebJoint) or not (legal, exec
   * salaries). With no filter, everything counts. With a platform selected,
   * only that platform's DIRECT costs count — shared overhead is deliberately
   * excluded rather than allocated, because any allocation rule (headcount,
   * revenue share) is an assumption, and one baked silently into a margin is
   * how a per-platform P&L ends up flattering.
   *
   * The excluded total is kept so the UI can name it instead of leaving a
   * filtered margin looking like the whole truth.
   */
  const expenseInScope = (e: { platform?: PlatformId }) =>
    !platformFilter ? true : e.platform !== undefined && platformFilter.includes(e.platform);

  /**
   * The days a day-grain window covers, taken from the plotted rows so the
   * expense window is byte-for-byte the revenue window.
   */
  const windowDays = new Set(
    windowRows.filter((r) => "date" in r).map((r) => (r as DayRevenue).date),
  );
  const dayGrainWindow = windowDays.size > 0;

  /**
   * Expenses for the window, read off whichever series matches its grain —
   * exactly how revenue and GMV already work. A 1W window reads dated expense
   * rows; anything monthly reads the monthly ones.
   */
  const expensesInWindow: { category: string; amountCents: number; platform?: PlatformId; costOfRevenue?: boolean }[] =
    dayGrainWindow
      ? snapshot.expensesDaily.filter((e) => windowDays.has(e.date))
      : snapshot.expenses.filter((e) => windowMonths.has(e.month));
  const scopedExpenses = expensesInWindow.filter(expenseInScope);
  const sharedExcludedCents = platformFilter
    ? expensesInWindow
        .filter((e) => e.platform === undefined)
        .reduce((a, e) => a + e.amountCents, 0)
    : 0;

  const hasExpenses = snapshot.expenses.length > 0;
  /**
   * A day-grain window needs dated expense rows. With them, 1W and 1M work
   * like every other range; without them the window has nothing to line up
   * against and says so rather than setting a whole month of costs against
   * seven days of revenue.
   */
  const expensesNeedMonths =
    dayGrainWindow && snapshot.expensesDaily.length === 0
      ? "Expenses are recorded by month, so a day-level window has nothing to line up against. Add an `expensesDaily` series, or switch to 3M or wider."
      : !dayGrainWindow && windowMonths.size === 0
        ? "No months in this window to total expenses over."
        : null;

  const NEEDS_EXPENSES =
    "Add an `expenses` array to data/network.json (month, category, amountCents, optional platform and costOfRevenue), or have the admin API return one.";

  const expensesWindowCents = scopedExpenses.reduce(
    (a, e) => a + e.amountCents,
    0,
  );

  const expensesWindow: Metric<number> = !hasExpenses
    ? unavailable(NEEDS_EXPENSES)
    : expensesNeedMonths
      ? unavailable(expensesNeedMonths)
      : available(expensesWindowCents);

  /** Revenue over exactly the span the expenses cover, so the two compare. */
  const revenueForExpenseMonths = windowRows.reduce(
    (a, r) => a + r.totalCents,
    0,
  );

  const netForWindow = revenueForExpenseMonths - expensesWindowCents;

  const netProfitWindow: Metric<number> =
    !hasExpenses || expensesNeedMonths
      ? (expensesWindow as Metric<number>)
      : available(netForWindow);

  /** Average net per month across the window. Negative means burning. */
  const monthlyNetCents = dayGrainWindow
    // Scaled to a month so runway stays in months whatever window is selected —
    // a 7-day net divided into cash would read as years.
    ? (netForWindow / windowDays.size) * 30.44
    : windowMonths.size > 0
      ? netForWindow / windowMonths.size
      : 0;

  // Both computed here rather than reused: the cash total and the run rate are
  // assembled further down, and hoisting them would reorder unrelated code.
  const cashTotalCents = snapshot.cash.reduce((a, c) => a + c.amountCents, 0);
  const annualRunRateCents = totalCents * 12;

  const runwayMonths: Metric<number> = !hasExpenses
    ? unavailable(NEEDS_EXPENSES)
    : expensesNeedMonths
      ? unavailable(expensesNeedMonths)
      : !cashTotalCents
        ? unavailable(NEEDS_CASH)
        : monthlyNetCents >= 0
          ? unavailable(
              "The network is profitable over this window, so there's no burn to divide cash by — runway is unbounded rather than a number.",
            )
          : available(cashTotalCents / -monthlyNetCents);

  /** Cost of revenue vs operating expense, for gross margin. */
  const cogsCents = scopedExpenses
    .filter((e) => e.costOfRevenue)
    .reduce((a, e) => a + e.amountCents, 0);
  const anyCogsFlagged = snapshot.expenses.some((e) => e.costOfRevenue);

  const grossMargin: Metric<number> = !hasExpenses
    ? unavailable(NEEDS_EXPENSES)
    : expensesNeedMonths
      ? unavailable(expensesNeedMonths)
      : !anyCogsFlagged
        ? unavailable(
            "Gross margin needs to know which costs are cost of revenue. Mark those lines `costOfRevenue: true` (hosting, payment fees, support) — without it every cost is operating expense and gross margin would just restate net.",
          )
        : revenueForExpenseMonths <= 0
          ? unavailable("No revenue in this window to take a margin on.")
          : available(
              (revenueForExpenseMonths - cogsCents) / revenueForExpenseMonths,
            );

  const expenseByCategory: Metric<RecencyBand[]> = !hasExpenses
    ? unavailable(NEEDS_EXPENSES)
    : expensesNeedMonths
      ? unavailable(expensesNeedMonths)
      : (() => {
          const byCat = new Map<string, number>();
          for (const e of scopedExpenses) {
            byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountCents);
          }
          const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
          if (!rows.length || expensesWindowCents <= 0) {
            return unavailable(NEEDS_EXPENSES);
          }
          const RAMP = [600, 500, 400, 300, 200, 100];
          return available(
            rows.map(([label, value], i) => ({
              key: label,
              label,
              value,
              share: value / expensesWindowCents,
              step: RAMP[Math.min(i, RAMP.length - 1)],
            })),
          );
        })();

  // --- Headcount ------------------------------------------------------------
  const headcountInScope = (h: { platform?: PlatformId }) =>
    !platformFilter ? true : h.platform !== undefined && platformFilter.includes(h.platform);

  /** Latest headcount at or before the end of the window. */
  const latestHeadcount = (() => {
    const rows = snapshot.headcount
      .filter(headcountInScope)
      .filter((h) => h.month <= windowEnd.slice(0, 7))
      .sort((a, b) => a.month.localeCompare(b.month));
    if (!rows.length) return null;
    const last = rows[rows.length - 1].month;
    return rows
      .filter((h) => h.month === last)
      .reduce((a, h) => a + h.employees, 0);
  })();

  const NEEDS_HEADCOUNT = platformFilter
    ? "Headcount isn't broken down by platform. Add a `platform` to the headcount rows, or clear the platform filter to see the network figure."
    : "Add a `headcount` array to data/network.json (month, employees), or have the admin API return one.";

  const revenuePerEmployee: Metric<number> =
    latestHeadcount === null || latestHeadcount <= 0
      ? unavailable(NEEDS_HEADCOUNT)
      : !annualRunRateCents
        ? unavailable(NEEDS_CUSTOMERS)
        : available(annualRunRateCents / latestHeadcount);

  /** Scoped expense total for one month row, optionally cost-of-revenue only. */
  const expenseTotalForRow = (
    r: MonthRevenue | DayRevenue,
    cogsOnly = false,
  ): number => {
    if ("date" in r) {
      return snapshot.expensesDaily
        .filter((e) => e.date === r.date && expenseInScope(e))
        .filter((e) => (cogsOnly ? e.costOfRevenue : true))
        .reduce((a, e) => a + e.amountCents, 0);
    }
    const span = monthSpan(r.month);
    const [sy, sm] = span.start.split("-").map(Number);
    const [ey, em] = span.end.split("-").map(Number);
    const months = new Set<string>();
    for (let y = sy, mo = sm; y < ey || (y === ey && mo <= em); ) {
      months.add(`${y}-${String(mo).padStart(2, "0")}`);
      mo++;
      if (mo > 12) {
        mo = 1;
        y++;
      }
    }
    return snapshot.expenses
      .filter((e) => months.has(e.month) && expenseInScope(e))
      .filter((e) => (cogsOnly ? e.costOfRevenue : true))
      .reduce((a, e) => a + e.amountCents, 0);
  };

  /** Consumer history summed across in-scope platforms, for a plotted row. */
  const consumerHistoryAt = (
    r: MonthRevenue | DayRevenue,
    pick: (c: { tracked: number; purchasers: Record<string, number> }) => number,
  ): number => {
    // A day row takes its month's figure — the rollup is monthly, and holding
    // a month's value flat across its days is what the source actually says.
    const key = "date" in r ? r.date.slice(0, 7) : monthSpan(r.month).end;
    const rows = snapshot.consumersMonthly
      .filter((c) => inScope(c.platform))
      .filter((c) => c.month <= key);
    if (!rows.length) return 0;
    const last = rows[rows.length - 1].month;
    return rows.filter((c) => c.month === last).reduce((a, c) => a + pick(c), 0);
  };

  /** Cash total as at a plotted row, carrying the last known balance forward. */
  const cashAt = (r: MonthRevenue | DayRevenue): number => {
    const key = "date" in r ? r.date.slice(0, 7) : monthSpan(r.month).end;
    const rows = snapshot.cashMonthly.filter((c) => c.month <= key);
    return rows.length ? rows[rows.length - 1].amountCents : cashTotalCents;
  };

  /** Headcount as at a month key, carrying the last known value forward. */
  const headcountAt = (monthKey: string): number => {
    const end = monthSpan(monthKey).end;
    const rows = snapshot.headcount
      .filter(headcountInScope)
      .filter((h) => h.month <= end)
      .sort((a, b) => a.month.localeCompare(b.month));
    if (!rows.length) return 0;
    const last = rows[rows.length - 1].month;
    return rows
      .filter((h) => h.month === last)
      .reduce((a, h) => a + h.employees, 0);
  };

  // --- Per-tile series ------------------------------------------------------
  // Each stat tile can drive the main chart. Only some of these have real
  // history: revenue, GMV and customer starts do; the consumer rollup is a
  // current snapshot with no time dimension and cash is a single balance. The
  // ones that can't be plotted say what would make them plottable rather than
  // drawing an invented line, which is the whole point of the Metric type.

  /** Last calendar day a bucket covers — when a "how many" figure is measured. */
  const bucketEndDate = (r: MonthRevenue | DayRevenue): string => {
    if ("date" in r) return r.date;
    const end = monthSpan(r.month).end;
    const [y, mo] = end.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return `${end}-${String(lastDay).padStart(2, "0")}`;
  };

  /**
   * Whether a customer head count can be rebuilt for past periods.
   *
   * Both failures here produce a WRONG line rather than a missing one, which
   * is why they're checked rather than assumed: a customer with no start date
   * can't be placed in time at all, and a churned customer with no churn date
   * would be absent from every past bucket even though they were paying then.
   */
  const customerHistoryNeeds: string | null = !customers.length
    ? NEEDS_CUSTOMERS
    : !customers.every((c) => c.startedAt)
      ? "Needs a start date on every customer to rebuild the count for past periods. Stripe supplies it from the subscription; otherwise add `startedAt`."
      : customers.some((c) => c.status === "churned")
        ? "Some customers are marked churned but carry no churn date, so past periods can't be rebuilt — they'd be missing from months they were actually paying for. Add a `churnedAt` date."
        : null;

  const activeAsOf = (date: string) =>
    customers.filter((c) => c.startedAt && c.startedAt <= date);

  const pointFrom = (r: MonthRevenue | DayRevenue, value: number): SeriesPoint => {
    const b = toBar(r);
    return { key: b.key, label: b.label, full: b.full, value, partial: b.partial };
  };

  /** GMV for one bucket, over exactly the months (or the day) it covers. */
  const gmvForRow = (r: MonthRevenue | DayRevenue): number | null => {
    if ("date" in r) {
      return snapshot.gmvDaily.length ? (gmvDays.get(r.date) ?? 0) : null;
    }
    if (!snapshot.gmv.length) return null;
    const span = monthSpan(r.month);
    const [sy, sm] = span.start.split("-").map(Number);
    const [ey, em] = span.end.split("-").map(Number);
    let total = 0;
    for (let y = sy, mo = sm; y < ey || (y === ey && mo <= em); ) {
      total += gmvMonths.get(`${y}-${String(mo).padStart(2, "0")}`) ?? 0;
      mo++;
      if (mo > 12) {
        mo = 1;
        y++;
      }
    }
    return total;
  };

  /** Months a bucket spans, for normalising a per-month figure. */
  const monthsPerBucket =
    bucket === "month" ? 1 : bucket === "quarter" ? 3 : bucket === "year" ? 12 : null;

  const countSeries = (fn: (row: MonthRevenue | DayRevenue) => number) =>
    customerHistoryNeeds
      ? unavailable(customerHistoryNeeds)
      : available(windowRows.map((r) => pointFrom(r, fn(r))));

  const tileSeries: Record<TileKey, TileSeries> = {
    customers: {
      title: "Customers over time",
      format: "count",
      points: countSeries((r) => activeAsOf(bucketEndDate(r)).length),
    },

    states: {
      title: "States with customers over time",
      format: "count",
      points: countSeries(
        (r) => new Set(activeAsOf(bucketEndDate(r)).map((c) => c.state).filter(Boolean)).size,
      ),
    },

    arpc: {
      title:
        monthsPerBucket === null
          ? "Revenue per customer, per day"
          : "Avg revenue per customer, per month",
      format: "money",
      unit: monthsPerBucket === null ? "/day" : "/mo",
      points: customerHistoryNeeds
        ? unavailable(customerHistoryNeeds)
        : available(
            windowRows.map((r) => {
              const heads = activeAsOf(bucketEndDate(r)).length;
              // A bucket before the first customer signed has no denominator;
              // 0 is the honest value, not a divide-by-zero Infinity.
              const per = heads > 0 ? r.totalCents / heads : 0;
              return pointFrom(r, monthsPerBucket ? per / monthsPerBucket : per);
            }),
          ),
    },

    gmv: {
      title: "Gross merchandise value over time",
      format: "money",
      points: (() => {
        const vals = windowRows.map(gmvForRow);
        if (vals.some((v) => v === null)) {
          return unavailable(
            "date" in (windowRows[0] ?? {})
              ? "Day-level GMV needs a `gmvDaily` series — monthly totals can't be split into days after the fact."
              : NEEDS_GMV,
          );
        }
        return available(windowRows.map((r, i) => pointFrom(r, vals[i] as number)));
      })(),
    },

    change: {
      title: "Revenue change, period over period",
      format: "percent",
      points: (() => {
        // The first bucket has nothing before it, so the series starts at the
        // second — a leading 0% would read as "flat", which is a claim.
        if (windowRows.length < 2) {
          return unavailable(
            "Needs at least two complete buckets in the window to compare one against the previous.",
          );
        }
        return available(
          windowRows.slice(1).map((r, i) => {
            const prev = windowRows[i].totalCents;
            return pointFrom(r, prev > 0 ? (r.totalCents - prev) / prev : 0);
          }),
        );
      })(),
    },

    expenses: {
      title: "Expenses over time",
      format: "money",
      points: !hasExpenses
        ? unavailable(NEEDS_EXPENSES)
        : expensesNeedMonths
          ? unavailable(expensesNeedMonths)
          : available(
              windowRows.map((r) => pointFrom(r, expenseTotalForRow(r))),
            ),
    },

    net: {
      title: "Net profit over time",
      format: "money",
      points: !hasExpenses
        ? unavailable(NEEDS_EXPENSES)
        : expensesNeedMonths
          ? unavailable(expensesNeedMonths)
          : available(
              windowRows.map((r) =>
                pointFrom(r, r.totalCents - expenseTotalForRow(r)),
              ),
            ),
    },

    // Point-in-time figures with no per-period series behind them. Runway is
    // computed from a cash balance we only hold for today; margin and revenue
    // per employee could be plotted, but only once expenses and headcount are
    // reconstructable per period the same way — which is the same gap the
    // consumer tiles have.
    runway: {
      title: "Runway over time (months)",
      format: "count",
      points:
        !snapshot.cashMonthly.length || !hasExpenses
          ? unavailable(
              "Runway needs both a dated series of cash balances and expenses, so each period can be divided by its own burn.",
            )
          : available(
              windowRows.map((r) => {
                const burn = expenseTotalForRow(r) - r.totalCents;
                // A profitable period has no burn to divide by. Zero is the
                // honest plot point — the tile itself explains why.
                return pointFrom(r, burn > 0 ? cashAt(r) / burn : 0);
              }),
            ),
    },

    margin: {
      title: "Gross margin over time",
      format: "percent",
      points: !hasExpenses
        ? unavailable(NEEDS_EXPENSES)
        : expensesNeedMonths
          ? unavailable(expensesNeedMonths)
          : !anyCogsFlagged
            ? unavailable(
                "Needs `costOfRevenue: true` on the lines that are cost of revenue.",
              )
            : available(
                windowRows.map((r) =>
                  pointFrom(
                    r,
                    r.totalCents > 0
                      ? (r.totalCents - expenseTotalForRow(r, true)) / r.totalCents
                      : 0,
                  ),
                ),
              ),
    },

    revPerEmployee: {
      title: "Revenue per employee over time",
      format: "money",
      points:
        snapshot.headcount.length === 0
          ? unavailable(NEEDS_HEADCOUNT)
          : available(
              windowRows.map((r) => {
                const heads = headcountAt(
                  "date" in r ? r.date.slice(0, 7) : r.month,
                );
                // A day of revenue annualises by 365, a month by 12.
                const annualised =
                  "date" in r ? r.totalCents * 365 : r.totalCents * 12;
                return pointFrom(r, heads > 0 ? annualised / heads : 0);
              }),
            ),
    },

    consumers: {
      title: "Consumers tracked over time",
      format: "count",
      points: snapshot.consumersMonthly.length
        ? available(
            windowRows.map((r) =>
              pointFrom(r, consumerHistoryAt(r, (c) => c.tracked)),
            ),
          )
        : unavailable(
            "The consumer rollup is a current head count with no time dimension — it says how many consumers exist now, not how many existed last March. Plotting it needs a per-period snapshot: have the consumer query group by month, or record the rollup on a schedule.",
          ),
    },

    purchasers: {
      title: `Purchasers over time · ${consumerWindowLabel(range.consumerWindow)}`,
      format: "count",
      points: snapshot.consumersMonthly.length
        ? available(
            windowRows.map((r) =>
              pointFrom(
                r,
                consumerHistoryAt(
                  r,
                  (c) => c.purchasers[range.consumerWindow] ?? 0,
                ),
              ),
            ),
          )
        : unavailable(
            "Purchaser counts are trailing-window totals as of today, not a per-period series. Plotting them needs the consumer query to return one row per month (distinct purchasers in that month) rather than one row per platform.",
          ),
    },

    cash: {
      title: "Cash on hand over time",
      format: "money",
      points: snapshot.cashMonthly.length
        ? available(windowRows.map((r) => pointFrom(r, cashAt(r))))
        : unavailable(
            "Cash on hand is a balance read at a single moment, so there's nothing to plot without history. Record the balance on a schedule and send it as a dated series.",
          ),
    },
  };

  const profitPair: Metric<ProfitPoint[]> = !hasExpenses
    ? unavailable(NEEDS_EXPENSES)
    : expensesNeedMonths
      ? unavailable(expensesNeedMonths)
      : available(
          windowRows.map((r) => {
            const b = toBar(r);
            return {
              key: b.key,
              label: b.label,
              full: b.full,
              grossCents: r.totalCents - expenseTotalForRow(r, true),
              netCents: r.totalCents - expenseTotalForRow(r),
              partial: b.partial,
            };
          }),
        );

  const gmvWindowTotal = (() => {
    // Match the keys the revenue window is already built from, so a quarter or
    // year rolls up identically instead of being re-derived.
    if (dayGrain) {
      if (gmvDays.size === 0) return null;
      return windowRows.reduce((a, r) => {
        const key = "date" in r ? r.date : r.month;
        return a + (gmvDays.get(key) ?? 0);
      }, 0);
    }
    if (gmvMonths.size === 0) return null;
    let total = 0;
    for (const [monthKey, amount] of gmvMonths) {
      if (windowMonths.has(monthKey)) total += amount;
    }
    return total;
  })();

  // --- GMV per state --------------------------------------------------------
  // Summed over the SAME months the window covers, so a state's GMV and the
  // headline GMV always describe one period. Day-grained windows are excluded
  // rather than approximated: the per-state split only exists monthly.
  const stateGmvUnavailable: string | null = (() => {
    if (dayGrain) {
      return "Per-state GMV is monthly; switch to a 3M window or wider to see it.";
    }
    const anySplit = snapshot.gmv.some(
      (g) => g.byState && Object.keys(g.byState).length > 0,
    );
    if (!anySplit) {
      return "not tracked by state";
    }
    return null;
  })();

  if (!stateGmvUnavailable) {
    const perState = new Map<string, number>();
    for (const g of snapshot.gmv) {
      if (!inScope(g.platform) || !windowMonths.has(g.month)) continue;
      for (const [code, amount] of Object.entries(g.byState ?? {})) {
        if (typeof amount === "number" && Number.isFinite(amount)) {
          perState.set(code, (perState.get(code) ?? 0) + amount);
        }
      }
    }
    for (const entry of byState.values()) {
      const v = perState.get(entry.code);
      if (v !== undefined) entry.gmvCents = v;
    }
  }

  // --- Cash ------------------------------------------------------------------
  // Deliberately NOT filtered by platform or range: a bank balance belongs to
  // the company, not to a product line or a date window.
  const cashTotal = snapshot.cash.reduce((a, c) => a + c.amountCents, 0);
  const cashDates = snapshot.cash
    .map((c) => c.asOf)
    .filter((d): d is string => Boolean(d))
    .sort();
  // Oldest date wins: the total is only as current as its stalest component.
  const cashAsOf = cashDates.length ? cashDates[0] : null;

  const windowLabel =
    range.from || bucket === "month" || bucket === "day" || range.count === Infinity
      ? range.window
      : `last ${take} ${bucket}${take === 1 ? "" : "s"}`;

  return {
    windowLabel,
    stateGmvUnavailable,
    gmvWindow:
      gmvWindowTotal === null
        ? unavailable(dailyMissing ? NEEDS_DAILY_REVENUE : NEEDS_GMV)
        : available(gmvWindowTotal),

    // Our cut of the volume. Only meaningful when both sides cover the same
    // window, which they do by construction above.
    takeRate:
      gmvWindowTotal !== null && gmvWindowTotal > 0 && !dailyMissing
        ? available(windowSum / gmvWindowTotal)
        : unavailable(NEEDS_GMV),

    cashOnHand: snapshot.cash.length
      ? available(
          cashTotal,
          snapshot.cash.length === 1
            ? snapshot.cash[0].label
            : `${snapshot.cash.length} accounts`,
        )
      : unavailable(NEEDS_CASH),
    cashAsOf,

    windowMonthCount: windowMonths.size,
    expensesWindow,
    netProfitWindow,
    runwayMonths,
    grossMargin,
    revenuePerEmployee,
    expenseByCategory,
    sharedExcludedCents,
    employees: latestHeadcount,
    tileSeries,
    profitPair,
    consumerRecency: recency,
    consumerRecencyByState,
    customerTenure,
    customerTenureByState,
    stateRecencyUnavailable,
    customerCount: hasCustomers
      ? available(customers.length)
      : unavailable(NEEDS_CUSTOMERS),

    stateCount: !hasCustomers
      ? unavailable(NEEDS_CUSTOMERS)
      : customerStateCount === 0
        ? unavailable(NEEDS_STATE)
        : available(
            customerStateCount,
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

    avgSaasShareCents: hasCustomers
      ? available(Math.round(saasCents / customers.length))
      : unavailable(NEEDS_CUSTOMERS),
    avgUsageShareCents: hasCustomers
      ? available(Math.round(usageCents / customers.length))
      : unavailable(NEEDS_CUSTOMERS),
    usageBillingCustomers: payingUsage,

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

    // A purchaser count can't be derived from a neighbouring window, so when
    // the source doesn't compute this one the tile says which column to add
    // rather than quietly showing a different period's number.
    consumersPurchased:
      pWindow !== null
        ? available(pWindow)
        : unavailable(
            hasConsumers
              ? `No purchaser count for the ${consumerWindowLabel(range.consumerWindow)}. Add ${range.consumerWindow === "ever" ? "purchased_ever" : `purchased_${range.consumerWindow}d`} to the consumer query in src/connectors/queries.ts, or send it in the admin API's \`purchasers\` map.`
              : NEEDS_CONSUMERS,
          ),
    consumerWindowLabel: consumerWindowLabel(range.consumerWindow),

    consumersDormant:
      pWindow !== null && tracked > 0
        ? available(Math.max(0, tracked - pWindow))
        : unavailable(NEEDS_CONSUMERS),

    annualRunRate: hasCustomers
      ? available(totalCents * 12)
      : unavailable(NEEDS_CUSTOMERS),

    consumersTracked: hasConsumers
      ? available(tracked)
      : unavailable(NEEDS_CONSUMERS),

    consumersPurchased30d:
      p30 !== null ? available(p30) : unavailable(NEEDS_CONSUMERS),

    consumersPurchased180d:
      p180 !== null ? available(p180) : unavailable(NEEDS_CONSUMERS),

    consumerActivation30d:
      p30 !== null && tracked > 0
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
    row.consumers30d = c.purchasers["30"] ?? null;
  }

  return [...rows.values()]
    .filter((r) => r.customers > 0 || r.consumersTracked !== null)
    .sort((a, b) => b.mrrCents - a.mrrCents);
}

/**
 * Rolls the monthly series into quarters or years.
 *
 * A bucket stays partial if ANY month in it is — a quarter one month into its
 * run is every bit as incomplete as the month itself, and comparing it against
 * finished quarters would understate it the same way.
 */
function rollUpMonths(
  months: MonthRevenue[],
  bucket: "quarter" | "year",
): MonthRevenue[] {
  const out = new Map<string, MonthRevenue>();
  for (const m of months) {
    const [y, mm] = m.month.split("-");
    const key =
      bucket === "year" ? y : `${y}-Q${Math.floor((Number(mm) - 1) / 3) + 1}`;
    const cur = out.get(key) ?? {
      month: key,
      saasCents: 0,
      usageCents: 0,
      totalCents: 0,
    };
    cur.saasCents += m.saasCents;
    cur.usageCents += m.usageCents;
    cur.totalCents = cur.saasCents + cur.usageCents;
    if (m.partial) cur.partial = true;
    out.set(key, cur);
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** "Q2" / "2026" for the axis. */
function bucketShortLabel(key: string): string {
  return key.includes("-Q") ? key.split("-")[1] : key;
}

/** "Q2 2026" / "2026" for tooltips and the table. */
function bucketLongLabel(key: string): string {
  if (!key.includes("-Q")) return key;
  const [y, q] = key.split("-");
  return `${q} ${y}`;
}

/** "Bought in the last 30 days" / "31–180 days ago" / "Over a year ago". */
function bandLabel(from: string | null, to: string): string {
  if (to === "ever") {
    if (from === "365") return "Over a year ago";
    return from ? `More than ${from} days ago` : "Ever";
  }
  if (from === null) return `Bought in the last ${to} days`;
  return `${Number(from) + 1}–${to} days ago`;
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
