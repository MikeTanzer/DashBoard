"use client";

import { useMemo, useRef, useState } from "react";
import type { DayRevenue, MonthRevenue } from "@/lib/metrics";
import type { Metric } from "@/lib/types";
import {
  axisTicks,
  compactMoney,
  dayLabel,
  monthLabel,
  money,
  percent,
} from "@/lib/format";
import { NotTracked } from "./StatTile";

type View = "chart" | "table";

/**
 * Trailing windows. 3 months is the default — the operating view.
 *
 * The two short ranges are DAY-grained and read a different series: a week has
 * no meaning in monthly buckets, and resampling months into days would invent
 * a shape the data never had. Only sources with timestamped transactions
 * (Stripe, the admin API) can supply it, so these two ranges degrade to the
 * usual "Not yet tracked" copy when nothing does.
 */
const RANGES = [
  { id: "1w", label: "1W", grain: "day", count: 7 },
  { id: "1m", label: "1M", grain: "day", count: 30 },
  { id: "3m", label: "3M", grain: "month", count: 3 },
  { id: "6m", label: "6M", grain: "month", count: 6 },
  { id: "12m", label: "12M", grain: "month", count: 12 },
  { id: "all", label: "All", grain: "month", count: Infinity },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

/** What the chart actually plots, once the range has picked a series. */
interface Bar {
  key: string;
  label: string;
  saasCents: number;
  usageCents: number;
  totalCents: number;
  partial?: boolean;
  /** Long form for the tooltip and the table. */
  full: string;
}

interface Props {
  data: MonthRevenue[];
  daily: Metric<DayRevenue[]>;
  /** Current MRR in cents — a point-in-time figure, so the range doesn't move it. */
  mrrCents: number;
  annualRunRateCents: number;
  usageShare: number | null;
  scopeLabel: string;
}

/**
 * The headline figure and the history it came from, in one card.
 *
 * Two series → the legend is always present. Stacked segments are separated by
 * a 2px surface gap rather than a stroke, and only the last complete month is
 * direct-labelled; the axis and the tooltip carry the rest.
 */
export function RevenueCard({
  data,
  daily,
  mrrCents,
  annualRunRateCents,
  usageShare,
  scopeLabel,
}: Props) {
  const [view, setView] = useState<View>("chart");
  const [range, setRange] = useState<RangeId>("3m");
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    point: Bar;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const spec = RANGES.find((r) => r.id === range)!;
  const dayGrain = spec.grain === "day";
  const dailyMissing = dayGrain && !daily.available;

  const months = useMemo<Bar[]>(() => {
    if (dayGrain) {
      if (!daily.available) return [];
      return daily.value.slice(-spec.count).map((d) => ({
        key: d.date,
        label: dayLabel(d.date),
        saasCents: d.saasCents,
        usageCents: d.usageCents,
        totalCents: d.totalCents,
        partial: d.partial,
        full: dayLabel(d.date, true),
      }));
    }
    const src = spec.count === Infinity ? data : data.slice(-spec.count);
    const lastYear = src[src.length - 1]?.month.slice(0, 4);
    const spansYears = new Set(src.map((m) => m.month.slice(0, 4))).size > 1;
    return src.map((m) => ({
      key: m.month,
      label: monthLabel(m.month, spansYears && m.month.slice(0, 4) !== lastYear),
      saasCents: m.saasCents,
      usageCents: m.usageCents,
      totalCents: m.totalCents,
      partial: m.partial,
      full: monthLabel(m.month, true),
    }));
  }, [data, daily, dayGrain, spec]);

  // Fixed viewBox with the slots dividing it, so a 12-month view fills the
  // card. Slot width is capped and the group centred, so a 3-month view shows
  // three columns together rather than three specks marooned across a metre of
  // plot. Bars stay thin — the cap is on the slot, not the mark.
  const PLOT_H = 210;
  const AXIS_H = 26;
  const LEFT = 64;
  const RIGHT = 12;
  const VB_W = 1100;
  const SLOT_MAX = 104;

  const n = Math.max(1, months.length);
  const plotW = VB_W - LEFT - RIGHT;
  const slot = Math.min(plotW / n, SLOT_MAX);
  const startX = LEFT + (plotW - slot * n) / 2;
  const barW = Math.min(24, Math.max(10, slot * 0.4));
  const h = PLOT_H + AXIS_H;

  const max = Math.max(1, ...months.map((m) => m.totalCents));
  const ticks = axisTicks(max, 4);
  const scaleMax = ticks[ticks.length - 1] || max;
  const yOf = (cents: number) => PLOT_H - (cents / scaleMax) * PLOT_H;

  const hasPartial = months.some((m) => m.partial);
  const lastComplete = [...months].reverse().find((m) => !m.partial)?.key;

  const showTip = (e: React.MouseEvent, point: Bar) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, point });
  };

  return (
    <section className="card p-5 sm:p-6" ref={wrapRef} style={{ position: "relative" }}>
      {/* Headline ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div
            className="text-[11px] uppercase tracking-wider font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Monthly recurring revenue · {scopeLabel}
          </div>
          <div className="text-5xl font-semibold leading-none mt-2 tracking-tight">
            {money(mrrCents)}
          </div>
          <div
            className="text-sm mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            {money(annualRunRateCents)} annual run rate
            {usageShare !== null ? ` · ${percent(usageShare)} from usage` : ""}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2.5">
          <RangePicker range={range} onChange={setRange} />
          <div className="flex items-center gap-4">
            <Legend />
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </div>

      <div
        className="mt-5 pt-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-sm font-semibold">
            Collected revenue by {dayGrain ? "day" : "month"}
          </h2>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {months.length} {dayGrain ? "day" : "month"}
            {months.length === 1 ? "" : "s"}
          </span>
        </div>

        {dailyMissing ? (
          <div className="py-2">
            <NotTracked needs={daily.available ? "" : daily.needs} />
          </div>
        ) : view === "chart" ? (
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${VB_W} ${h}`}
              width="100%"
              style={{ minWidth: 560 }}
              role="img"
              aria-label="Stacked columns of monthly revenue split into SaaS and usage"
            >
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

              {months.map((m) => {
                const i = months.indexOf(m);
                const cx = startX + i * slot + slot / 2;
                const x = cx - barW / 2;
                const usageTop = yOf(m.usageCents);
                const usageH = PLOT_H - usageTop;
                // 2px surface gap, taken off the bottom of the SaaS segment.
                const saasTop = yOf(m.totalCents);
                const saasH = Math.max(0, usageTop - 2 - saasTop);

                return (
                  <g
                    key={m.key}
                    opacity={m.partial ? 0.5 : 1}
                    onMouseMove={(e) => showTip(e, m)}
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
                    {lastComplete === m.key ? (
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
                      {m.label}
                      {m.partial ? "*" : ""}
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
                * {dayGrain ? "Today" : "Month"} still in progress — shown
                faded, and excluded from the month-over-month figure.
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
                {[...months].reverse().map((m) => (
                  <tr key={m.key}>
                    <td>
                      {m.full}
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
      </div>

      {hover && view === "chart" ? (
        <div className="viz-tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="font-semibold">
            {hover.point.full}
            {hover.point.partial ? (
              <span className="font-normal" style={{ color: "var(--text-muted)" }}>
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

function RangePicker({
  range,
  onChange,
}: {
  range: RangeId;
  onChange: (r: RangeId) => void;
}) {
  return (
    <div
      className="flex rounded-lg overflow-hidden"
      role="group"
      aria-label="Time range"
      style={{ border: "1px solid var(--border)" }}
    >
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          aria-pressed={range === r.id}
          className="px-3 py-1.5 text-xs font-medium"
          style={{
            background: range === r.id ? "var(--surface-2)" : "transparent",
            color:
              range === r.id ? "var(--text-primary)" : "var(--text-secondary)",
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

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
    <div
      className="flex rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
      role="tablist"
      aria-label="Revenue view"
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
