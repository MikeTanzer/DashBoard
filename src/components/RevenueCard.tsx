"use client";

import { useRef, useState } from "react";
import type { MonthRevenue } from "@/lib/metrics";
import { axisTicks, compactMoney, monthLabel, money } from "@/lib/format";

type View = "chart" | "table";

/**
 * Monthly revenue, SaaS vs Usage, as stacked columns.
 *
 * Two series → legend always present. The two segments are separated by a 2px
 * surface gap rather than a stroke, and only the final column is direct-labeled
 * (the axis and the tooltip carry the rest).
 */
export function RevenueCard({ data }: { data: MonthRevenue[] }) {
  const [view, setView] = useState<View>("chart");
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    point: MonthRevenue;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const months = data.slice(-12);
  const max = Math.max(1, ...months.map((m) => m.totalCents));
  const ticks = axisTicks(max, 4);
  const scaleMax = ticks[ticks.length - 1] || max;

  const PLOT_H = 210;
  const AXIS_H = 26;
  const LEFT = 56;
  const RIGHT = 8;
  const slot = 60;
  const barW = Math.min(24, slot - 18);
  const w = LEFT + months.length * slot + RIGHT;
  const h = PLOT_H + AXIS_H;

  const yOf = (cents: number) => PLOT_H - (cents / scaleMax) * PLOT_H;

  const showTip = (e: React.MouseEvent, point: MonthRevenue) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, point });
  };

  const lastYear = months[months.length - 1]?.month.slice(0, 4);
  const hasPartial = months.some((m) => m.partial);
  // Direct-label the last complete month, not the one still filling up.
  const lastCompleteMonth = [...months].reverse().find((m) => !m.partial)?.month;

  return (
    <section className="card p-5" ref={wrapRef} style={{ position: "relative" }}>
      <header className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold">Monthly revenue</h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Collected revenue by month, split into subscription and usage
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Legend />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </header>

      {view === "chart" ? (
        <div className="mt-3 overflow-x-auto">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            style={{ maxWidth: w, minWidth: Math.min(w, 620) }}
            role="img"
            aria-label="Stacked columns of monthly revenue split into SaaS and usage"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  className="gridline"
                  x1={LEFT}
                  x2={w - RIGHT}
                  y1={yOf(t)}
                  y2={yOf(t)}
                />
                <text
                  className="axis-text"
                  x={LEFT - 8}
                  y={yOf(t) + 4}
                  textAnchor="end"
                >
                  {compactMoney(t)}
                </text>
              </g>
            ))}

            {months.map((m, i) => {
              const cx = LEFT + i * slot + slot / 2;
              const x = cx - barW / 2;
              const usageTop = yOf(m.usageCents);
              const usageH = PLOT_H - usageTop;
              // 2px surface gap between the two segments, taken off the SaaS end.
              const saasBottom = usageTop - 2;
              const saasTop = yOf(m.totalCents);
              const saasH = Math.max(0, saasBottom - saasTop);

              return (
                <g
                  key={m.month}
                  onMouseMove={(e) => showTip(e, m)}
                  onMouseLeave={() => setHover(null)}
                  // The month in progress is de-emphasised so its short column
                  // doesn't read as a decline.
                  opacity={m.partial ? 0.5 : 1}
                >
                  {/* Generous hit target — the columns are thin on purpose. */}
                  <rect
                    x={cx - slot / 2}
                    y={0}
                    width={slot}
                    height={PLOT_H}
                    fill="transparent"
                  />
                  {usageH > 0 ? (
                    <rect
                      x={x}
                      y={usageTop}
                      width={barW}
                      height={usageH}
                      fill="var(--series-2)"
                      className="texture-b"
                    />
                  ) : null}
                  {saasH > 0 ? (
                    <path
                      d={roundedTopBar(x, saasTop, barW, saasH, 4)}
                      fill="var(--series-1)"
                      className="texture-a"
                    />
                  ) : null}
                  {lastCompleteMonth === m.month ? (
                    <text
                      x={cx}
                      y={saasTop - 8}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill="var(--text-primary)"
                    >
                      {compactMoney(m.totalCents)}
                    </text>
                  ) : null}
                  <text
                    className="axis-text"
                    x={cx}
                    y={PLOT_H + 17}
                    textAnchor="middle"
                  >
                    {monthLabel(m.month, m.month.slice(0, 4) !== lastYear)}
                    {m.partial ? "*" : ""}
                  </text>
                </g>
              );
            })}

            <line
              className="baseline"
              x1={LEFT}
              x2={w - RIGHT}
              y1={PLOT_H}
              y2={PLOT_H}
            />

            <defs>
              <pattern
                id="tex-45"
                width="6"
                height="6"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <rect width="6" height="6" fill="var(--series-1)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--seq-700)" strokeWidth="2" />
              </pattern>
              <pattern
                id="tex-135"
                width="6"
                height="6"
                patternTransform="rotate(135)"
                patternUnits="userSpaceOnUse"
              >
                <rect width="6" height="6" fill="var(--series-2)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="#7a2f0f" strokeWidth="2" />
              </pattern>
            </defs>
          </svg>
          {hasPartial ? (
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              * Month still in progress — shown faded, and excluded from the
              month-over-month figure.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 max-h-[300px] overflow-y-auto">
          <table className="dataview">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">SaaS</th>
                <th className="num">Usage</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <td>
                    {monthLabel(m.month, true)}
                    {m.partial ? (
                      <span style={{ color: "var(--text-muted)" }}>
                        {" "}
                        · in progress
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{money(m.saasCents)}</td>
                  <td className="num">{money(m.usageCents)}</td>
                  <td className="num">{money(m.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hover && view === "chart" ? (
        <div className="viz-tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="font-semibold">
            {monthLabel(hover.point.month, true)}
            {hover.point.partial ? (
              <span
                className="font-normal"
                style={{ color: "var(--text-muted)" }}
              >
                {" "}
                · in progress
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <Swatch color="var(--series-1)" /> SaaS{" "}
            <strong>{money(hover.point.saasCents)}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <Swatch color="var(--series-2)" /> Usage{" "}
            <strong>{money(hover.point.usageCents)}</strong>
          </div>
          <div
            className="mt-1 pt-1"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            Total <strong>{money(hover.point.totalCents)}</strong>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
      <span className="flex items-center gap-1.5">
        <Swatch color="var(--series-1)" /> SaaS
      </span>
      <span className="flex items-center gap-1.5">
        <Swatch color="var(--series-2)" /> Usage
      </span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        background: color,
        width: 10,
        height: 10,
        borderRadius: 3,
        display: "inline-block",
      }}
    />
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  const options: [View, string][] = [
    ["chart", "Chart"],
    ["table", "Table"],
  ];
  return (
    <div
      className="flex rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
      role="tablist"
      aria-label="Chart view"
    >
      {options.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
          className="px-3 py-1.5 text-xs font-medium"
          style={{
            background: view === id ? "var(--surface-2)" : "transparent",
            color: view === id ? "var(--text-primary)" : "var(--text-secondary)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Column with a 4px rounded cap and a square base. */
function roundedTopBar(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
