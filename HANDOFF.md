# Handoff — connecting this dashboard to real Pyrotree data

Written for the engineer taking this over. It assumes you have the repo and
about an hour. The README covers what the dashboard shows; this covers how to
feed it and put it on your infrastructure.

---

## The shape of the thing, in one minute

```
your API / Stripe / platform DB
        │
        ▼
src/connectors/*        each source → one normalized Snapshot fragment
        │                (registry merges them; later sources win on conflict)
        ▼
Snapshot                one plain JSON object — the only data boundary
        │
        ▼
computeMetrics()        src/lib/metrics.ts — every number on screen, pure
        │
        ▼
<Dashboard/>            client components; filters live in the URL
```

Two properties matter for the handoff:

1. **Every metric is a `Metric<T>`** — either `{available, value}` or
   `{available: false, needs: "..."}`. A figure the data can't support renders
   as **"Not yet tracked"** with the exact next step, never a silent zero.
   You can ship a partial feed on day one and the dashboard will tell you,
   on-screen, what each missing tile needs.

2. **The deployed demo is a static export.** `npm run build` bakes
   `data/network.json` into the bundle and no code runs at request time. The
   live connectors exist but are *dormant* in this mode — going live on your
   infrastructure means flipping to server mode (below), not just setting
   env vars.

---

## Fastest path to real data (recommended)

Implement **one JSON endpoint**, point the dashboard at it, deploy on a Node
host. No dashboard code changes beyond the two-file server-mode flip.

### Step 1 — the endpoint

`GET $PYROTREE_API_URL` returning `application/json`, optionally checking
`Authorization: Bearer $PYROTREE_API_TOKEN`. The full annotated contract lives
at the top of `src/connectors/internalApi.ts`; the complete key list:

| Key | What it feeds | Notes |
|---|---|---|
| `platforms` | platform names/filter | new platforms appear everywhere automatically |
| `customers` | customer count, states map, MRR, ARPC, tenure | `startedAt` required for any over-time series; **add `churnedAt` before real churn exists** (see gotchas) |
| `consumers` | audience tiles, recency panel | `purchasers` keyed by trailing window `"7".."365","ever"`; `consumersByState` + `purchasersByState` unlock the per-state map scoping |
| `revenue` | headline, chart, margin inputs | monthly, per platform; optional `byState` (with `saasCents`/`usageCents` halves) unlocks state-scoped revenue |
| `revenueDaily` | 1W / 1M ranges | only if you hold real day-level figures — months are never split into days |
| `gmv` / `gmvDaily` | GMV tiles/chart, map tooltip | monthly `byState` unlocks per-state GMV |
| `cash` | cash on hand, runway | balances per account, with `asOf` |
| `expenses` | burn, profit, margin, breakdown | monthly rows: `month, category, amountCents`, optional `platform` (only when genuinely attributable — leave shared overhead untagged), optional `costOfRevenue` (required for gross margin) |
| `expensesDaily` | 1W / 1M expense-derived tiles | same rule as revenueDaily |
| `consumersMonthly` | audience over time | per-month rollups; `byState` / `purchasersByState` unlock the regional charts |
| `cashMonthly` | cash & runway over time | one total per month |
| `headcount` | revenue per employee | a count per month — never a list of people |

Conventions throughout: money in **integer cents**; months `"YYYY-MM"`; dates
`"YYYY-MM-DD"`; states as USPS two-letter codes. Every top-level key is
optional. Send the in-progress month's actuals-to-date as a normal row — the
dashboard marks the current period partial by date on its own.

### Step 2 — flip to server mode

Two files. First, `next.config.ts` — gate the static export on an env so
`deploy:pages` still works for the demo:

```ts
const nextConfig: NextConfig = {
  ...(process.env.STATIC_EXPORT ? { output: "export" as const } : {}),
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};
```

(and change `deploy:pages` in `package.json` to
`STATIC_EXPORT=1 BASE_PATH=/DashBoard node scripts/deploy-pages.mjs`.)

