"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Bar,
  ExpenseSplitPoint,
  ProfitPoint,
  TileSeries,
} from "@/lib/metrics";
import type { Metric } from "@/lib/types";
import {
  AxisPeriodLabel,
  ExpenseSplitChart,
  ExpenseSplitTable,
  ProfitPairChart,
  ProfitPairTable,
  SeriesChart,
  SeriesTable,
} from "./SeriesChart";
import type { Grain } from "@/lib/range";
import { axisTicks, compactMoney, money, percent } from "@/lib/format";
import { NotTracked } from "./StatTile";
import { useElementWidth } from "@/lib/useElementWidth";

type View = "chart" | "table";

/** What the card is about. Drives its headline and, by default, its chart. */
export type Primary = "revenue" | "profit" | "expenses" | "margin";

interface Props {
  /** Already sliced to the selected range by computeMetrics. */
  bars: Bar[];
  windowTotalCents: number;
  windowUsageShare: number | null;
  /** Point-in-time rates — a window can't change them. */
  mrrCents: number;
  annualRunRateCents: number;
  /** Bucket the bars represent — may be coarser than the range's own series. */
  bucket: Grain;
  /** What the window actually covers; may differ from the button pressed. */
  windowLabel: string;
  scopeLabel: string;
  /** Set when the range needs day-level data and no source supplies it. */
  unavailableReason?: string;
  /**
   * The stat tile currently driving the chart. When set, the chart and table
   * show that metric over time instead of the revenue breakdown; the headline
   * above stays on revenue, which is the card's anchor figure.
   */
  series?: TileSeries | null;
  /** Which figure the headline states. */
  primary?: Primary;
  netProfit?: Metric<number>;
  expenses?: Metric<number>;
  grossMargin?: Metric<number>;
  /** Gross and net per period, plotted together in the profit view. */
  profitPair?: Metric<ProfitPoint[]>;
  /**
   * True when the profit view owns the chart — i.e. Profit is the subject AND
   * no stat tile is overriding it. The card can't work this out for itself:
   * a tile's series arrives through the same `series` prop.
   */
  showProfitPair?: boolean;
  /** Cost of revenue vs operations per period, for the expenses view. */
  expenseSplit?: Metric<ExpenseSplitPoint[]>;
  /** True when the expenses view owns the chart. */
  showExpenseSplit?: boolean;
  /** Shared overhead excluded by a platform filter, for the caveat line. */
  sharedExcludedCents?: number;
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
  bucket,
  windowLabel,
  scopeLabel,
  unavailableReason,
  series,
  primary = "revenue",
  netProfit,
  expenses,
  grossMargin,
  profitPair,
  showProfitPair = false,
  expenseSplit,
  showExpenseSplit = false,
  sharedExcludedCents = 0,
}: Props) {
  const [view, setView] = useState<View>("chart");
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    point: Bar;
    index: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const dayGrain = bucket === "day";
  const measuredWidth = useElementWidth(plotRef, 1100);
  const unit = { day: "day", month: "month", quarter: "quarter", year: "year" }[
    bucket
  ];

  // Bars divide the full plot width evenly, and each bar's width is a fraction
  // of its band — so a 3-month view draws broad columns and a 12-month or daily
  // view draws slim ones.
  const PLOT_H = 210;
  // 40, not 26: period labels put the year on a second line, and the old
  // height clipped it against the viewBox edge.
  const AXIS_H = 40;
  // Headroom: the top gridline label is centred on y=0 and the direct value
  // label sits 8px above its column — both clip on the viewBox edge without it.
  const TOP_PAD = 20;
  const LEFT = 64;
  const RIGHT = 12;
  // 1 viewBox unit = 1 rendered pixel, so axis and value labels keep their
  // intended size on a phone instead of being scaled into illegibility.
  // Floored so a very narrow card still gets a usable plot and scrolls.
  const VB_W = Math.max(measuredWidth, 320);

  const n = Math.max(1, bars.length);
  const plotW = VB_W - LEFT - RIGHT;
  // Uncapped: the old cap of 104 meant 3, 6 and 7 bars all landed on the same
  // band, so they all drew the same width and the group was just centred in
  // dead space. Letting the band grow is what makes width respond to count.
  const slot = plotW / n;
  const startX = LEFT;
  // Fill ratio rises with density. A dozen columns look right at ~70% of their
  // band, but 3 columns at 70% would be 240px slabs; 3 at 34% is a broad column
  // and 12 at 70% is a slim one. Ramping between the two keeps bar width
  // strictly decreasing as bars are added, which is how the chart reads.
  const fill = n <= 3 ? 0.34 : n >= 12 ? 0.7 : 0.34 + ((n - 3) / 9) * 0.36;
  // Floored so the densest daily view still draws a visible sliver; capped so a
  // single-bucket window doesn't render one enormous slab. The floor itself is
  // held under the band — on a phone, 4px would exceed the band past ~75 bars
  // and the columns would fuse into a solid block.
  const barW = Math.min(Math.max(4, Math.min(slot * fill, 120)), slot * 0.85);
  const barR = Math.min(4, barW / 3);
  const h = TOP_PAD + PLOT_H + AXIS_H;

  const max = Math.max(1, ...bars.map((b) => b.totalCents));
  const ticks = axisTicks(max, 4);
  const scaleMax = ticks[ticks.length - 1] || max;
  const yOf = (cents: number) => PLOT_H - (cents / scaleMax) * PLOT_H;

  useEffect(() => {
    if (!hover) return;
    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setHover(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [hover]);

  const hasPartial = bars.some((b) => b.partial);
  const lastComplete = [...bars].reverse().find((b) => !b.partial)?.key;

  // Pointer events so the tooltip is reachable by tap; see StatesCard.
  const showTip = (
    e: React.PointerEvent | React.MouseEvent,
    point: Bar,
    index: number,
  ) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, point, index });
  };

  /**
   * Change against the preceding bucket in view.
   *
   * Skipped when either side is still in progress: a half-finished month
   * against a whole one always reads as a collapse, which is the same trap the
   * headline comparison avoids by using complete periods only.
   */
  const changeVsPrevious = (i: number): number | null => {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (!prev || cur.partial || prev.partial) return null;
    if (prev.totalCents === 0) return null;
    return (cur.totalCents - prev.totalCents) / prev.totalCents;
  };

  /**
   * The headline follows the card's subject, so an expenses chart is never
   * captioned with a revenue figure. Only the three primaries change it — a
   * stat tile overrides the chart but leaves the subject alone.
   */
  const headline = (() => {
    if (primary === "profit" && netProfit) {
      if (!netProfit.available) {
        return {
          eyebrow: `Net profit · ${scopeLabel}`,
          figure: "—",
          sub: netProfit.needs,
        };
      }
      const v = netProfit.value;
      return {
        eyebrow: `${v < 0 ? "Net burn" : "Net profit"} · ${windowLabel} · ${scopeLabel}`,
        figure: `${v < 0 ? "−" : ""}${money(Math.abs(v))}`,
        sub: sharedExcludedCents > 0
          ? `Direct costs only · excludes ${compactMoney(sharedExcludedCents)} shared overhead`
          : `${money(windowTotalCents)} collected less expenses over the same period`,
      };
    }

    if (primary === "expenses" && expenses) {
      if (!expenses.available) {
        return {
          eyebrow: `Expenses · ${scopeLabel}`,
          figure: "—",
          sub: expenses.needs,
        };
      }
      return {
        eyebrow: `Expenses · ${windowLabel} · ${scopeLabel}`,
        figure: money(expenses.value),
        sub: sharedExcludedCents > 0
          ? `Direct costs only · excludes ${compactMoney(sharedExcludedCents)} shared overhead`
          : `Against ${money(windowTotalCents)} collected over the same period`,
      };
    }

    if (primary === "margin" && grossMargin) {
      if (!grossMargin.available) {
        return {
          eyebrow: `Gross margin · ${scopeLabel}`,
          figure: "—",
          sub: grossMargin.needs,
        };
      }
      // Cost of revenue, recovered from the margin and the revenue it was
      // taken on, so the caption states the two figures behind the ratio
      // rather than just naming the categories.
      const cogs = Math.round(windowTotalCents * (1 - grossMargin.value));
      return {
        eyebrow: `Gross margin · ${windowLabel} · ${scopeLabel}`,
        figure: percent(grossMargin.value, 1),
        sub:
          sharedExcludedCents > 0
            ? `${money(windowTotalCents)} collected, less ${money(cogs)} of direct cost of revenue`
            : `${money(windowTotalCents)} collected, less ${money(cogs)} of cost of revenue`,
      };
    }

    return {
      eyebrow: unavailableReason
        ? `Revenue · ${scopeLabel}`
        : `Revenue collected · ${windowLabel} · ${scopeLabel}`,
      figure: unavailableReason ? "—" : money(windowTotalCents),
      sub: `${
        windowUsageShare !== null && !unavailableReason
          ? `${percent(windowUsageShare)} from usage · `
          : ""
      }${money(mrrCents)} MRR · ${money(annualRunRateCents)} annual run rate`,
    };
  })();

  return (
    <section
      className="hero-card p-6 sm:p-7"
      ref={wrapRef}
      style={{ position: "relative" }}
    >
      {/* Headline ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">{headline.eyebrow}</div>
          <div className="display hero-figure mt-2.5">{headline.figure}</div>
          <div
            className="text-sm mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            {headline.sub}
          </div>
          {hasPartial && !unavailableReason ? (
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Includes this {dayGrain ? "day" : unit}, still in progress
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <Legend
            pairs={
              showProfitPair
                ? [
                    ["var(--series-1)", "Gross"],
                    ["var(--series-2)", "Net"],
                  ]
                : showExpenseSplit
                  ? [
                      ["var(--series-1)", "Operations"],
                      ["var(--series-2)", "COGS"],
                    ]
                  : [
                      ["var(--series-1)", "SaaS"],
                      ["var(--series-2)", "Usage"],
                    ]
            }
          />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      <div
        className="mt-5 pt-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-[13px] font-bold">
            {showProfitPair
              ? `Gross and net profit by ${unit}`
              : showExpenseSplit
                ? `Cost of revenue and operations by ${unit}`
                : series
                  ? series.title
                  : `Collected revenue by ${unit}`}
          </h2>
          {!unavailableReason ? (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {bars.length} {unit}
              {bars.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {showExpenseSplit && expenseSplit?.available ? (
          view === "chart" ? (
            <ExpenseSplitChart points={expenseSplit.value} />
          ) : (
            <ExpenseSplitTable points={expenseSplit.value} />
          )
        ) : showProfitPair && profitPair?.available ? (
          view === "chart" ? (
            <ProfitPairChart points={profitPair.value} />
          ) : (
            <ProfitPairTable points={profitPair.value} />
          )
        ) : series ? (
          series.points.available ? (
            view === "chart" ? (
              <SeriesChart series={series} points={series.points.value} />
            ) : (
              <SeriesTable series={series} points={series.points.value} />
            )
          ) : (
            <div className="py-2">
              <NotTracked needs={series.points.needs} />
            </div>
          )
        ) : unavailableReason ? (
          <div className="py-2">
            <NotTracked needs={unavailableReason} />
          </div>
        ) : view === "chart" ? (
          <div className="overflow-x-auto" ref={plotRef}>
            <svg
              viewBox={`0 0 ${VB_W} ${h}`}
              width="100%"
              className="chart-revenue"
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

                {/* Keyed on the dataset so React remounts these nodes when the
                    range, bucket or platform changes — reusing them would keep
                    the finished animation and nothing would replay. */}
                <g key={`${bucket}-${bars.length}-${bars[0]?.key ?? ""}-${bars[bars.length - 1]?.key ?? ""}`}>
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
                      onPointerMove={(e) => showTip(e, b, i)}
                      onPointerDown={(e) => showTip(e, b, i)}
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
                            d={roundedTopBar(x, saasTop, barW, saasH, barR)}
                            fill="var(--series-1)"
                            className="texture-a"
                          />
                        ) : null}
                      </g>
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
                      <AxisPeriodLabel
                      x={cx}
                      y={PLOT_H + 17}
                      label={b.label}
                      partial={b.partial}
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
                * This {dayGrain ? "day" : unit} is still in progress —
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
                  <th>{unit.charAt(0).toUpperCase() + unit.slice(1)}</th>
                  <th className="num">SaaS</th>
                  <th className="num">Usage</th>
                  <th className="num">Total</th>
                  <th className="num">% of window</th>
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
                    <td className="num">
                      {money(b.saasCents)}
                      <Share part={b.saasCents} whole={b.totalCents} />
                    </td>
                    <td className="num">
                      {money(b.usageCents)}
                      <Share part={b.usageCents} whole={b.totalCents} />
                    </td>
                    <td className="num">{money(b.totalCents)}</td>
                    <td className="num">
                      {windowTotalCents > 0
                        ? percent(b.totalCents / windowTotalCents, 1)
                        : "—"}
                    </td>
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
          {(() => {
            const change = changeVsPrevious(hover.index);
            if (change === null) return null;
            const up = change >= 0;
            return (
              <div className="flex items-center gap-1.5">
                <span style={{ color: up ? "#4ade80" : "#fb7185" }}>
                  {up ? "▲" : "▼"} {Math.abs(change * 100).toFixed(1)}%
                </span>
                <span className="tip-label">
                  vs {bars[hover.index - 1].full}
                </span>
              </div>
            );
          })()}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A share of the row's own total, set beside the amount.
 *
 * The SaaS and Usage columns are two parts of the row's total, so the useful
 * percentage is of THAT row — not of the window, which is what the trailing
 * column answers. Keeping them visually distinct stops the two being read as
 * the same measure.
 */
function Share({ part, whole }: { part: number; whole: number }) {
  if (whole <= 0) return null;
  return (
    <span
      className="ml-1.5"
      style={{ color: "var(--text-muted)", fontSize: "0.85em" }}
    >
      {percent(part / whole)}
    </span>
  );
}

/** Named by whatever the two series currently are, not hard-coded to revenue's. */
function Legend({ pairs }: { pairs: [string, string][] }) {
  return (
    <div
      className="flex items-center gap-3 text-xs"
      style={{ color: "var(--text-secondary)" }}
    >
      {pairs.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <Swatch color={color} /> {label}
        </span>
      ))}
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
