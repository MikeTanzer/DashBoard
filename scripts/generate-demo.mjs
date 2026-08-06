#!/usr/bin/env node
/**
 * Writes data/network.json with a plausible demo network, flagged "demo": true
 * so the dashboard shows its DEMO DATA banner.
 *
 *   node scripts/generate-demo.mjs
 *
 * Deterministic (seeded), so regenerating never churns the diff. Delete the
 * file — or replace it with real records and set "demo": false — to turn the
 * banner off.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// -- seeded PRNG (mulberry32) -------------------------------------------------
let seed = 0x9e3779b9;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// -- shape of the demo network ------------------------------------------------
// Weighted so CA dominates, which is what a cannabis-software network looks like.
const WEBJOINT_STATES = [
  ...Array(34).fill("CA"),
  ...Array(6).fill("MI"),
  ...Array(5).fill("CO"),
  ...Array(4).fill("OR"),
  ...Array(3).fill("WA"),
  ...Array(3).fill("NV"),
  ...Array(3).fill("AZ"),
  ...Array(2).fill("MA"),
  ...Array(2).fill("IL"),
  "NM", "OK", "NY", "NJ", "ME", "MT",
];

const MENU_STATES = [
  ...Array(9).fill("CA"),
  ...Array(4).fill("NY"),
  ...Array(3).fill("FL"),
  ...Array(3).fill("TX"),
  ...Array(3).fill("CO"),
  ...Array(2).fill("IL"),
  ...Array(2).fill("WA"),
  "MA", "GA", "NC", "PA", "OH", "MN", "AZ",
];

const NAME_A = [
  "Green", "Golden", "Coastal", "High", "Emerald", "Sunset", "Cedar", "Blue",
  "Iron", "Silver", "Pacific", "Valley", "Urban", "Wildflower", "Northern",
  "Canyon", "Harbor", "Summit", "Ridge", "Lantern", "Grove", "Mesa",
];
const NAME_B = [
  "Room", "Leaf", "Collective", "Market", "Provisions", "Dispensary", "Botanical",
  "Supply", "Co.", "Wellness", "Gardens", "Exchange", "Delivery", "Apothecary",
  "House", "Society", "Depot", "Farms",
];

function makeCustomers(platform, states, count, prefix, saasBand, usageBand) {
  const used = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    let name;
    do {
      name = `${pick(NAME_A)} ${pick(NAME_B)}`;
    } while (used.has(name));
    used.add(name);

    // A long tail of small accounts with a handful of large ones.
    const big = rand() < 0.12;
    const saas = between(...(big ? saasBand.big : saasBand.normal));
    const hasUsage = rand() < 0.72;
    const usage = hasUsage
      ? between(...(big ? usageBand.big : usageBand.normal))
      : 0;

    const monthsAgo = between(1, 40);
    const started = new Date(Date.UTC(2026, 7, 1));
    started.setUTCMonth(started.getUTCMonth() - monthsAgo);

    out.push({
      id: `${prefix}-${String(1000 + i)}`,
      name,
      platform,
      state: pick(states),
      status: "active",
      mrrSaasCents: saas * 100,
      mrrUsageCents: usage * 100,
      startedAt: started.toISOString().slice(0, 10),
    });
  }
  return out;
}

const customers = [
  ...makeCustomers(
    "webjoint",
    WEBJOINT_STATES,
    68,
    "wj",
    { normal: [249, 899], big: [1200, 3400] },
    { normal: [0, 640], big: [900, 4200] },
  ),
  ...makeCustomers(
    "menu",
    MENU_STATES,
    31,
    "mn",
    { normal: [149, 549], big: [900, 2100] },
    { normal: [0, 380], big: [600, 2600] },
  ),
];

// -- 12 months of revenue -----------------------------------------------------
// Anchored to the customer list: the most recent month equals current MRR, and
// earlier months walk backwards at ~3%/mo with a small wobble. Without the
// anchor the history chart wouldn't reconcile with the headline MRR figure.
const MONTHLY_GROWTH = 1.031;
const revenue = [];

for (const platform of ["webjoint", "menu"]) {
  const mine = customers.filter((c) => c.platform === platform);
  const saasNow = mine.reduce((a, c) => a + c.mrrSaasCents, 0);
  const usageNow = mine.reduce((a, c) => a + c.mrrUsageCents, 0);

  // i = 1 is the last COMPLETE month and is anchored exactly to current MRR.
  // i = 0 is the month in progress, billed pro-rata so far.
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 7, 1));
    d.setUTCMonth(d.getUTCMonth() - i);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

    const decay = Math.pow(MONTHLY_GROWTH, -(i - 1));
    // Subscriptions are steady; usage swings with the season.
    const saasWobble = i === 1 ? 1 : 0.98 + rand() * 0.04;
    const usageWobble = i === 1 ? 1 : 0.86 + rand() * 0.26;
    // Aug 6 of a 31-day month.
    const elapsed = i === 0 ? 6 / 31 : 1;

    revenue.push({
      month,
      platform,
      saasCents: Math.round(saasNow * decay * saasWobble * elapsed),
      usageCents: Math.round(usageNow * decay * usageWobble * elapsed),
    });
  }
}

const payload = {
  demo: true,
  _comment:
    "Generated by scripts/generate-demo.mjs. Replace with real data and set demo:false.",
  platforms: [
    { id: "webjoint", name: "WebJoint", industry: "Cannabis" },
    { id: "menu", name: "Menu.com", industry: "Cannabis" },
  ],
  customers,
  consumers: [
    {
      platform: "webjoint",
      tracked: 812_400,
      purchased30d: 94_800,
      purchased180d: 271_600,
    },
    {
      platform: "menu",
      tracked: 348_900,
      purchased30d: 31_200,
      purchased180d: 102_400,
    },
  ],
  revenue,
};

const out = path.join(process.cwd(), "data", "network.json");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(payload, null, 2) + "\n");

const states = new Set(customers.map((c) => c.state));
console.log(
  `Wrote ${out}\n  ${customers.length} customers across ${states.size} states\n  ${revenue.length} revenue rows`,
);
