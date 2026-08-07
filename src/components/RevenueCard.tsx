"use client";

import { useRef, useState } from "react";
import type { Bar } from "@/lib/metrics";
import type { RangeSpec } from "@/lib/range";
import { axisTicks, compactMoney, money, percent } from "@/lib/format";
import { NotTracked } from "./StatTile";

type View = "chart" | "table";

interface Props {
  /** Already sliced to the selected range by computeMetrics. */
  bars: Bar[];
  windowTotalCents: number;
  windowUsageShare: number | null;
  /** Point-in-time rates — a window can't change them. */
  mrrCents: number;
  annualRunRateCents: number;
  range: RangeSpec;
  scopeLabel: string;
  /** Set when the range needs day-level data and no source supplies it. */
  unavailableReason?: string;
}

/**
 * The headline figure and the history behind it, in one card.
 *
 * This component only renders — the windowing lives in computeMetrics so the
 * headline, the tiles and the chart are all read off one slice and cannot
 * disagree. The range picker itself sits in the page header now, since it
 * scopes far more than this card.
 */
export function RevenueCard({
  bars,
  windowTotalCents,
  windowUsageShare,
  mrrCents,
  annualRunRateCents,
  range,
  scopeLabel,
  unavailableReason,
}: Props) {
  const [view, setView] = useState<View>("chart");
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    point: Bar;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const dayGrain = range.grain === "day";

  // Fixed viewBox with the slots dividing it, so a 12-month view fills the
  // card. Slot width is capped and the group centred, so a 3-month view shows
  // three columns together rather than specks strung across the plot.
  const PLOT_H = 210;
  const AXIS_H = 26;
  // Headroom: the top gridline label is centred on y=0 and the direct value
  // label sits 8px above its column — both clip on the viewBox edge without it.
  const TOP_PAD = 20;
  const LEFT = 64;
  const RIGHT = 12;
  const VB_W = 1100;
  const SLOT_MAX = 104;

  const n = Math.max(1, bars.length);
  const plotW = VB_W - LEFT - RIGHT;
  const slot = Math.min(plotW / n, SLOT_MAX);
  const startX = LEFT + (plotW - slot * n) / 2;
  const barW = Math.min(24, Math.max(10, slot * 0.4));
  const h = TOP_PAD + PLOT_H + AXIS_H;

  const max = Math.max(1, ...bars.map((b) => b.totalCents));
  const ticks = axisTicks(max, 4);
  const scaleMax = ticks[ticks.length - 1] || max;
  const yOf = (cents: number) => PLOT_H - (cents / scaleMax) * PLOT_H;

  const hasPartial = bars.some((b) => b.partial);
  const lastComplete = [...bars].reverse().find((b) => !b.partial)?.key;

  const showTip = (e: React.MouseEvent, point: Bar) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, point });
  };

  return (
    <section
      className="hero-card p-6 sm:p-7"
      ref={wrapRef}
      style={{ position: "relative" }}
    >
      {/* Headline ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">
            {unavailableReason
              ? `Revenue · ${scopeLabel}`
              : `Revenue collected · ${range.window} · ${scopeLabel}`}
          </div>
          <div className="display text-[52px] mt-2.5">
            {unavailableReason ? "—" : money(windowTotalCents)}
          </div>
          <div
            className="text-sm mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            {windowUsageShare !== null && !unavailableReason
              ? `${percent(windowUsageShare)} from usage · `
              : ""}
            {money(mrrCents)} MRR · {money(annualRunRateCents)} annual run rate
          </div>
          {hasPartial && !unavailableReason ? (
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Includes {dayGrain ? "today" : "this month"}, still in progress
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <Legend />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      <div
        className="mt-5 pt-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-[13px] font-bold">
            Collected revenue by {dayGrain ? "day" : "month"}
          </h2>
          {!unavailableReason ? (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {bars.length} {dayGrain ? "day" : "month"}
              {bars.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {unavailableReason ? (
          <div className="py-2">
            <NotTracked needs={unavailableReason} />
          </div>
        ) : view === "chart" ? (
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${VB_W} ${h}`}
              width="100%"
              style={{ minWidth: 560 }}
              role="img"
              aria-label="Stacked columns of revenue split into SaaS and usage"
            >
              <g transform={`translate(0, ${TOP_PAD})`}>
                {ticks.map((t) => (
                  <g key={t}>
                    <line
                      className="gridline"
                      x1={LEFT}
                      x2={VB_W - RIGHT}
                      y1={yOf(t)}
                      y2={yOf(t)}
                    />
                    <text
                      className="axis-text"
                      x={LEFT - 10}
                      y={yOf(t) + 4}
                      textAnchor="end"
                    >
                      {compactMoney(t)}
                    </text>
                  </g>
                ))}

                {bars.map((b, i) => {
                  const cx = startX + i * slot + slot / 2;
                  const x = cx - barW / 2;
                  const usageTop = yOf(b.usageCents);
                  const usageH = PLOT_H - usageTop;
                  // 2px surface gap, taken off the bottom of the SaaS segment.
                  const saasTop = yOf(b.totalCents);
                  const saasH = Math.max(0, usageTop - 2 - saasTop);

                  return (
                    <g
                      key={b.key}
                      opacity={b.partial ? 0.5 : 1}
                      onMouseMove={(e) => showTip(e, b)}
                      onMouseLeave={() => setHover(null)}
                    >
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
                      {lastComplete === b.key ? (
                        <text
                          x={cx}
                          y={saasTop - 8}
                          textAnchor="middle"
                          fontSize={12}
                          fontWeight={600}
                          fill="var(--text-primary)"
                        >
                          {compactMoney(b.totalCents)}
                        </text>
                      ) : null}
                      <text
                        className="axis-text"
                        x={cx}
                        y={PLOT_H + 17}
                        textAnchor="middle"
                      >
                        {b.label}
                        {b.partial ? "*" : ""}
                      </text>
                    </g>
                  );
                })}

                <line
                  className="baseline"
                  x1={LEFT}
                  x2={VB_W - RIGHT}
                  y1={PLOT_H}
                  y2={PLOT_H}
                />
              </g>

              <defs>
                <pattern
                  id="tex-45"
                  width="6"
                  height="6"
                  patternTransform="rotate(45)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="var(--series-1)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="var(--seq-700)"
                    strokeWidth="2"
                  />
                </pattern>
                <pattern
                  id="tex-135"
                  width="6"
                  height="6"
                  patternTransform="rotate(135)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="var(--series-2)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="#7a2f0f"
                    strokeWidth="2"
                  />
                </pattern>
              </defs>
            </svg>
            {hasPartial ? (
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                * {dayGrain ? "Today" : "This month"} is still in progress —
                shown faded, and it holds the total below a like-for-like
                comparison.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto mt-2">
            <table className="dataview">
              <thead>
                <tr>
                  <th>{dayGrain ? "Day" : "Month"}</th>
                  <th className="num">SaaS</th>
                  <th className="num">Usage</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...bars].reverse().map((b) => (
                  <tr key={b.key}>
                    <td>
                      {b.full}
                      {b.partial ? (
                        <span style={{ color: "var(--text-muted)" }}>
                          {" "}
                          · in progress
                        </span>
                      ) : null}
                    </td>
                    <td className="num">{money(b.saasCents)}</td>
                    <td className="num">{money(b.usageCents)}</td>
                    <td className="num">{money(b.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hover && view === "chart" && !unavailableReason ? (
        <div className="viz-tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="font-semibold">
            {hover.point.full}
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

/* -------------------------------------------------------------------------- */

function Legend() {
  return (
    <div
      className="flex items-center gap-3 text-xs"
      style={{ color: "var(--text-secondary)" }}
    >
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
    <div className="seg" role="tablist" aria-label="Revenue view">
      {options.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
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
