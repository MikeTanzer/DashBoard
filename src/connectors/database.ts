import type { Connector } from "./types";
import type {
  ConnectorResult,
  ConsumerStats,
  CustomerRecord,
  DataDomain,
  GmvDayPoint,
  GmvPoint,
} from "@/lib/types";
import { normalizeState } from "@/lib/states";
import {
  CONSUMERS_BY_STATE_SQL,
  CONSUMERS_MONGO_COLLECTION,
  CONSUMERS_MONGO_PIPELINE,
  CONSUMERS_SQL,
  CUSTOMERS_SQL,
  GMV_DAILY_SQL,
  GMV_SQL,
} from "./queries";

/**
 * Read-only connector for the platform databases (webjoint / menu), primarily
 * for consumer metrics, which Stripe cannot know.
 *
 * The engine is deliberately not decided here. Set PYROTREE_DB_ENGINE to
 * "postgres" | "mysql" | "mongodb", install the matching driver, and edit the
 * SQL in queries.ts. The driver is imported dynamically, so the app builds and
 * runs with none of them installed.
 *
 *   postgres  →  npm i pg
 *   mysql     →  npm i mysql2
 *   mongodb   →  npm i mongodb
 */

type Engine = "postgres" | "mysql" | "mongodb";

interface Row {
  [column: string]: unknown;
}

function engine(): Engine | null {
  const e = (process.env.PYROTREE_DB_ENGINE ?? "").toLowerCase();
  if (e === "postgres" || e === "postgresql" || e === "pg") return "postgres";
  if (e === "mysql" || e === "mariadb") return "mysql";
  if (e === "mongodb" || e === "mongo") return "mongodb";
  return null;
}

