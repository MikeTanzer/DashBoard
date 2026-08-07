import type { Connector } from "./types";
import type {
  ConnectorResult,
  ConsumerStats,
  CustomerRecord,
  DataDomain,
  Platform,
  RevenueDayPoint,
  RevenuePoint,
} from "@/lib/types";
import { normalizeState } from "@/lib/states";
import { toPurchasers } from "@/lib/types";

/**
 * Internal admin / billing API connector.
 *
 * Point PYROTREE_API_URL at an endpoint that returns the payload below and
 * this lights up with no code changes. Every top-level key is optional — send
 * only what that service actually knows, and the dashboard shows the rest as
 * "Not yet tracked".
 *
 *   GET  $PYROTREE_API_URL
 *   Authorization: Bearer $PYROTREE_API_TOKEN     (omitted if the token is unset)
 *
 *   {
 *     "platforms": [{ "id": "webjoint", "name": "WebJoint", "industry": "Cannabis" }],
 *     "customers": [{
 *       "id": "wj_1024",
 *       "name": "Green Room Delivery",
 *       "platform": "webjoint",
 *       "state": "CA",
 *       "status": "active",
 *       "mrrSaasCents": 49900,
 *       "mrrUsageCents": 21350,
 *       "startedAt": "2024-03-11"
 *     }],
 *     // `purchasers` is keyed by trailing window in days, plus "ever".
 *     // Send only the windows you compute; the rest report as untracked.
 *     "consumers": [{
 *       "platform": "webjoint",
 *       "tracked": 812400,
 *       "purchasers": { "7": 31200, "30": 96300, "90": 189400,
 *                       "180": 288100, "365": 402700, "ever": 511900 }
 *     }],
 *     "revenue": [{
 *       "month": "2026-07",
 *       "platform": "webjoint",
 *       "saasCents": 4120000,
 *       "usageCents": 1875000
 *     }],
 *     // Optional. Powers the 1W / 1M ranges. Send it only if you hold real
 *     // day-level figures — monthly totals are never split into days.
 *     "revenueDaily": [{
 *       "date": "2026-07-31",
 *       "platform": "webjoint",
 *       "saasCents": 138400,
 *       "usageCents": 61200
 *     }]
 *   }
 */

interface ApiPayload {
  platforms?: Platform[];
  customers?: Partial<CustomerRecord>[];
  consumers?: (Partial<ConsumerStats> & {
    purchased30d?: number;
    purchased180d?: number;
  })[];
  revenue?: Partial<RevenuePoint>[];
  revenueDaily?: Partial<RevenueDayPoint>[];
}

export const internalApiConnector: Connector = {
  id: "internal-api",
  label: "Internal admin API",

  isConfigured: () => Boolean(process.env.PYROTREE_API_URL),

  missing: () =>
    "Set PYROTREE_API_URL (and PYROTREE_API_TOKEN if it needs auth). See the payload contract at the top of src/connectors/internalApi.ts.",

  async fetch(): Promise<ConnectorResult> {
    const token = process.env.PYROTREE_API_TOKEN;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let payload: ApiPayload;
    try {
      const res = await fetch(process.env.PYROTREE_API_URL!, {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(
          `Returned ${res.status} ${res.statusText}. Check PYROTREE_API_URL and the token.`,
        );
      }
      payload = (await res.json()) as ApiPayload;
    } finally {
      clearTimeout(timeout);
    }

    const provides: DataDomain[] = [];

    const customers: CustomerRecord[] = (payload.customers ?? []).map(
      (c, i) => ({
        id: c.id ?? `api-${i}`,
        name: c.name ?? `Customer ${i + 1}`,
        platform: c.platform ?? "unassigned",
        state: normalizeState(c.state ?? null),
        status: c.status ?? "active",
        mrrSaasCents: Math.round(c.mrrSaasCents ?? 0),
        mrrUsageCents: Math.round(c.mrrUsageCents ?? 0),
        startedAt: c.startedAt,
        source: "internal-api",
      }),
    );
    if (customers.length) provides.push("customers");

    const consumers: ConsumerStats[] = (payload.consumers ?? []).map((c) => ({
      platform: c.platform ?? "unassigned",
      tracked: c.tracked ?? 0,
      purchasers: toPurchasers(c),
    }));
    if (consumers.length) provides.push("consumers");

    const revenue: RevenuePoint[] = (payload.revenue ?? [])
      .filter((r): r is RevenuePoint => Boolean(r.month))
      .map((r) => ({
        month: r.month,
        platform: r.platform ?? "unassigned",
        saasCents: Math.round(r.saasCents ?? 0),
        usageCents: Math.round(r.usageCents ?? 0),
      }));
    const revenueDaily: RevenueDayPoint[] = (payload.revenueDaily ?? [])
      .filter((r): r is RevenueDayPoint => Boolean(r.date))
      .map((r) => ({
        date: r.date,
        platform: r.platform ?? "unassigned",
        saasCents: Math.round(r.saasCents ?? 0),
        usageCents: Math.round(r.usageCents ?? 0),
      }));
    if (revenue.length || revenueDaily.length) provides.push("revenue");

    const summary = [
      customers.length && `${customers.length} customers`,
      consumers.length && `${consumers.length} platform consumer rollups`,
      revenue.length && `${revenue.length} revenue months`,
      revenueDaily.length && `${revenueDaily.length} revenue days`,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      customers,
      consumers,
      revenue,
      revenueDaily,
      platforms: payload.platforms,
      status: {
        id: "internal-api",
        label: "Internal admin API",
        state: provides.length ? "ok" : "partial",
        detail: summary
          ? `${summary}.`
          : "Responded 200 but the payload had no records — check the contract in src/connectors/internalApi.ts.",
        provides,
      },
    };
  },
};
