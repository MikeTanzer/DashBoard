/**
 * The SQL the database connector runs. Edit these to match the real schema —
 * nothing else in the app needs to change, as long as the column names in the
 * `as` clauses stay exactly as written.
 *
 * Both queries run read-only. Point PYROTREE_DB_URL at a read replica.
 */

/**
 * Must return one row per platform with these exact column names:
 *
 *   platform (text)   — the platform slug
 *   tracked (int)     — distinct consumers we hold any record of
 *   purchased_7d / _30d / _90d / _180d / _365d (int)
 *   purchased_ever (int)
 *
 * "purchased_*" = distinct consumers with >= 1 completed order in that trailing
 * window. Every window column is optional: drop any you can't compute cheaply
 * and the dashboard reports that range as untracked rather than substituting a
 * neighbouring window. A purchaser count genuinely cannot be derived from
 * another window — 365-day purchasers are not implied by the 180-day figure in
 * either direction — so the extra COUNT(DISTINCT ...) per window is the only
 * way to have the time range move this number.
 *
 * These are all one pass over the same join, so the added windows cost far less
 * than five separate queries.
 */
export const CONSUMERS_SQL =
  process.env.PYROTREE_SQL_CONSUMERS ??
  `
  SELECT
    p.slug                                        AS platform,
    COUNT(DISTINCT c.id)                          AS tracked,
    COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '7 days'   THEN c.id END) AS purchased_7d,
    COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '30 days'  THEN c.id END) AS purchased_30d,
    COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '90 days'  THEN c.id END) AS purchased_90d,
    COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '180 days' THEN c.id END) AS purchased_180d,
    COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '365 days' THEN c.id END) AS purchased_365d,
    COUNT(DISTINCT o.consumer_id)                 AS purchased_ever
  FROM consumers c
  JOIN platforms p ON p.id = c.platform_id
  LEFT JOIN orders o
    ON o.consumer_id = c.id
   AND o.status = 'completed'
  GROUP BY p.slug
`;

/**
 * Optional. Only needed if customer records should come from the database
 * rather than Stripe. Must return these exact column names:
 *   id · name · platform · state · status · mrr_saas_cents · mrr_usage_cents · started_at
 *
 * Leave PYROTREE_SQL_CUSTOMERS unset and this is skipped entirely.
 */
export const CUSTOMERS_SQL = process.env.PYROTREE_SQL_CUSTOMERS ?? null;

/**
 * Optional. Consumer counts broken down by state, which is what lets the
 * recency panel be scoped to a single state on the map.
 *
 * Must return one row per platform AND state, with these exact column names:
 *   platform (text) · state (2-letter code) · tracked (int)
 *   purchased_7d / _30d / _90d / _180d / _365d / purchased_ever (int)
 *
 * Same semantics as CONSUMERS_SQL, just grouped by state as well. This cannot
 * be derived from the national rollup — that says how many people bought, not
 * where they are — so without this query a state selection reports what it
 * needs instead of showing national figures under a state's name.
 *
 * Leave PYROTREE_SQL_CONSUMERS_BY_STATE unset and per-state recency is skipped.
 */
export const CONSUMERS_BY_STATE_SQL =
  process.env.PYROTREE_SQL_CONSUMERS_BY_STATE ?? null;

/**
 * Optional. Gross merchandise value — what shoppers spent on our customers'
 * storefronts, which only the platform that processed the orders can know.
 *
 * Must return these exact column names:
 *   platform (text) · month ("YYYY-MM") · amount_cents (bigint)
 *
 * Add a second query keyed by `day` ("YYYY-MM-DD") via PYROTREE_SQL_GMV_DAILY
 * if you want the 1W / 1M ranges to show GMV too; without it those ranges
 * report GMV as untracked rather than resampling months.
 *
 * Leave PYROTREE_SQL_GMV unset and GMV is skipped entirely.
 */
export const GMV_SQL = process.env.PYROTREE_SQL_GMV ?? null;

/** Same, per day. Must return: platform · day ("YYYY-MM-DD") · amount_cents. */
export const GMV_DAILY_SQL = process.env.PYROTREE_SQL_GMV_DAILY ?? null;

/**
 * MongoDB equivalent of CONSUMERS_SQL, as an aggregation pipeline. Only used
 * when PYROTREE_DB_ENGINE=mongodb. Must project the same four field names.
 */
export const CONSUMERS_MONGO_PIPELINE = readMongoPipeline();

/**
 * Parsed defensively rather than with a bare `JSON.parse` at module scope.
 * This module is imported by the connector registry, so a typo in the env var
 * used to throw during import and take down the entire dashboard — including
 * the Stripe and internal-API connectors that never touch Mongo — with a raw
 * SyntaxError. A bad pipeline should disable the Mongo path and say why,
 * nothing more.
 */
function readMongoPipeline(): object[] | null {
  const raw = process.env.PYROTREE_MONGO_CONSUMERS;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        "PYROTREE_MONGO_CONSUMERS must be a JSON array (an aggregation pipeline) — ignoring it.",
      );
      return null;
    }
    return parsed as object[];
  } catch {
    console.warn(
      "PYROTREE_MONGO_CONSUMERS is not valid JSON — ignoring it. The database connector will report Mongo consumers as unavailable.",
    );
    return null;
  }
}

/** Collection the Mongo pipeline runs against. */
export const CONSUMERS_MONGO_COLLECTION =
  process.env.PYROTREE_MONGO_COLLECTION ?? "consumers";

/**
 * Optional. Monthly spend, for the expense, burn, runway and margin tiles.
 *
 * Must return these exact column names:
 *   month ("YYYY-MM") · category (text) · amount_cents (bigint)
 *   platform (text, NULLABLE) · cost_of_revenue (boolean, optional)
 *
 * Leave `platform` NULL for anything shared — payroll, legal, G&A. That is not
 * a gap to be filled in: the dashboard treats untagged spend as company-wide
 * and excludes it when you filter to one platform, saying so on every affected
 * tile. Allocating it by some rule would bake an assumption into the margins.
 *
 * Set `cost_of_revenue` on hosting, payment fees and support. Without it every
 * cost is operating expense and gross margin reports itself unavailable rather
 * than quietly restating net margin.
 *
 * Most teams' spend lives in accounting software rather than the product
 * database — a view over a QuickBooks/Xero/Ramp export is the usual shape here.
 */
export const EXPENSES_SQL = process.env.PYROTREE_SQL_EXPENSES ?? null;

/**
 * Optional. Headcount over time, for revenue per employee.
 *
 * Must return: month ("YYYY-MM") · employees (int) · platform (text, NULLABLE).
 * A count only — this dashboard has no business holding anything that
 * identifies a person.
 */
export const HEADCOUNT_SQL = process.env.PYROTREE_SQL_HEADCOUNT ?? null;
