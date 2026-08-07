import type { Connector } from "./types";
import { dayKey, monthKey, toMonthlyCents } from "./types";
import type {
  ConnectorResult,
  CustomerRecord,
  DataDomain,
  PlatformId,
  CashPosition,
  RevenueDayPoint,
  RevenuePoint,
} from "@/lib/types";
import { normalizeState } from "@/lib/states";

/**
 * Stripe connector — plain REST over fetch, no SDK dependency.
 *
 * How it decides SaaS vs Usage, in priority order:
 *   1. price.metadata.pyrotree_revenue_type = "saas" | "usage"   ← preferred
 *   2. product id listed in STRIPE_USAGE_PRODUCTS (comma separated)
 *   3. price.recurring.usage_type === "metered"                  → usage
 *   4. everything else                                           → saas
 *
 * How it decides platform, in priority order:
 *   1. customer.metadata.platform
 *   2. subscription.metadata.platform
 *   3. STRIPE_DEFAULT_PLATFORM (env), else "unassigned"
 *
 * Tagging prices with metadata in the Stripe dashboard is a 10-minute job and
 * makes every revenue split on this dashboard exact. Until then rule 3 gives a
 * decent approximation.
 */

const API = "https://api.stripe.com";
const REVENUE_MONTHS = 12;
const MAX_PAGES = 40;

interface StripeList<T> {
  data: T[];
  has_more: boolean;
}

interface StripeAddress {
  state?: string | null;
}

interface StripeCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  address?: StripeAddress | null;
  shipping?: { address?: StripeAddress | null } | null;
  metadata?: Record<string, string>;
}

interface StripePrice {
  id: string;
  product?: string;
  unit_amount?: number | null;
  metadata?: Record<string, string>;
  recurring?: {
    interval: "day" | "week" | "month" | "year";
    interval_count: number;
    usage_type?: "licensed" | "metered";
  } | null;
}

interface StripeSubscription {
  id: string;
  status: string;
  start_date?: number;
  customer: StripeCustomer | string;
  metadata?: Record<string, string>;
  items: StripeList<{ id: string; quantity?: number; price: StripePrice }>;
}

interface StripeBalance {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
}

interface StripeInvoice {
  id: string;
  customer: string | null;
  status: string;
  created: number;
  lines: StripeList<{
    amount: number;
    price?: StripePrice | null;
    metadata?: Record<string, string>;
  }>;
}

function key(): string {
  return process.env.STRIPE_SECRET_KEY ?? "";
}