function url(): string {
  return process.env.PYROTREE_DB_URL ?? "";
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/**
 * Import a driver that may not be installed.
 *
 * The indirection through `new Function` is deliberate: it keeps both
 * TypeScript and the bundler from trying to resolve these specifiers at build
 * time, so the app compiles and runs with none of the three drivers present.
 * Server-side only — never reached from the browser bundle.
 */
const importOptional = async (pkg: string): Promise<Record<string, unknown>> => {
  const dynamicImport = new Function("m", "return import(m)") as (
    m: string,
  ) => Promise<Record<string, unknown>>;
  try {
    return await dynamicImport(pkg);
  } catch {
    throw new Error(
      `The "${pkg}" driver isn't installed. Run: npm i ${pkg} — then restart.`,
    );
  }
};

/** Modules may put the export on the namespace or on `default` (CJS interop). */
function named<T>(mod: Record<string, unknown>, key: string): T {
  const direct = mod[key];
  if (direct) return direct as T;
  const viaDefault = (mod.default as Record<string, unknown> | undefined)?.[key];
  if (viaDefault) return viaDefault as T;
  throw new Error(`Driver does not export "${key}".`);
}

/** Run one read-only query and return plain rows, whatever the engine. */
async function query(sql: string): Promise<Row[]> {
  const e = engine();

  if (e === "postgres") {
    const pg = await importOptional("pg");
    const Client = named<new (config: object) => PgClient>(pg, "Client");
    const client = new Client({
      connectionString: url(),
      // Verify the server certificate by default. This used to pass
      // `rejectUnauthorized: false` unconditionally, which negotiates TLS and
      // then accepts any certificate presented — encrypting the connection
      // while leaving it open to an active man-in-the-middle, on a link
      // carrying customer and revenue data. Managed Postgres (RDS, Cloud SQL,
      // Neon, Supabase) all present certificates that verify normally.
      // A replica with a self-signed certificate needs the opt-out, and the
      // variable is named so that choice is visible in the environment.
      ssl:
        process.env.PYROTREE_DB_SSL === "0"
          ? undefined
          : { rejectUnauthorized: process.env.PYROTREE_DB_SSL_INSECURE !== "1" },
      statement_timeout: 20_000,
    });
    await client.connect();
    try {
      const res = await client.query(sql);
      return res.rows as Row[];
    } finally {
      await client.end();
    }
  }

  if (e === "mysql") {
    const mysql = await importOptional("mysql2/promise");
    const createConnection = named<(c: string) => Promise<MysqlConn>>(
      mysql,
      "createConnection",
    );
    const conn = await createConnection(url());
    try {
      const [rows] = await conn.query(sql);
      return rows as Row[];
    } finally {
      await conn.end();
    }
  }

  throw new Error(`Engine "${e}" does not run SQL.`);
}

interface PgClient {
  connect(): Promise<void>;
  query(sql: string): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

interface MysqlConn {
  query(sql: string): Promise<[unknown, unknown]>;
  end(): Promise<void>;
}

interface MongoClientLike {
  connect(): Promise<void>;
  db(): {
    collection(name: string): {
      aggregate(pipeline: object[]): { toArray(): Promise<Row[]> };
    };
  };
  close(): Promise<void>;
}

async function queryMongo(): Promise<Row[]> {
  if (!CONSUMERS_MONGO_PIPELINE) {
    throw new Error(
      "PYROTREE_MONGO_CONSUMERS is not set — it must be a JSON aggregation pipeline projecting platform, tracked, purchased_30d, purchased_180d.",
    );
  }
  const mod = await importOptional("mongodb");
  const MongoClient = named<new (uri: string) => MongoClientLike>(
    mod,
    "MongoClient",
  );
  const client = new MongoClient(url());
  await client.connect();
  try {
    return await client
      .db()
      .collection(CONSUMERS_MONGO_COLLECTION)
      .aggregate(CONSUMERS_MONGO_PIPELINE)
      .toArray();
  } finally {
    await client.close();
  }
}

export const databaseConnector: Connector = {
  id: "database",
  label: "Platform database",

  isConfigured: () => Boolean(engine() && url()),

  missing: () =>
    !engine()
      ? 'Set PYROTREE_DB_ENGINE to "postgres", "mysql" or "mongodb", plus PYROTREE_DB_URL (read replica). Then edit the SQL in src/connectors/queries.ts.'
      : "Set PYROTREE_DB_URL to a read-only connection string.",

  async fetch(): Promise<ConnectorResult> {
    const provides: DataDomain[] = [];
    const e = engine();

    const rows =
      e === "mongodb" ? await queryMongo() : await query(CONSUMERS_SQL);

    // Each window column is optional — absent ones stay out of the map so the
    // dashboard can distinguish "zero purchasers" from "not computed".
    const consumers: ConsumerStats[] = rows.map((r) => {
      const purchasers: Record<string, number> = {};
      for (const w of ["7", "30", "90", "180", "365"]) {
        const v = r[`purchased_${w}d`];
        if (v != null) purchasers[w] = num(v);
      }
      if (r.purchased_ever != null) purchasers.ever = num(r.purchased_ever);
      return {
        platform: str(r.platform) || "unassigned",
        tracked: num(r.tracked),
        purchasers,
      };
    });
    // Optional per-state breakdown, folded onto the matching platform rollup.
    // Attached only when the state query runs, so a platform either carries a
    // full state map or none at all — a half-populated map would let one state
    // look empty when it was simply never queried.
    if (CONSUMERS_BY_STATE_SQL && e !== "mongodb") {
      const byState = await query(CONSUMERS_BY_STATE_SQL);
      const perPlatform = new Map<
        string,
        { tracked: Record<string, number>; windows: Record<string, Record<string, number>> }
      >();

      for (const r of byState) {
        const platform = str(r.platform) || "unassigned";
        const code = normalizeState(str(r.state));
        if (!code) continue;

        let entry = perPlatform.get(platform);
        if (!entry) {
          entry = { tracked: {}, windows: {} };
          perPlatform.set(platform, entry);
        }
        entry.tracked[code] = num(r.tracked);

        const windows: Record<string, number> = {};
        for (const w of ["7", "30", "90", "180", "365"]) {
          const v = r[`purchased_${w}d`];
          if (v != null) windows[w] = num(v);
        }
        if (r.purchased_ever != null) windows.ever = num(r.purchased_ever);
        entry.windows[code] = windows;
      }

      for (const c of consumers) {
        const entry = perPlatform.get(c.platform);
        if (!entry) continue;
        c.consumersByState = entry.tracked;
        c.purchasersByState = entry.windows;
      }
    }

    if (consumers.length) provides.push("consumers");

    let customers: CustomerRecord[] | undefined;
    if (CUSTOMERS_SQL && e !== "mongodb") {
      const crows = await query(CUSTOMERS_SQL);
      customers = crows.map((r, i) => ({
        id: str(r.id) || `db-${i}`,
        name: str(r.name) || `Customer ${i + 1}`,
        platform: str(r.platform) || "unassigned",
        state: normalizeState(str(r.state)),
        status:
          (str(r.status) as CustomerRecord["status"]) === "churned"
            ? "churned"
            : (str(r.status) as CustomerRecord["status"]) === "trial"
              ? "trial"
              : "active",
        mrrSaasCents: num(r.mrr_saas_cents),
        mrrUsageCents: num(r.mrr_usage_cents),
        startedAt: r.started_at ? str(r.started_at).slice(0, 10) : undefined,
        source: "database",
      }));
      if (customers.length) provides.push("customers");
    }

    let gmv: GmvPoint[] | undefined;
    let gmvDaily: GmvDayPoint[] | undefined;
    if (GMV_SQL && e !== "mongodb") {
      gmv = (await query(GMV_SQL)).map((r) => ({
        month: str(r.month),
        platform: str(r.platform) || "unassigned",
        amountCents: num(r.amount_cents),
      }));
      if (gmv.length) provides.push("gmv");
    }
    if (GMV_DAILY_SQL && e !== "mongodb") {
      gmvDaily = (await query(GMV_DAILY_SQL)).map((r) => ({
        date: str(r.day),
        platform: str(r.platform) || "unassigned",
        amountCents: num(r.amount_cents),
      }));
      if (gmvDaily.length && !provides.includes("gmv")) provides.push("gmv");
    }

    return {
      consumers,
      customers,
      gmv,
      gmvDaily,
      status: {
        id: "database",
        label: `Platform database (${e})`,
        state: provides.length ? "ok" : "partial",
        detail: provides.length
          ? `${consumers.length} platform consumer rollups${customers ? `, ${customers.length} customers` : ""}.`
          : "Connected, but the query returned no rows — check the SQL in src/connectors/queries.ts.",
        provides,
      },
    };
  },
};
