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

**GMV**
- Gross merchandise value over the selected window, and our take rate on it

Shopper spend on our customers' storefronts — an order of magnitude above our
own revenue, and deliberately labelled with the window so the two are never
confused. It can't be derived from our revenue without assuming a take rate, so
it comes from the platform that processed the orders: `PYROTREE_SQL_GMV` on the
database connector, or `gmv` / `gmvDaily` from the admin API or manual file.

**Cash**
- Cash on hand, summed across reported accounts, with an as-of date

A balance, not a flow: it can't be derived from revenue or MRR and it doesn't
move with the time range. Stripe supplies its own balance once connected — that
covers money held at Stripe, not your operating account, which has to come from
`cash` in `data/network.json` or from the admin API.

**Consumers** (shoppers on our customers' storefronts — aggregate counts only)
- Consumers tracked
- Purchasers in the selected window — 7 / 30 / 90 / 180 / 365 days, or ever
- Engagement funnel and activation rate

Purchaser counts are **not derivable from one another** — 365-day purchasers
aren't implied by the 180-day figure in either direction — so each window has to
be computed by the source. The consumer query computes all of them in one pass;
omit any column you can't afford and that range reports itself as untracked
instead of showing a neighbouring period's number.

Everything is scoped by the platform filter at the top, and the URL carries the
selection so a filtered view is shareable.

---

## Deploying to GitHub Pages

`npm run deploy:pages` builds the static site and pushes it to the `gh-pages`
branch, which Pages serves.

Auto-deploy on every push is available too, but the workflow file has to be
added by someone whose token carries the `workflow` scope — an OAuth app can't
create `.github/workflows/` on your behalf. The file is ready at
`docs/pages-workflow.yml`; move it to `.github/workflows/pages.yml`, push, and
switch the Pages source to "GitHub Actions".

## What a static host means

The live site is a **static export**: `npm run build` bakes a snapshot into the
bundle and every filter runs in the browser. Pages serves files and runs no
server, which has one real consequence:

> **Stripe, the platform database and the admin API cannot run.** They need a
> server to call them per request. On Pages the numbers are whatever was in
> `data/network.json` when the site was last built — demo data by default.

Everything else works exactly as before: platform and time filters, custom date
ranges, daily/monthly/quarterly/annual buckets, the map, and the charts. The
connector code is untouched and still runs on any Node host.

**To connect live data**, deploy the same repo to a Node host (Vercel, Fly, a
container) and drop `output: "export"` from `next.config.ts`. Nothing else has
to change.

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
row per platform with the columns `platform`, `tracked`, and a `purchased_*`
column per window you want selectable (`purchased_7d`, `_30d`, `_90d`, `_180d`,
`_365d`, `purchased_ever`). Every window column is optional.
**Point it at a read replica.**

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
    page.tsx              static entry; bakes in the snapshot
  connectors/             one file per data source + the registry
    queries.ts            the SQL to edit for your schema
  lib/
    metrics.ts            every derived number, and its "not tracked" reason
    types.ts              the normalized data model
    states.ts             USPS codes and name normalisation
    us-map.ts             GENERATED state geometry (npm run map)
  components/             Dashboard (client) + stat tiles, charts, filters
scripts/generate-demo.mjs seeded demo data (monthly + daily)
scripts/gen-us-map.mjs    regenerates us-map.ts from us-atlas
scripts/ensure-demo.mjs   seeds demo data when data/network.json is absent
scripts/build-snapshot.mjs bakes the snapshot for the static build
```

## Charts

Hand-rolled SVG — no charting dependency. Colors come from a colorblind-safe
palette validated in both light and dark mode. The state map is a choropleth on
real geometry (Albers USA, so Alaska and Hawaii inset), and uses quantile bins
(customer counts are heavily skewed by the home state, and equal-width bins
would flatten every other state into one shade). Every chart has a table view,
so no value is reachable only by hovering.
