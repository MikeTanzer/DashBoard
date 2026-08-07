# Pyrotree Network Dashboard

Investor- and admin-facing metrics across the Pyrotree platform network —
today WebJoint and Menu.com, tomorrow whatever else gets added.

The design goal is **launchable in days, expandable for years**: every number
comes from a pluggable connector, and any metric without a source renders as
**"Not yet tracked"** with the exact next step to light it up. Nothing is ever
silently zero.

---

## Run it locally

```bash
npm install
npm run demo          # writes data/network.json with a seeded demo network
npm run dev
```

Then open http://localhost:3000. There's no login — see **Access** below.

Nothing in `.env.local` is required to run it; every connector is optional and
an unconfigured one just reports what it needs.

---

## What it shows

**Customers**
- Current customers
- States with customers, plus a US map / ranked bars / table of the breakdown
- Average gross revenue per customer
- Average SaaS revenue per paying customer
- Average usage revenue per paying customer

**Revenue**
- Monthly recurring revenue (the hero figure) and annual run rate
- Collected revenue, stacked SaaS vs Usage, over **1W / 1M / 3M / 6M / 12M / All**
  (3M by default)
- Period-over-period change, computed on complete periods only

The two short ranges are **day-grained** and read a separate daily series.
A week has no meaning in monthly buckets, and resampling months into days would
invent a shape the data never had — so if no source supplies day-level figures,
those ranges say what's needed instead of guessing. Stripe supplies them
automatically (invoices carry timestamps); the admin API can send a
`revenueDaily` array; a hand-maintained file usually can't and doesn't have to.

**Consumers** (shoppers on our customers' storefronts — aggregate counts only)
- Consumers tracked
- Purchased in the last 30 days
- Purchased in the last 180 days
- 30-day activation rate

Everything is scoped by the platform filter at the top, and the URL carries the
selection so a filtered view is shareable.

---

## Access

**There is no login. Anyone who can reach the URL sees everything** — customer
counts, revenue, the per-platform breakdown and the Data sources panel.

If this is ever deployed somewhere reachable, put the gate at the edge rather
than in the app: Vercel's built-in password protection, Cloudflare Access, or
keeping it on a private network. That's a config toggle, not a code change, and
it's a better place for it than a shared password in an env var.

Two things are deliberately hardened for the no-login case, because the app can
no longer assume its reader is trusted:

- **`GET /api/snapshot` is off by default.** It returns every customer by name
  with their revenue, which is a different proposition from an unauthenticated
  dashboard. Set `PYROTREE_SNAPSHOT_API` to a long random secret (callers then
  send `?key=…` or `Authorization: Bearer …`), or to `open` to allow anyone
  with the URL. Unset, it 404s.
- **Connector errors are redacted before display.** `pg` and `mysql2` quote the
  whole connection string back on failure, password included, and a failed
  Stripe call can echo the key. Those are masked on the way to the screen.

---

## Connecting real data

Connectors run in parallel on every snapshot and merge into one model. Later
sources in the registry win on conflict, so automated feeds override the manual
file. Failures are isolated — a broken connector degrades its own metrics to
"Not yet tracked" and never takes the page down.

Registry order (lowest precedence first) is in `src/connectors/index.ts`.

### 1. Manual file — works out of the box

`data/network.json`. Every top-level key is optional, so use it for whatever no
API can reach yet. Shape is documented in `data/network.example.json`.

> This file is **gitignored** — it holds customer names and revenue. Keep it out
> of the repo.

### 2. Stripe → customers, MRR, monthly revenue

```
STRIPE_SECRET_KEY=rk_live_...          # restricted key, read-only
STRIPE_DEFAULT_PLATFORM=webjoint
```

A restricted key needs read access to **Customers**, **Subscriptions** and
**Invoices**. Two 10-minute jobs in the Stripe dashboard make the numbers exact:

- **Split SaaS vs usage** — set price metadata `pyrotree_revenue_type` to
  `saas` or `usage`. Without it, metered prices are treated as usage and
  everything else as SaaS.
- **Attribute the platform** — set customer metadata `platform` to `webjoint`
  or `menu`. Without it, everything falls to `STRIPE_DEFAULT_PLATFORM`.

State comes from the customer's address. Customers with no state are counted in
the totals and reported as missing under the map rather than silently dropped.

### 3. Platform database → consumer metrics

Stripe cannot know how many shoppers bought something last month. That comes
from the platform databases, read-only:

```
PYROTREE_DB_ENGINE=postgres            # or mysql | mongodb
PYROTREE_DB_URL=postgres://readonly@replica/...
```

Then `npm i pg` (or `mysql2` / `mongodb`) and edit the query in
`src/connectors/queries.ts` to match the real schema. The query must return one
row per platform with the columns `platform`, `tracked`, `purchased_30d`,
`purchased_180d`. **Point it at a read replica.**

### 4. Internal admin / billing API → anything

```
PYROTREE_API_URL=https://admin.internal/pyrotree/metrics
PYROTREE_API_TOKEN=...
```

Return the JSON documented at the top of `src/connectors/internalApi.ts`. Every
key is optional — send only what that service knows.

### Adding a fifth source

Implement the `Connector` interface in `src/connectors/types.ts`, add it to the
registry array, done. No UI changes, no metric changes.

---

## Adding a platform (or a whole new industry)

Platform ids are free-form strings. A connector emitting records with a new
`platform` value makes it appear in the filter bar and the platform table
automatically. Give it a display name and industry either from the connector's
`platforms` array or in `DEFAULT_PLATFORMS` in `src/connectors/index.ts`.

---

## Deploying

Any Node host works; Vercel is the shortest path.

1. Push, import the repo, and set the env vars from `.env.example`.
2. **Turn on access protection at the host.** The app has no login, so a plain
   deployment is public to anyone with the URL.
3. `data/network.json` is gitignored, so a deployment has no manual data unless
   you add it. That's intended: connect Stripe and let the automated sources
   carry it.

Snapshots are cached in-process for `PYROTREE_CACHE_SECONDS` (default 300).
Force a refresh with `GET /api/snapshot?force=1` (needs `PYROTREE_SNAPSHOT_API`).

---

## Project layout

```
src/
  app/
    page.tsx              dashboard
    api/snapshot          raw JSON, off unless PYROTREE_SNAPSHOT_API is set
  connectors/             one file per data source + the registry
    queries.ts            the SQL to edit for your schema
  lib/
    metrics.ts            every derived number, and its "not tracked" reason
    types.ts              the normalized data model
    states.ts             USPS codes and name normalisation
    us-map.ts             GENERATED state geometry (npm run map)
  components/             stat tiles, charts, filters
scripts/generate-demo.mjs seeded demo data (monthly + daily)
scripts/gen-us-map.mjs    regenerates us-map.ts from us-atlas
```

## Charts

Hand-rolled SVG — no charting dependency. Colors come from a colorblind-safe
palette validated in both light and dark mode. The state map is a choropleth on
real geometry (Albers USA, so Alaska and Hawaii inset), and uses quantile bins
(customer counts are heavily skewed by the home state, and equal-width bins
would flatten every other state into one shade). Every chart has a table view,
so no value is reachable only by hovering.
