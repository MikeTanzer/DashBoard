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

// Anchored to the real UTC date, not a hardcoded one — otherwise the demo
// silently goes stale by a day every day, and "today" stops lining up with the
// dashboard's own idea of today (which is what marks a period in progress).
const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);
const MONTH_START = new Date(
  Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1),
);
const CURRENT_MONTH = monthKeyOf(TODAY);
const DAYS_IN_MONTH = new Date(
  Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() + 1, 0),
).getUTCDate();

function monthKeyOf(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

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
    const started = new Date(MONTH_START);
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
    const d = new Date(MONTH_START);
    d.setUTCMonth(d.getUTCMonth() - i);
    const month = monthKeyOf(d);

    const decay = Math.pow(MONTHLY_GROWTH, -(i - 1));
    // Subscriptions are steady; usage swings with the season.
    const saasWobble = i === 1 ? 1 : 0.98 + rand() * 0.04;
    const usageWobble = i === 1 ? 1 : 0.86 + rand() * 0.26;
    // The current month is only billed as far as today.
    const elapsed = i === 0 ? TODAY.getUTCDate() / DAYS_IN_MONTH : 1;

    revenue.push({
      month,
      platform,
      saasCents: Math.round(saasNow * decay * saasWobble * elapsed),
      usageCents: Math.round(usageNow * decay * usageWobble * elapsed),
    });
  }
}

// -- 120 days of daily revenue ------------------------------------------------
// The short ranges (1W, 1M) read this series rather than resampling months.
// Each day is that month's total spread across its days, with a weekday shape
// (weekends lighter) and a little noise — so the daily and monthly views
// reconcile instead of telling two different stories.
const DAYS_OF_DAILY = 120;
const revenueDaily = [];

for (const platform of ["webjoint", "menu"]) {
  const byMonth = new Map(
    revenue
      .filter((r) => r.platform === platform)
      .map((r) => [r.month, r]),
  );

  // Group the window's days by month, with a raw weight each.
  const perMonth = new Map();
  for (let back = DAYS_OF_DAILY - 1; back >= 0; back--) {
    const d = new Date(TODAY);
    d.setUTCDate(d.getUTCDate() - back);
    const month = monthKeyOf(d);
    if (!byMonth.has(month)) continue;

    // Sat/Sun run lighter. These are raw weights, normalised below — scaling
    // them by hand never sums to the month, because the weekday/weekend mix
    // differs month to month.
    const dow = d.getUTCDay();
    const weight = (dow === 0 || dow === 6 ? 0.55 : 1.18) * (0.88 + rand() * 0.24);

    if (!perMonth.has(month)) perMonth.set(month, []);
    perMonth.get(month).push({ date: d.toISOString().slice(0, 10), weight });
  }

  // Allocate each month's total across its days by normalised weight, giving
  // the remainder to the last day so the daily series sums EXACTLY to the
  // monthly one — the two views have to agree.
  for (const [month, entries] of perMonth) {
    // The window starts mid-month, so its first month is only partly covered.
    // Allocating a whole month's total across those few days would inflate them
    // badly — drop it. The current month is legitimately partial in BOTH
    // series, so it stays.
    const coversFromDayOne = entries[0].date.endsWith("-01");
    const isCurrentMonth = month === CURRENT_MONTH;
    if (!coversFromDayOne && !isCurrentMonth) continue;

    const row = byMonth.get(month);
    const total = entries.reduce((a, e) => a + e.weight, 0);

    // A partial month only has its elapsed days here, so its total is already
    // pro-rata and the whole of it belongs to those days.
    let saasLeft = row.saasCents;
    let usageLeft = row.usageCents;

    entries.forEach((e, i) => {
      const last = i === entries.length - 1;
      const share = e.weight / total;
      const saas = last ? saasLeft : Math.round(row.saasCents * share);
      const usage = last ? usageLeft : Math.round(row.usageCents * share);
      saasLeft -= saas;
      usageLeft -= usage;
      revenueDaily.push({
        date: e.date,
        platform,
        saasCents: saas,
        usageCents: usage,
      });
    });
  }
}

