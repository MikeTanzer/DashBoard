import type { Metric } from "@/lib/types";

interface Props {
  label: string;
  metric: Metric<number>;
  /** How to render the value once it exists. */
  format: (value: number) => string;
  /** Signed change vs a named period, e.g. { value: 0.04, period: "last month" } */
  delta?: { value: number; period: string; upIsGood?: boolean } | null;
  hint?: string;
  span?: 1 | 2;
}

export function StatTile({
  label,
  metric,
  format,
  delta,
  hint,
  span = 1,
}: Props) {
  return (
    <div
      className={`card p-5 flex flex-col gap-2 ${span === 2 ? "sm:col-span-2" : ""}`}
    >
      <div className="eyebrow">{label}</div>

      {metric.available ? (
        <>
          <div className="display text-[30px]">
            {format(metric.value)}
          </div>
          <div className="flex items-baseline gap-2 min-h-[16px]">
            {delta ? <Delta {...delta} /> : null}
            {metric.note ? (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {metric.note}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <NotTracked needs={metric.needs} />
      )}

      {hint && metric.available ? (
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function Delta({
  value,
  period,
  upIsGood = true,
}: {
  value: number;
  period: string;
  upIsGood?: boolean;
}) {
  const up = value >= 0;
  const good = up === upIsGood;
  const color = good ? "var(--delta-good)" : "var(--status-critical)";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {up ? "▲" : "▼"} {Math.abs(value * 100).toFixed(1)}%
      <span className="font-normal" style={{ color: "var(--text-muted)" }}>
        {" "}
        vs {period}
      </span>
    </span>
  );
}

/**
 * The honest empty state. It names what's missing so the dashboard doubles as
 * the integration checklist.
 */
export function NotTracked({ needs }: { needs: string }) {
  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div
        className="text-lg font-medium flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="var(--status-warning)"
            strokeWidth="1.5"
          />
          <path
            d="M8 4.5v4.2"
            stroke="var(--status-warning)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.3" r="0.9" fill="var(--status-warning)" />
        </svg>
        Not yet tracked
      </div>
      <div
        className="text-xs leading-snug"
        style={{ color: "var(--text-secondary)" }}
      >
        {needs}
      </div>
    </div>
  );
}
