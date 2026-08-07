import type { SourceStatus } from "@/lib/types";
import { utcTime } from "@/lib/format";

const STATE_STYLE: Record<
  SourceStatus["state"],
  { color: string; label: string; icon: string }
> = {
  ok: { color: "var(--status-good)", label: "Live", icon: "●" },
  partial: { color: "var(--status-warning)", label: "Partial", icon: "◐" },
  not_configured: {
    color: "var(--text-muted)",
    label: "Not connected",
    icon: "○",
  },
  error: { color: "var(--status-critical)", label: "Error", icon: "▲" },
};

/**
 * Admin-only. Doubles as the integration checklist: every "Not connected" row
 * says exactly which env var turns it on.
 */
export function SourcesPanel({ sources }: { sources: SourceStatus[] }) {
  return (
    <section className="card p-6">
      <h2 className="text-[15px] font-bold">Data sources</h2>
      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
        Later sources override earlier ones on conflict, so automated feeds win
        over the manual file.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {sources.map((s) => {
          const style = STATE_STYLE[s.state];
          return (
            <li
              key={s.id}
              className="flex gap-3 pb-3 last:pb-0"
              style={{
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                aria-hidden="true"
                className="mt-[3px] text-[11px]"
                style={{ color: style.color }}
              >
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: style.color }}
                  >
                    {style.label}
                  </span>
                  {s.fetchedAt ? (
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {utcTime(s.fetchedAt)}
                      {s.durationMs != null ? ` · ${s.durationMs}ms` : ""}
                    </span>
                  ) : null}
                </div>
                <p
                  className="text-xs mt-0.5 leading-snug break-words"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {s.detail}
                </p>
                {s.provides.length ? (
                  <div className="flex gap-1.5 mt-1.5">
                    {s.provides.map((d) => (
                      <span
                        key={d}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