revenueDaily.sort((a, b) => a.date.localeCompare(b.date));

// -- consumer rollups ---------------------------------------------------------
/**
 * Distinct purchasers per trailing window.
 *
 * Each longer window must contain the shorter ones — a consumer who bought in
 * the last 7 days also bought in the last 30 — so these are built as a
 * monotonically rising series, never drawn independently. `ever` is the ceiling.
 * Growth flattens as the window widens, which is what repeat-purchase behaviour
 * actually looks like: the 365-day figure is nowhere near 12x the 30-day one.
 */
function makeConsumerRollup(platform, tracked, rate30, stateWeights) {
  const p30 = Math.round(tracked * rate30);
  const purchasers = {
    7: Math.round(p30 * 0.34),
    30: p30,
    90: Math.round(p30 * 1.94),
    180: Math.round(p30 * 2.86),
    365: Math.round(p30 * 3.71),
  };
  purchasers.ever = Math.round(purchasers[365] * 1.28);

  // Cheap invariant checks — a rollup that isn't monotonic, or that claims more
  // purchasers than tracked consumers, is a bug worth failing the build over.
  const order = [7, 30, 90, 180, 365];
  for (let i = 1; i < order.length; i++) {
    if (purchasers[order[i]] < purchasers[order[i - 1]]) {
      throw new Error(`${platform}: purchasers not monotonic at ${order[i]}d`);
    }
  }
  if (purchasers.ever < purchasers[365]) {
    throw new Error(`${platform}: "ever" below the 365-day figure`);
  }
  if (purchasers.ever > tracked) {
    throw new Error(`${platform}: more purchasers (${purchasers.ever}) than tracked (${tracked})`);
  }

  // Split tracked consumers across the states this platform actually sells in,
  // weighted the same way its customers are — consumers live where the
  // storefronts are. The remainder goes to the largest state so the parts sum
  // exactly to `tracked`.
  const weights = new Map();
  for (const code of stateWeights) {
    weights.set(code, (weights.get(code) ?? 0) + 1);
  }
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  const entries = [...weights.entries()].sort((a, b) => b[1] - a[1]);

  const consumersByState = {};
  let left = tracked;
  entries.forEach(([code, w], i) => {
    const share = i === entries.length - 1 ? left : Math.round(tracked * (w / totalWeight));
    consumersByState[code] = share;
    left -= share;
  });

  const sum = Object.values(consumersByState).reduce((a, b) => a + b, 0);
  if (sum !== tracked) {
    throw new Error(`${platform}: consumersByState sums to ${sum}, expected ${tracked}`);
  }

  return { platform, tracked, purchasers, consumersByState };
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
    makeConsumerRollup("webjoint", 812_400, 0.117, WEBJOINT_STATES),
    makeConsumerRollup("menu", 348_900, 0.089, MENU_STATES),
  ],
  revenue,
  revenueDaily,
  // Cash is a balance reported by a bank or Stripe, never derived from the
  // revenue above — these are two independent figures and are meant to be.
  cash: [
    {
      label: "Operating account",
      amountCents: 1_842_000_00,
      asOf: TODAY.toISOString().slice(0, 10),
    },
    {
      label: "Stripe balance (available + pending)",
      amountCents: 214_500_00,
      asOf: TODAY.toISOString().slice(0, 10),
    },
  ],
};

const out = path.join(process.cwd(), "data", "network.json");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(payload, null, 2) + "\n");

const states = new Set(customers.map((c) => c.state));
console.log(
  `Wrote ${out}\n  ${customers.length} customers across ${states.size} states\n  ${revenue.length} monthly revenue rows\n  ${revenueDaily.length} daily revenue rows`,
);
