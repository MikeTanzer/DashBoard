/**
 * The SQL the database connector runs. Edit these to match the real schema —
 * nothing else in the app needs to change, as long as the column names in the
 * `as` clauses stay exactly as written.
 *
 * Both queries run read-only. Point PYROTREE_DB_URL at a read replica.
 */

/**
 * Must return one row per platform with these exact column names:
 *   platform (text) · tracked (int) · purchased_30d (int) · purchased_180d (int)
 *
 * "tracked" = distinct consumers we hold any record of.
 * "purchased_*d" = distinct consumers with >= 1 completed order in the window.
 */
export const CONSUMERS_SQL =
  process.env.PYROTREE_SQL_CONSUMERS ??
  `
  SELECT
    p.slug                                        AS platform,
    COUNT(DISTINCT c.id)                          AS tracked,
    COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '30 days'  THEN c.id END) AS purchased_30d,
    COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '180 days' THEN c.id END) AS purchased_180d
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
