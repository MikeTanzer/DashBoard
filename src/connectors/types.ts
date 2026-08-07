import type { ConnectorResult, SourceId } from "@/lib/types";

export interface Connector {
  id: SourceId;
  label: string;
  /** Cheap env check — false means "not configured", not "broken". */
  isConfigured(): boolean;
  /** Why it isn't configured, shown in the Sources panel. */
  missing(): string;
  fetch(): Promise<ConnectorResult>;
}

/** Wrap a connector run so one bad source can never take down the dashboard. */
export async function runConnector(c: Connector): Promise<ConnectorResult> {
  const started = Date.now();

  if (!c.isConfigured()) {
    return {
      status: {
        id: c.id,
        label: c.label,
        state: "not_configured",
        detail: c.missing(),
        provides: [],
      },
    };
  }

  try {
    const result = await c.fetch();
    return {
      ...result,
      status: {
        ...result.status,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      },
    };
  } catch (err) {
    return {
      status: {
        id: c.id,
        label: c.label,
        state: "error",
        detail: redactSecrets(
          err instanceof Error ? err.message : String(err),
        ),
        provides: [],
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      },
    };
  }
}

/**
 * Strip credentials out of a connector error before it reaches the screen.
 *
 * The Sources panel is visible to anyone who can open the dashboard, and there
 * is no login. Driver errors are the leak: `pg` and `mysql2` happily quote the
 * whole connection string back at you, password included, and a failed Stripe
 * call can echo the key. Both the configured values and anything shaped like a
 * credential get masked.
 */
export function redactSecrets(message: string): string {
  let out = message;

  // Exact configured values first — the precise case.
  const configured = [
    process.env.PYROTREE_DB_URL,
    process.env.STRIPE_SECRET_KEY,
    process.env.PYROTREE_API_TOKEN,
    process.env.PYROTREE_API_URL,
    process.env.PYROTREE_SNAPSHOT_API,
  ].filter((v): v is string => Boolean(v && v.length > 6));

  for (const value of configured) {
    out = out.split(value).join("[redacted]");
  }

  // Then anything that merely looks like one, for values we don't hold.
  out = out
    // user:pass@host in any URI
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[redacted]@")
    // Stripe-style keys
    .replace(/\b[sr]k_(live|test)_[A-Za-z0-9]+/g, "[redacted]")
    // bearer tokens
    .replace(/\b(bearer\s+)\S+/gi, "$1[redacted]")
    // password=... / token=... / key=... in a query string or DSN
    .replace(/\b(password|passwd|pwd|token|api[_-]?key|secret)=([^&\s;]+)/gi, "$1=[redacted]");

  return out;
}

/** Normalize any interval to a monthly amount in cents. */
export function toMonthlyCents(
  amountCents: number,
  interval: "day" | "week" | "month" | "year",
  intervalCount = 1,
): number {
  const perMonth = { day: 30, week: 4.345, month: 1, year: 1 / 12 }[interval];
  const divisor = interval === "year" ? intervalCount : intervalCount;
  return Math.round((amountCents * perMonth) / divisor);
}

/** "YYYY-MM-DD" in UTC. */
export function dayKey(d: Date): string {
  return `${monthKey(d)}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
