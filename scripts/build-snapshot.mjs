#!/usr/bin/env node
/**
 * Bakes a snapshot into the bundle for the static (GitHub Pages) build.
 *
 * Pages serves files, not a server, so nothing can query Stripe or a database
 * when someone opens the page — the numbers have to be fixed at build time.
 * This reads data/network.json (the manual connector's file, seeded with demo
 * data by ensure-demo.mjs) and writes the same Snapshot shape the connector
 * registry would produce at runtime.
 *
 * The live connectors are untouched and still work on any server host; this is
 * only the path for a static deploy.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const src = path.join(process.cwd(), "data", "network.json");
const out = path.join(process.cwd(), "src", "generated", "snapshot.json");

const raw = JSON.parse(await readFile(src, "utf8"));

const normalizeState = (s) => (typeof s === "string" && s.trim() ? s.trim().toUpperCase() : null);

const customers = (raw.customers ?? []).map((c, i) => ({
  id: c.id ?? `manual-${i}`,
  name: c.name ?? `Customer ${i + 1}`,
  platform: c.platform ?? "unknown",
  state: normalizeState(c.state),
  status: c.status ?? "active",
  mrrSaasCents: Math.round(c.mrrSaasCents ?? 0),
  mrrUsageCents: Math.round(c.mrrUsageCents ?? 0),
  startedAt: c.startedAt,
  source: "manual",
}));

const consumers = (raw.consumers ?? []).map((c) => {
  const purchasers = { ...(c.purchasers ?? {}) };
  if (purchasers["30"] === undefined && typeof c.purchased30d === "number") {
    purchasers["30"] = c.purchased30d;
  }
  if (purchasers["180"] === undefined && typeof c.purchased180d === "number") {
    purchasers["180"] = c.purchased180d;
  }
  return {
    platform: c.platform ?? "unassigned",
    tracked: c.tracked ?? 0,
    purchasers,
    consumersByState: c.consumersByState,
  };
});

const platforms = raw.platforms ?? [
  { id: "webjoint", name: "WebJoint", industry: "Cannabis" },
  { id: "menu", name: "Menu.com", industry: "Cannabis" },
];

const snapshot = {
  generatedAt: new Date().toISOString(),
  demo: raw.demo === true,
  platforms,
  customers,
  consumers,
  revenue: raw.revenue ?? [],
  revenueDaily: raw.revenueDaily ?? [],
  gmv: raw.gmv ?? [],
  gmvDaily: raw.gmvDaily ?? [],
  cash: (raw.cash ?? []).filter(
    (c) => c && typeof c.amountCents === "number" && c.label,
  ),
  sources: [
    {
      id: "manual",
      label: "Manual file (data/network.json), baked at build time",
      state: "ok",
      detail:
        `Static build — these numbers were fixed when the site was built, not fetched live. ` +
        `${customers.length} customers, ${consumers.length} platform consumer rollups, ` +
        `${(raw.revenue ?? []).length} revenue months, ${(raw.revenueDaily ?? []).length} revenue days.`,
      provides: ["customers", "consumers", "revenue", "cash", "gmv"],
      fetchedAt: new Date().toISOString(),
      durationMs: 0,
    },
    {
      id: "stripe",
      label: "Stripe",
      state: "not_configured",
      detail:
        "Unavailable on a static host — Stripe has to be queried by a server. Deploy to a Node host (Vercel, Fly, a container) to connect it.",
      provides: [],
    },
    {
      id: "database",
      label: "Platform database",
      state: "not_configured",
      detail:
        "Unavailable on a static host — the database has to be queried by a server. Deploy to a Node host to connect it.",
      provides: [],
    },
    {
      id: "internal-api",
      label: "Internal admin API",
      state: "not_configured",
      detail:
        "Unavailable on a static host — the API has to be called by a server. Deploy to a Node host to connect it.",
      provides: [],
    },
  ],
};

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(snapshot));

console.log(
  `Baked snapshot: ${customers.length} customers, ${snapshot.revenue.length} revenue months, ` +
    `${snapshot.revenueDaily.length} revenue days -> src/generated/snapshot.json`,
);
