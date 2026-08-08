import type { Connector } from "./types";
import { runConnector } from "./types";
import { manualConnector } from "./manual";
import { stripeConnector } from "./stripe";
import { databaseConnector } from "./database";
import { internalApiConnector } from "./internalApi";
import type {
  CashPosition,
  ExpensePoint,
  HeadcountPoint,
  GmvDayPoint,
  GmvPoint,
  ConsumerStats,
  CustomerRecord,
  Platform,
  RevenueDayPoint,
  RevenuePoint,
  Snapshot,
} from "@/lib/types";

/**
 * Registry order is precedence order, lowest first: a later connector's record
 * for the same customer id / platform-month wins. Automated sources therefore
 * override whatever was hand-entered in data/network.json.
 */
export const CONNECTORS: Connector[] = [
  manualConnector,
  internalApiConnector,
  databaseConnector,
  stripeConnector,
];

const DEFAULT_PLATFORMS: Platform[] = [
  { id: "webjoint", name: "WebJoint", industry: "Cannabis" },
  { id: "menu", name: "Menu.com", industry: "Cannabis" },
];

/** In-process cache. Serverless gives each instance its own — that's fine. */
let cached: { snapshot: Snapshot; at: number } | null = null;
const TTL_MS = Number(process.env.PYROTREE_CACHE_SECONDS ?? 300) * 1000;

export async function getSnapshot(force = false): Promise<Snapshot> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.snapshot;
  const snapshot = await buildSnapshot();
  cached = { snapshot, at: Date.now() };
  return snapshot;
}

async function buildSnapshot(): Promise<Snapshot> {
  const results = await Promise.all(CONNECTORS.map((c) => runConnector(c)));

  // Later sources overwrite earlier ones on key collision.
  const customers = new Map<string, CustomerRecord>();
  const consumers = new Map<string, ConsumerStats>();
  const revenue = new Map<string, RevenuePoint>();
  const revenueDaily = new Map<string, RevenueDayPoint>();
  // Keyed by account label so a later source refreshes a balance rather than
  // double-counting the same account.
  const cash = new Map<string, CashPosition>();
  const gmv = new Map<string, GmvPoint>();
  const gmvDaily = new Map<string, GmvDayPoint>();
  const expenses = new Map<string, ExpensePoint>();
  const headcount = new Map<string, HeadcountPoint>();
  const platforms = new Map<string, Platform>(
    DEFAULT_PLATFORMS.map((p) => [p.id, p]),
  );

  for (const r of results) {
    for (const p of r.platforms ?? []) platforms.set(p.id, p);
    for (const c of r.customers ?? []) customers.set(`${c.source}:${c.id}`, c);
    for (const c of r.consumers ?? []) consumers.set(c.platform, c);
    for (const p of r.revenue ?? [])
      revenue.set(`${p.month}|${p.platform}`, p);
    for (const p of r.revenueDaily ?? [])
      revenueDaily.set(`${p.date}|${p.platform}`, p);
    for (const c of r.cash ?? []) cash.set(c.label, c);
    for (const g of r.gmv ?? []) gmv.set(`${g.month}|${g.platform}`, g);
    for (const g of r.gmvDaily ?? []) gmvDaily.set(`${g.date}|${g.platform}`, g);
    // Keyed by month + category + platform, so a later source can correct one
    // line of a month without wiping the rest of it.
    for (const e of r.expenses ?? [])
      expenses.set(`${e.month}|${e.category}|${e.platform ?? ""}`, e);
    for (const h of r.headcount ?? [])
      headcount.set(`${h.month}|${h.platform ?? ""}`, h);
  }

  // Any platform referenced by data but never declared still gets a name.
  for (const c of customers.values()) {
    if (!platforms.has(c.platform)) {
      platforms.set(c.platform, { id: c.platform, name: titleize(c.platform) });
    }
  }
  for (const c of consumers.values()) {
    if (!platforms.has(c.platform)) {
      platforms.set(c.platform, { id: c.platform, name: titleize(c.platform) });
    }
  }

  const manual = results.find((r) => r.status.id === "manual");
  const demo =
    manual?.status.state === "ok" && manual.status.detail.startsWith("Seeded demo");

  return {
    generatedAt: new Date().toISOString(),
    demo,
    platforms: [...platforms.values()],
    customers: [...customers.values()],
    consumers: [...consumers.values()],
    expenses: [...expenses.values()].sort((a, b) => a.month.localeCompare(b.month)),
    headcount: [...headcount.values()].sort((a, b) => a.month.localeCompare(b.month)),
    revenue: [...revenue.values()].sort((a, b) => a.month.localeCompare(b.month)),
    revenueDaily: [...revenueDaily.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    cash: [...cash.values()],
    gmv: [...gmv.values()].sort((a, b) => a.month.localeCompare(b.month)),
    gmvDaily: [...gmvDaily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sources: results.map((r) => r.status),
  };
}

function titleize(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