async function stripeGet<T>(
  path: string,
  params: Record<string, string | string[]>,
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
    else qs.append(k, v);
  }
  const res = await fetch(`${API}${path}?${qs}`, {
    headers: {
      Authorization: `Bearer ${key()}`,
      "Stripe-Version": "2024-06-20",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Stripe ${path} returned ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

/** Cursor-paginate a Stripe list endpoint. */
async function listAll<T extends { id: string }>(
  path: string,
  params: Record<string, string | string[]>,
): Promise<T[]> {
  const out: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await stripeGet<StripeList<T>>(path, {
      ...params,
      limit: "100",
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    out.push(...res.data);
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  return out;
}

function usageProductIds(): Set<string> {
  return new Set(
    (process.env.STRIPE_USAGE_PRODUCTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function classify(
  price: StripePrice | null | undefined,
  usageProducts: Set<string>,
): "saas" | "usage" {
  const tag = price?.metadata?.pyrotree_revenue_type;
  if (tag === "usage" || tag === "saas") return tag;
  if (price?.product && usageProducts.has(price.product)) return "usage";
  if (price?.recurring?.usage_type === "metered") return "usage";
  return "saas";
}

function platformOf(
  customer: StripeCustomer | undefined,
  sub?: StripeSubscription,
): PlatformId {
  return (
    customer?.metadata?.platform ??
    sub?.metadata?.platform ??
    process.env.STRIPE_DEFAULT_PLATFORM ??
    "unassigned"
  );
}

export const stripeConnector: Connector = {
  id: "stripe",
  label: "Stripe",

  isConfigured: () => key().startsWith("sk_") || key().startsWith("rk_"),

  missing: () =>
    "Set STRIPE_SECRET_KEY (a restricted key with read access to Customers, Subscriptions, Invoices and Balance).",

  async fetch(): Promise<ConnectorResult> {
    const usageProducts = usageProductIds();
    const provides: DataDomain[] = [];
    const warnings: string[] = [];

    // --- Customers + current MRR, from active subscriptions -----------------
    const subs = await listAll<StripeSubscription>("/v1/subscriptions", {
      status: "active",
      "expand[]": ["data.customer", "data.items.data.price"],
    });

    const byCustomer = new Map<string, CustomerRecord>();
    const platformByCustomer = new Map<string, PlatformId>();

    for (const sub of subs) {
      const cust =
        typeof sub.customer === "string" ? undefined : sub.customer;
      const custId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const platform = platformOf(cust, sub);
      platformByCustomer.set(custId, platform);

      const state = normalizeState(
        cust?.address?.state ??
          cust?.shipping?.address?.state ??
          cust?.metadata?.state ??
          null,
      );

      let saas = 0;
      let usage = 0;
      for (const item of sub.items.data) {
        const price = item.price;
        const amount = (price.unit_amount ?? 0) * (item.quantity ?? 1);
        const monthly = price.recurring
          ? toMonthlyCents(
              amount,
              price.recurring.interval,
              price.recurring.interval_count,
            )
          : amount;
        if (classify(price, usageProducts) === "usage") usage += monthly;
        else saas += monthly;
      }

      const existing = byCustomer.get(custId);
      if (existing) {
        existing.mrrSaasCents += saas;
        existing.mrrUsageCents += usage;
      } else {
        byCustomer.set(custId, {
          id: custId,
          name: cust?.name ?? cust?.email ?? custId,
          platform,
          state,
          status: "active",
          mrrSaasCents: saas,
          mrrUsageCents: usage,
          startedAt: sub.start_date
            ? new Date(sub.start_date * 1000).toISOString().slice(0, 10)
            : undefined,
          source: "stripe",
        });
      }
    }

    const customers = [...byCustomer.values()];
    if (customers.length) provides.push("customers");

    const missingState = customers.filter((c) => !c.state).length;
    if (missingState) {
      warnings.push(
        `${missingState} customer${missingState === 1 ? "" : "s"} have no address state in Stripe`,
      );
    }
    const unassigned = customers.filter(
      (c) => c.platform === "unassigned",
    ).length;
    if (unassigned) {
      warnings.push(
        `${unassigned} not tagged with a platform (set customer metadata "platform")`,
      );
    }

    // --- Monthly revenue, from paid invoices --------------------------------
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - REVENUE_MONTHS);
    since.setUTCDate(1);

    const invoices = await listAll<StripeInvoice>("/v1/invoices", {
      status: "paid",
      "created[gte]": String(Math.floor(since.getTime() / 1000)),
      "expand[]": ["data.lines.data.price"],
    });

    const buckets = new Map<string, RevenuePoint>();
    // Invoices carry an exact timestamp, so the daily series costs nothing
    // extra here — and it's what the short time ranges read off.
    const dayBuckets = new Map<string, RevenueDayPoint>();
    let truncatedLines = 0;

    for (const inv of invoices) {
      if (inv.lines.has_more) truncatedLines++;
      const at = new Date(inv.created * 1000);
      const month = monthKey(at);
      const date = dayKey(at);
      const platform =
        (inv.customer && platformByCustomer.get(inv.customer)) ??
        process.env.STRIPE_DEFAULT_PLATFORM ??
        "unassigned";

      const bucket = buckets.get(`${month}|${platform}`) ?? {
        month,
        platform,
        saasCents: 0,
        usageCents: 0,
      };
      const day = dayBuckets.get(`${date}|${platform}`) ?? {
        date,
        platform,
        saasCents: 0,
        usageCents: 0,
      };

      for (const line of inv.lines.data) {
        if (classify(line.price, usageProducts) === "usage") {
          bucket.usageCents += line.amount;
          day.usageCents += line.amount;
        } else {
          bucket.saasCents += line.amount;
          day.saasCents += line.amount;
        }
      }

      buckets.set(`${month}|${platform}`, bucket);
      dayBuckets.set(`${date}|${platform}`, day);
    }

    const revenue = [...buckets.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    );
    const revenueDaily = [...dayBuckets.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (revenue.length) provides.push("revenue");

    if (truncatedLines) {
      warnings.push(
        `${truncatedLines} invoices had >10 line items; only the first 10 were counted`,
      );
    }

    // --- Cash held at Stripe --------------------------------------------------
    // Only the Stripe balance — settled money in a bank account is invisible
    // from here, so this is a floor on cash, not the whole picture. The label
    // says so rather than implying it's the company total.
    let cash: CashPosition[] = [];
    try {
      const bal = await stripeGet<StripeBalance>("/v1/balance", {});
      const usd = (rows: { amount: number; currency: string }[]) =>
        (rows ?? [])
          .filter((r) => r.currency.toLowerCase() === "usd")
          .reduce((a, r) => a + r.amount, 0);
      cash = [
        {
          label: "Stripe balance (available + pending)",
          amountCents: usd(bal.available) + usd(bal.pending),
          asOf: new Date().toISOString().slice(0, 10),
        },
      ];
      provides.push("cash");
    } catch (err) {
      // A restricted key without Balance access shouldn't sink the connector —
      // every other metric it produced is still good.
      warnings.push(
        `Stripe balance unavailable (${err instanceof Error ? err.message.slice(0, 60) : "error"}); add Balance read access to the key`,
      );
    }

    const detail =
      `${customers.length} active customers, ${revenue.length} month/platform revenue buckets from ${invoices.length} paid invoices.` +
      (warnings.length ? ` Caveats: ${warnings.join("; ")}.` : "");

    return {
      customers,
      revenue,
      revenueDaily,
      cash,
      status: {
        id: "stripe",
        label: "Stripe",
        state: warnings.length ? "partial" : "ok",
        detail,
        provides,
      },
    };
  },
};