Second, `src/app/page.tsx` — await the registry instead of importing the baked
file:

```tsx
import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { getSnapshot } from "@/connectors";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await getSnapshot();
  return (
    <Suspense fallback={null}>
      <Dashboard snapshot={snapshot} />
    </Suspense>
  );
}
```

`getSnapshot()` runs every configured connector, merges the results (later
sources overwrite earlier ones per record) and caches in-process for
`PYROTREE_CACHE_SECONDS` (default 300) — your API is hit at most once per
five minutes per instance, not per pageview.

### Step 3 — env and deploy

```
PYROTREE_API_URL=https://internal.pyrotree.com/metrics/dashboard
PYROTREE_API_TOKEN=<secret>
PYROTREE_MANUAL_DISABLED=1        # turn the demo file off
```

Any Node host works: Vercel, Fly, a container behind your existing proxy.
`npm run build && npm run start`.

### Step 4 — auth, before real numbers

**There is no login in this app.** It shows revenue, customer names and cash.
Put it behind whatever you already have at the edge — SSO proxy, Cloudflare
Access, VPN — *before* pointing real data at it. Full env reference:
`.env.example`.

---

## Alternate feeds (composable with the API)

- **Stripe** — `STRIPE_SECRET_KEY` (restricted, read-only: Customers,
  Subscriptions, Invoices) supplies customers, MRR and monthly/daily revenue
  with zero endpoint work. See `src/connectors/stripe.ts`.
- **Platform database** — read-replica SQL for the consumer rollups and
  anything else; every query is in `src/connectors/queries.ts` with its exact
  expected columns. `PYROTREE_DB_*` env vars.
- **Manual file** — `data/network.json` in the same Snapshot shape, for
  spot-checking layout with hand-written numbers.

Sources merge; run Stripe for money and the API for consumers, or any other
split. Precedence on conflict: manual → internal API → database → Stripe
(later wins).

---

## Gotchas your data team should read before writing the feed

- **Purchaser windows are not derivable from each other.** 365-day purchasers
  can't be computed from the 180-day figure in either direction. Compute each
  window you want shown; omitted windows report as untracked rather than
  borrowing a neighbour.
- **National totals can't be split by state after the fact.** The map's
  state-scoping works only for data that arrives with a per-state breakdown
  (`byState`, `purchasersByState`). Expenses/headcount/cash carry no state, so
  state-scoped burn/runway/margin deliberately show "Not yet tracked" instead
  of an allocated guess.
- **`costOfRevenue: true`** on hosting/payment-fees/support expense lines is
  what powers gross margin. Without any flags, margin reports itself
  unavailable rather than silently restating net.
- **Leave shared overhead's `platform` unset.** The dashboard excludes it
  under a platform filter *and says so*; forcing an allocation would bake an
  assumption into per-platform P&L.
- **Add `churnedAt` to customers before real churn happens.** Reconstructing
  customers-over-time requires placing every customer in time; a churned
  customer without a date would be missing from months they were paying, so
  those series (correctly) go dark the moment one exists. Also the gate for
  NRR/LTV later.
- **History can't be backfilled.** `consumersMonthly`, `cashMonthly` and
  `headcount` are point-in-time recordings. Start a monthly job writing them
  on day one, even if the rest of the feed comes later.
- **The current month is partial.** Send actuals-to-date; the dashboard
  handles the partial marking and keeps in-progress periods out of
  period-over-period comparisons on its own. Pro-rate any fixed monthly costs
  you book up front, or the current month's burn will read catastrophically
  high against a few days of revenue.

---

## Useful scripts

| command | does |
|---|---|
| `npm run dev` | dev server (connectors live if env is set) |
| `npm run demo` | regenerate `data/network.json` (seeded, deterministic) |
| `npm run snapshot` | bake `src/generated/snapshot.json` for static builds |
| `npm run build` | ensure demo → bake snapshot → build |
| `npm run deploy:pages` | static demo build → `gh-pages` branch |
| `npm run typecheck` / `lint` | what they say |
| `npm run map` | regenerate the US map geometry |
