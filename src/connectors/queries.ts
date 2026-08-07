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
 * MongoDB equivalent of CONSUMERS_SQL, as an aggregation pipeline. Only used
 * when PYROTREE_DB_ENGINE=mongodb. Must project the same four field names.
 */
export const CONSUMERS_MONGO_PIPELINE = process.env
  .PYROTREE_MONGO_CONSUMERS
  ? (JSON.parse(process.env.PYROTREE_MONGO_CONSUMERS) as object[])
  : null;

/** Collection the Mongo pipeline runs against. */
export const CONSUMERS_MONGO_COLLECTION =
  process.env.PYROTREE_MONGO_COLLECTION ?? "consumers";
