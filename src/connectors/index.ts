import type { Connector } from "./types";
import { runConnector } from "./types";
import { manualConnector } from "./manual";
import { stripeConnector } from "./stripe";
import { databaseConnector } from "./database";
import { internalApiConnector } from "./internalApi";
import type {
  ConsumerStats,
  CustomerRecord,
  Platform,
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
  const platforms = new Map<string, Platform>(
    DEFAULT_PLATFORMS.map((p) => [p.id, p]),
  );

  for (const r of results) {
    for (const p of r.platforms ?? []) platforms.set(p.id, p);
    for (const c of r.customers ?? []) customers.set(`${c.source}:${c.id}`, c);
    for (const c of r.consumers ?? []) consumers.set(c.platform, c);
    for (const p of r.revenue ?? [])
      revenue.set(`${p.month}|${p.platform}`, p);
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
    revenue: [...revenue.values()].sort((a, b) => a.month.localeCompare(b.month)),
    sources: results.map((r) => r.status),
  };
}

function titleize(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
