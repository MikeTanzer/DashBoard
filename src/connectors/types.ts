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
        detail: err instanceof Error ? err.message : String(err),
        provides: [],
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      },
    };
  }
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
