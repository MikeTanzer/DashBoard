"use client";

import { useRef, useState } from "react";
import type {
  ExpenseSplitPoint,
  ProfitPoint,
  SeriesPoint,
  TileSeries,
} from "@/lib/metrics";
import {
  compactMoney,
  compactNumber,
  fullNumber,
  money,
  periodLabelLines,
} from "@/lib/format";
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
  // 40, not 26: period labels put the year on a second line, and the old
  // height clipped it against the viewBox edge.
  const AXIS_H = 40;
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
                  <AxisPeriodLabel
                      x={cx}
                      y={PLOT_H + 17}
                      label={p.label}
                      partial={p.partial}
                    />
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

/**
 * Gross and net profit side by side, one pair of columns per period.
 *
 * Grouped rather than stacked: net is gross MINUS operating expense, not a
 * component of it, so stacking the two would draw a total that means nothing.
 * Side by side, the gap between the pair IS the operating expense, which is
 * the reason to show both at once.
 *
 * Either line can go negative — a month can be gross-positive and net-negative,
 * which is exactly the case worth seeing — so the zero line sits inside the
 * plot and bars grow up or down from it.
 */
export function ProfitPairChart({ points }: { points: ProfitPoint[] }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(plotRef, 1100);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    p: ProfitPoint;
  } | null>(null);

  const PLOT_H = 210;
  // 40, not 26: period labels put the year on a second line, and the old
  // height clipped it against the viewBox edge.
  const AXIS_H = 40;
  const TOP_PAD = 20;
  const LEFT = 64;
  const RIGHT = 12;
  const VB_W = Math.max(measured, 320);
  const h = TOP_PAD + PLOT_H + AXIS_H;

  const n = Math.max(1, points.length);
  const plotW = VB_W - LEFT - RIGHT;
  const slot = plotW / n;
  // One column per period, not two side by side. Gross and net share an x and
  // are told apart by width: gross full, net narrower and drawn on top.
  //
  // This works in both cases the data actually produces. Gross positive with
  // net negative — the interesting one — puts them either side of zero, so
  // they never touch. Both positive, and net is necessarily the shorter of the
  // two (net = gross minus operating expense, which can't be negative), so the
  // narrower bar sits inside the taller one and the overhang IS the opex.
  const fill = n <= 3 ? 0.34 : n >= 12 ? 0.7 : 0.34 + ((n - 3) / 9) * 0.36;
  const barW = Math.min(Math.max(4, Math.min(slot * fill, 120)), slot * 0.85);
  const innerW = Math.max(3, barW * 0.52);

  const values = points.flatMap((p) => [p.grossCents, p.netCents]);
  const { ticks, lo, hi } = niceScale(
    Math.min(0, ...values),
    Math.max(0, ...values),
  );
  const yOf = (v: number) => PLOT_H - ((v - lo) / (hi - lo || 1)) * PLOT_H;
  const zeroY = yOf(0);

  const show = (e: React.PointerEvent, p: ProfitPoint) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, p });
  };

  const bar = (
    v: number,
    x: number,
    w: number,
    color: string,
    key: string,
  ) => {
    const vy = yOf(v);
    return (
      <rect
        key={key}
        x={x}
        y={Math.min(vy, zeroY)}
        width={w}
        height={Math.max(1, Math.abs(vy - zeroY))}
        rx={Math.min(3, w / 3)}
        fill={color}
      />
    );
  };

  return (
    <div style={{ position: "relative" }}>
      <div className="overflow-x-auto" ref={plotRef}>
        <svg
          viewBox={`0 0 ${VB_W} ${h}`}
          width="100%"
          className="chart-revenue"
          role="img"
          aria-label="Gross and net profit over time"
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
                  {compactMoney(t)}
                </text>
              </g>
            ))}

            <g key={`${points.length}-${points[0]?.key ?? ""}`}>
              {points.map((p, i) => {
                const cx = LEFT + i * slot + slot / 2;
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
                        transformOrigin: `0px ${TOP_PAD + zeroY}px`,
                        animationDelay: `${Math.min(i * 26, 400)}ms`,
                      }}
                    >
                      {bar(p.grossCents, cx - barW / 2, barW, "var(--series-1)", "g")}
                      {bar(
                        p.netCents,
                        cx - innerW / 2,
                        innerW,
                        p.netCents < 0
                          ? "var(--status-critical)"
                          : "var(--series-2)",
                        "n",
                      )}
                    </g>
                    <AxisPeriodLabel
                      x={cx}
                      y={PLOT_H + 17}
                      label={p.label}
                      partial={p.partial}
                    />
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
            <span className="tip-label">Gross</span>
            <span className="tip-value">{money(hover.p.grossCents)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="tip-label">Net</span>
            <span className="tip-value">{money(hover.p.netCents)}</span>
          </div>
          <div className="tip-dim mt-1">
            {money(hover.p.grossCents - hover.p.netCents)} operating expense
          </div>
          {hover.p.partial ? (
            <div className="tip-dim mt-1">Still in progress</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Table view of the same pair. */
export function ProfitPairTable({ points }: { points: ProfitPoint[] }) {
  return (
    <div className="mt-3 max-h-[420px] overflow-y-auto">
      <table className="dataview">
        <thead>
          <tr>
            <th>Period</th>
            <th className="num">Gross</th>
            <th className="num">Net</th>
            <th className="num">Operating expense</th>
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
              <td className="num">{money(p.grossCents)}</td>
              <td className="num">{money(p.netCents)}</td>
              <td className="num">{money(p.grossCents - p.netCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Cost of revenue and operating expense, stacked to the period's total.
 *
 * Stacked here where gross/net is grouped, and the difference is real: these
 * two ADD to what was spent, so the column height is a figure that means
 * something. Gross and net don't add to anything.
 */
export function ExpenseSplitChart({ points }: { points: ExpenseSplitPoint[] }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(plotRef, 1100);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    p: ExpenseSplitPoint;
  } | null>(null);

  const PLOT_H = 210;
  // 40, not 26: period labels put the year on a second line, and the old
  // height clipped it against the viewBox edge.
  const AXIS_H = 40;
  const TOP_PAD = 20;
  const LEFT = 64;
  const RIGHT = 12;
  const VB_W = Math.max(measured, 320);
  const h = TOP_PAD + PLOT_H + AXIS_H;

  const n = Math.max(1, points.length);
  const plotW = VB_W - LEFT - RIGHT;
  const slot = plotW / n;
  const fill = n <= 3 ? 0.34 : n >= 12 ? 0.7 : 0.34 + ((n - 3) / 9) * 0.36;
  const barW = Math.min(Math.max(4, Math.min(slot * fill, 120)), slot * 0.85);
  const barR = Math.min(4, barW / 3);

  const totals = points.map((p) => p.cogsCents + p.opexCents);
  const { ticks, lo, hi } = niceScale(0, Math.max(0, ...totals));
  const yOf = (v: number) => PLOT_H - ((v - lo) / (hi - lo || 1)) * PLOT_H;

  const show = (e: React.PointerEvent, p: ExpenseSplitPoint) => {
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
          aria-label="Cost of revenue and operating expense over time"
        >
          <g transform={`translate(0 ${TOP_PAD})`}>
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

            <g key={`${points.length}-${points[0]?.key ?? ""}`}>
              {points.map((p, i) => {
                const cx = LEFT + i * slot + slot / 2;
                const x = cx - barW / 2;
                const total = p.cogsCents + p.opexCents;
                const cogsTop = yOf(p.cogsCents);
                const cogsH = PLOT_H - cogsTop;
                const opexTop = yOf(total);
                // 2px breather between the bands, taken off the upper one.
                const opexH = Math.max(0, cogsTop - 2 - opexTop);
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
                        transformOrigin: `0px ${TOP_PAD + PLOT_H}px`,
                        animationDelay: `${Math.min(i * 26, 400)}ms`,
                      }}
                    >
                      {cogsH > 0 ? (
                        <rect
                          x={x}
                          y={cogsTop}
                          width={barW}
                          height={cogsH}
                          fill="var(--series-2)"
                          className="texture-b"
                        />
                      ) : null}
                      {opexH > 0 ? (
                        <path
                          d={roundedTopBar(x, opexTop, barW, opexH, barR)}
                          fill="var(--series-1)"
                          className="texture-a"
                        />
                      ) : null}
                    </g>
                    <AxisPeriodLabel
                      x={cx}
                      y={PLOT_H + 17}
                      label={p.label}
                      partial={p.partial}
                    />
                  </g>
                );
              })}
            </g>

            <line
              className="baseline"
              x1={LEFT}
              x2={VB_W - RIGHT}
              y1={PLOT_H}
              y2={PLOT_H}
            />
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
            <span className="tip-label">Operations</span>
            <span className="tip-value">{money(hover.p.opexCents)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="tip-label">COGS</span>
            <span className="tip-value">{money(hover.p.cogsCents)}</span>
          </div>
          <div className="tip-dim mt-1">
            {money(hover.p.cogsCents + hover.p.opexCents)} total
          </div>
          {hover.p.partial ? (
            <div className="tip-dim mt-1">Still in progress</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Table view of the same split. */
export function ExpenseSplitTable({ points }: { points: ExpenseSplitPoint[] }) {
  return (
    <div className="mt-3 max-h-[420px] overflow-y-auto">
      <table className="dataview">
        <thead>
          <tr>
            <th>Period</th>
            <th className="num">COGS</th>
            <th className="num">Operations</th>
            <th className="num">Total</th>
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
              <td className="num">{money(p.cogsCents)}</td>
              <td className="num">{money(p.opexCents)}</td>
              <td className="num">{money(p.cogsCents + p.opexCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bar with a rounded data-end and a square baseline end. */
function roundedTopBar(
  x: number,
  y: number,
  w: number,
  hgt: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, hgt);
  return `M${x} ${y + hgt} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + hgt} Z`;
}


/**
 * An x-axis period label, with the year dropped onto a second line.
 *
 * Shared by every chart on the page so they can't drift apart — the axis is
 * one of the few things a reader compares directly across charts.
 */
export function AxisPeriodLabel({
  x,
  y,
  label,
  partial,
}: {
  x: number;
  y: number;
  label: string;
  partial?: boolean;
}) {
  const [main, year] = periodLabelLines(label);
  const star = partial ? "*" : "";
  return (
    <text className="axis-text" x={x} y={y} textAnchor="middle">
      <tspan x={x}>
        {main}
        {year ? "" : star}
      </tspan>
      {year ? (
        <tspan x={x} dy="12">
          {year}
          {star}
        </tspan>
      ) : null}
    </text>
  );
}
