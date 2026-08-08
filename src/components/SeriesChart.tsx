"use client";

import { useRef, useState } from "react";
import type { SeriesPoint, TileSeries } from "@/lib/metrics";
import { compactMoney, compactNumber, fullNumber, money } from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";

/**
 * A single-value column chart for whichever stat tile is driving the card.
 *
 * Separate from the revenue chart rather than a mode of it: that one stacks two
 * series and is anchored at zero, while this one has to cope with a single
 * series that can go negative (period-over-period change), which needs a zero
 * line inside the plot rather than at its foot.
 */
export function SeriesChart({
  series,
  points,
}: {
  series: TileSeries;
  points: SeriesPoint[];
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(plotRef, 1100);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    p: SeriesPoint;
  } | null>(null);

  const PLOT_H = 210;
  const AXIS_H = 26;
  const TOP_PAD = 20;
  const LEFT = 64;
  const RIGHT = 12;
  const VB_W = Math.max(measured, 320);
  const h = TOP_PAD + PLOT_H + AXIS_H;

  const n = Math.max(1, points.length);
  const plotW = VB_W - LEFT - RIGHT;
  const slot = plotW / n;
  // Same widening rule as the revenue chart, so switching metrics doesn't
  // change the visual weight of a column.
  const fill = n <= 3 ? 0.34 : n >= 12 ? 0.7 : 0.34 + ((n - 3) / 9) * 0.36;
  const barW = Math.min(Math.max(4, Math.min(slot * fill, 120)), slot * 0.85);

  const values = points.map((p) => p.value);
  // A series that dips below zero needs the axis to include zero on both
  // sides; one that doesn't still anchors at zero so column lengths stay
  // proportional to their values.
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  const { ticks, lo, hi } = niceScale(rawMin, rawMax);

  const yOf = (v: number) =>
    PLOT_H - ((v - lo) / (hi - lo || 1)) * PLOT_H;
  const zeroY = yOf(0);

  const fmtAxis = (v: number) => {
    if (series.format === "percent") return `${(v * 100).toFixed(0)}%`;
    if (series.format === "money") return compactMoney(v);
    return compactNumber(v);
  };

  const fmt = (v: number, long = false) => {
    if (series.format === "percent") {
      return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
    }
    if (series.format === "money") {
      return (long ? money(v) : compactMoney(v)) + (series.unit ?? "");
    }
    return long ? fullNumber(v) : compactNumber(v);
  };

  const show = (e: React.PointerEvent, p: SeriesPoint) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, p });
  };

  return (
    <div style={{ position: "relative" }}>
      <div className="overflow-x-auto" ref={plotRef}>
        <svg
          viewBox={`0 0 ${VB_W} ${h}`}
          width="100%"
          className="chart-revenue"
          role="img"
          aria-label={series.title}
        >
          <g transform={`translate(0 ${TOP_PAD})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  className={t === 0 ? "baseline" : "gridline"}
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
                  {/* No unit suffix on the axis: the heading already says
                      "per month", and repeating it made "$1,500/mo" wider than
                      the gutter, so the labels clipped on a phone. */}
                  {fmtAxis(t)}
                </text>
              </g>
            ))}

            {/* Remounted when the selected metric changes, so the columns
                replay instead of keeping a finished animation. */}
            <g key={`${series.title}-${points.length}-${points[0]?.key ?? ""}`}>
            {points.map((p, i) => {
              const cx = LEFT + i * slot + slot / 2;
              const x = cx - barW / 2;
              const vy = yOf(p.value);
              const top = Math.min(vy, zeroY);
              const height = Math.abs(vy - zeroY);
              const negative = p.value < 0;
              return (
                <g
                  key={p.key}
                  opacity={p.partial ? 0.5 : 1}
                  onPointerMove={(e) => show(e, p)}
                  onPointerDown={(e) => show(e, p)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect
                    x={cx - slot / 2}
                    y={0}
                    width={slot}
                    height={PLOT_H}
                    fill="transparent"
                  />
                  <g
                    className="bar-rise"
                    style={{
                      // The zero line, not the plot floor — a series that dips
                      // negative has to grow downward from the same origin.
                      transformOrigin: `0px ${TOP_PAD + zeroY}px`,
                      animationDelay: `${Math.min(i * 26, 400)}ms`,
                    }}
                  >
                    <rect
                      x={x}
                      y={top}
                      width={barW}
                      height={Math.max(1, height)}
                      rx={Math.min(4, barW / 3)}
                      fill={
                        negative ? "var(--status-critical)" : "var(--series-1)"
                      }
                      className="texture-a"
                    />
                  </g>
                  <text
                    className="axis-text"
                    x={cx}
                    y={PLOT_H + 17}
                    textAnchor="middle"
                  >
                    {p.label}
                    {p.partial ? "*" : ""}
                  </text>
                </g>
              );
            })}
            </g>
          </g>
        </svg>
      </div>

      {hover ? (
        <div
          className="viz-tooltip"
          style={{ left: hover.x, top: hover.y }}
          role="status"
        >
          <div className="font-semibold mb-1">{hover.p.full}</div>
          <div className="flex items-center gap-3">
            <span className="tip-label">{series.title}</span>
            <span className="tip-value">{fmt(hover.p.value, true)}</span>
          </div>
          {hover.p.partial ? (
            <div className="tip-dim mt-1">Still in progress</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The table view of the same series. */
export function SeriesTable({
  series,
  points,
}: {
  series: TileSeries;
  points: SeriesPoint[];
}) {
  const fmt = (v: number) =>
    series.format === "percent"
      ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`
      : series.format === "money"
        ? money(v) + (series.unit ?? "")
        : fullNumber(v);

  return (
    <div className="mt-3 max-h-[420px] overflow-y-auto">
      <table className="dataview">
        <thead>
          <tr>
            <th>Period</th>
            <th className="num">{series.title}</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={p.key}>
              <td>
                {p.full}
                {p.partial ? (
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    · in progress
                  </span>
                ) : null}
              </td>
              <td className="num">{fmt(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Axis ticks spanning zero when the data does.
 *
 * Built to always CONTAIN the extremes — a top tick below the maximum would let
 * a column overflow the plot, which is the bug the revenue chart's ticks were
 * fixed for.
 */
function niceScale(min: number, max: number): {
  ticks: number[];
  lo: number;
  hi: number;
} {
  if (min === 0 && max === 0) return { ticks: [0, 1], lo: 0, hi: 1 };

  const span = max - min;
  const rough = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rough) || 1)));
  const step = [1, 2, 2.5, 5, 10]
    .map((m) => m * mag)
    .find((s) => s >= rough) ?? mag * 10;

  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) hi = lo + step;

  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return { ticks, lo, hi: ticks[ticks.length - 1] };
}
