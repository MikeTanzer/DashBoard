import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Connector } from "./types";
import type {
  ConnectorResult,
  ConsumerStats,
  CustomerRecord,
  DataDomain,
  Platform,
  CashPosition,
  GmvDayPoint,
  GmvPoint,
  RevenueDayPoint,
  RevenuePoint,
} from "@/lib/types";
import { normalizeState } from "@/lib/states";
import { toPurchasers } from "@/lib/types";

/**
 * Reads data/network.json — the escape hatch for anything not yet automated.
 * Every field is optional, so this can supply just the numbers the automated
 * connectors can't reach yet and stay silent about the rest.
 *
 * Set PYROTREE_MANUAL_FILE to point somewhere else (e.g. a mounted volume).
 */

interface ManualFile {
  demo?: boolean;
  platforms?: Platform[];
  customers?: Partial<CustomerRecord>[];
  consumers?: (Partial<ConsumerStats> & {
    purchased30d?: number;
    purchased180d?: number;
  })[];
  revenue?: RevenuePoint[];
  revenueDaily?: RevenueDayPoint[];
  cash?: CashPosition[];
  gmv?: GmvPoint[];
  gmvDaily?: GmvDayPoint[];
}

function filePath(): string {
  return (
    process.env.PYROTREE_MANUAL_FILE ??
    path.join(process.cwd(), "data", "network.json")
  );
}

export const manualConnector: Connector = {
  id: "manual",
  label: "Manual file (data/network.json)",

  isConfigured: () => process.env.PYROTREE_MANUAL_DISABLED !== "1",

  missing: () => "Disabled via PYROTREE_MANUAL_DISABLED=1.",

  async fetch(): Promise<ConnectorResult> {
    let raw: string;
    try {
      raw = await readFile(filePath(), "utf8");
    } catch {
      return {
        status: {
          id: "manual",
          label: manualConnector.label,
          state: "not_configured",
          detail: `No file at ${filePath()}. Copy data/network.example.json to data/network.json to use it.`,
          provides: [],
        },
      };
    }

    const parsed = JSON.parse(raw) as ManualFile;
    const demo = parsed.demo === true;
    const provides: DataDomain[] = [];

    const customers: CustomerRecord[] = (parsed.customers ?? []).map(
      (c, i) => ({
        id: c.id ?? `manual-${i}`,
        name: c.name ?? `Customer ${i + 1}`,
        platform: c.platform ?? "unknown",
        state: normalizeState(c.state ?? null),
        status: c.status ?? "active",
        mrrSaasCents: Math.round(c.mrrSaasCents ?? 0),
        mrrUsageCents: Math.round(c.mrrUsageCents ?? 0),
        startedAt: c.startedAt,
        source: "manual",
      }),
    );
    if (customers.length) provides.push("customers");

    const consumers: ConsumerStats[] = (parsed.consumers ?? []).map((c) => ({
      platform: c.platform ?? "unassigned",
      tracked: c.tracked ?? 0,
      purchasers: toPurchasers(c),
      consumersByState: c.consumersByState,
    }));
    if (consumers.length) provides.push("consumers");

    const revenue = parsed.revenue ?? [];
    const revenueDaily = parsed.revenueDaily ?? [];
    if (revenue.length || revenueDaily.length) provides.push("revenue");

    const cash = (parsed.cash ?? []).filter(
      (c) => c && typeof c.amountCents === "number" && c.label,
    );
    if (cash.length) provides.push("cash");

    const gmv = (parsed.gmv ?? []).filter(
      (g) => g && g.month && typeof g.amountCents === "number",
    );
    const gmvDaily = (parsed.gmvDaily ?? []).filter(
      (g) => g && g.date && typeof g.amountCents === "number",
    );
    if (gmv.length || gmvDaily.length) provides.push("gmv");

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
      cash,
      gmv,
      gmvDaily,
      platforms: parsed.platforms,
      status: {
        id: "manual",
        label: manualConnector.label,
        state: provides.length ? "ok" : "partial",
        detail: demo
          ? `Seeded demo data — ${summary || "empty file"}.`
          : summary || "File read, but it contained no records.",
        provides,
      },
    };
  },
};

/** Read just the demo flag without a full parse-and-map, for the banner. */
export async function manualIsDemo(): Promise<boolean> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return (JSON.parse(raw) as ManualFile).demo === true;
  } catch {
    return false;
  }
}
