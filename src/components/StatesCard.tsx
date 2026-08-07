"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RecencyBand, StateCount } from "@/lib/metrics";
import { ConsumerPie } from "./ConsumerPie";
import { STATE_NAMES } from "@/lib/states";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  OUTSET_LABEL_POS,
  ROOMY,
  STATE_LABEL_POS,
  STATE_PATHS,
} from "@/lib/us-map";
import {
  axisTicks,
  compactMoney,
  compactNumber,
  fullNumber,
  money,
} from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";

type View = "map" | "bars" | "table";

interface Props {
  data: StateCount[];
  customersWithoutState: number;
  /** Window label for the GMV row, so the period is never ambiguous. */
  gmvWindowLabel?: string;
  /** Set when per-state GMV can't be shown, with the reason. */
  gmvUnavailable?: string | null;
  /** Consumer recency, shown as an inset panel over the map's empty corner. */
  recency?: RecencyBand[];
}

/**
 * One hue, light→dark. A sub-ramp per bin count, so the steps stay evenly
 * spaced however many bins the data produces — picking N steps off a fixed
 * five-step ramp leaves visible gaps at some counts and near-duplicates at
 * others.
 *
 * Zero-customer states stay on the surface and are never given a ramp step.
 */
const RAMPS: Record<number, number[]> = {
  1: [700],
  2: [200, 700],
  3: [100, 400, 700],
  4: [100, 300, 500, 700],
  5: [100, 200, 400, 600, 700],
};

const step = (n: number) => `var(--seq-${n})`;
/**
 * Ink for a tile label. The ramp inverts in dark mode (low values recede toward
 * the dark surface), so the safe ink flips with it — hence a variable per step
 * rather than a fixed hex.
 */
const ink = (n: number) => `var(--ink-on-seq-${n})`;

interface Bin {
  min: number;
  max: number;
}

/**
 * Quantile bins, not equal-width ones.
 *
 * Customer counts per state are heavily skewed — one home state can hold a
 * third of the network. Equal-width bins would put every other state in the
 * lightest step and the map would read as binary. Quantiles keep the spread
 * visible; the legend prints the real range of each step so nothing is implied.
 */
function makeBins(values: number[]): Bin[] {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const uppers = new Set<number>();
  for (let k = 1; k <= 5; k++) {
    const idx = Math.min(sorted.length - 1, Math.ceil((k / 5) * sorted.length) - 1);
    uppers.add(sorted[idx]);
  }

  const bins: Bin[] = [];
  let lo = sorted[0];
  for (const up of [...uppers].sort((a, b) => a - b)) {
    if (up < lo) continue;
    bins.push({ min: lo, max: up });
    lo = up + 1;
  }
  return bins;
}

/** The ramp step number for bin `i` of `count`. */
function rampStep(i: number, count: number): number {
  const ramp = RAMPS[Math.min(5, Math.max(1, count))];
  return ramp[Math.min(i, ramp.length - 1)];
}

export function StatesCard({
  data,
  customersWithoutState,
  recency,
  gmvWindowLabel,
  gmvUnavailable,
}: Props) {
  const [view, setView] = useState<View>("map");
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    state: StateCount;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const byCode = useMemo(
    () => new Map(data.map((d) => [d.code, d])),
    [data],
  );
  const bins = useMemo(() => makeBins(data.map((d) => d.customers)), [data]);

  /** Ramp step number for a count, or 0 for "no customers here". */
  const bin = (count: number) => {
    if (count <= 0) return 0;
    const i = bins.findIndex((b) => count >= b.min && count <= b.max);
    return rampStep(i < 0 ? bins.length - 1 : i, bins.length);
  };

  /**
   * Pointer events, not mouse events: a phone has no hover, so a mouse-only
   * tooltip is simply unreachable on touch. onPointerDown covers tapping and
   * onPointerMove covers the mouse, from one handler.
   */
  const showTip = (e: React.PointerEvent | React.MouseEvent, state: StateCount) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      state,
    });
  };

  // A tap opens a tooltip with nothing to move away from, so dismiss on the
  // next tap anywhere outside the card.
  useEffect(() => {
    if (!hover) return;
    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setHover(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [hover]);

  return (
    <section className="card p-6" ref={wrapRef} style={{ position: "relative" }}>
      <header className="mb-1">
        <h2 className="text-[15px] font-bold">Customers by state</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {data.length} state{data.length === 1 ? "" : "s"} with at least one
          customer
          {customersWithoutState > 0
            ? ` · ${customersWithoutState} customer${customersWithoutState === 1 ? "" : "s"} missing a state`
            : ""}
        </p>
      </header>

      {/* Two columns. The right one — view toggle above the recency panel —
          is rendered once, outside the view switch, so it holds its position
          when you move between Map, Bars and Table. Putting the toggle in the
          header and the panel inside the map branch made both of them move
          (or vanish) as soon as the view changed. */}
      <div className="states-layout">
        <div className="states-main">
          {view === "map" ? (
            <>
              <Choropleth
                byCode={byCode}
                bin={bin}
                onHover={showTip}
                onLeave={() => setHover(null)}
              />
              <ScaleLegend bins={bins} />
            </>
          ) : view === "bars" ? (
            <Bars data={data} onHover={showTip} onLeave={() => setHover(null)} />
          ) : (
            <Table data={data} />
          )}
        </div>

        <aside className="states-side">
          <ViewToggle view={view} onChange={setView} />

          {recency?.length ? (
            <div className="recency-panel" aria-label="Consumer recency">
              <h3 className="text-[12px] font-bold mb-2">Consumer recency</h3>
              <ConsumerPie bands={recency} inset />
              <p
                className="text-[10px] mt-2 leading-snug"
                style={{ color: "var(--text-muted)" }}
              >
                Shoppers on our customers&apos; storefronts. Aggregate counts
                only.
              </p>
            </div>
          ) : null}
        </aside>
      </div>

      {hover && view !== "table" ? (
        <div
          className="viz-tooltip"
          style={{ left: hover.x, top: hover.y }}
          role="status"
        >
          <div className="font-semibold mb-1">{hover.state.name}</div>
          <TipRow
            label="Customers"
            value={fullNumber(hover.state.customers)}
          />
          <TipRow label="MRR" value={`${money(hover.state.mrrCents)}/mo`} />
          <TipRow
            label="Consumers"
            value={
              hover.state.consumers === null
                ? "not tracked by state"
                : compactNumber(hover.state.consumers)
            }
            dim={hover.state.consumers === null}
          />
          <TipRow
            label={gmvWindowLabel ? `GMV · ${gmvWindowLabel}` : "GMV"}
            value={
              hover.state.gmvCents !== null
                ? compactMoney(hover.state.gmvCents)
                : (gmvUnavailable ?? "not tracked by state")
            }
            dim={hover.state.gmvCents === null}
          />
        </div>
      ) : null}
    </section>
  );
}

function TipRow({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="tip-label">{label}</span>
      <span className={dim ? "tip-dim" : "tip-value"}>{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Choropleth over real state geometry (Albers USA — Alaska and Hawaii are
 * inset at the lower left, at their own scale).
 *
 * Only states with customers are labelled; labelling all 51 turns the map into
 * a wall of text and buries the signal. Small states can't hold a label at all,
 * so those get one in the right margin with a leader line.
 */
function Choropleth({
  byCode,
  bin,
  onHover,
  onLeave,
}: {
  byCode: Map<string, StateCount>;
  bin: (n: number) => number;
  onHover: (e: React.PointerEvent | React.MouseEvent, s: StateCount) => void;
  onLeave: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        width="100%"
        className="chart-map"
        style={{ maxWidth: MAP_WIDTH }}
        role="img"
        aria-label="Map of the United States, states shaded by customer count"
      >
        {/* Shapes first, labels after, so no neighbour paints over a label. */}
        {Object.entries(STATE_PATHS).map(([code, d]) => {
          const stat = byCode.get(code);
          const count = stat?.customers ?? 0;
          const empty = count <= 0;
          return (
            <path
              key={code}
              d={d}
              fill={empty ? "var(--surface-2)" : step(bin(count))}
              stroke="var(--surface-1)"
              strokeWidth={1}
              strokeLinejoin="round"
              onPointerMove={(e) => (stat ? onHover(e, stat) : undefined)}
              onPointerDown={(e) => (stat ? onHover(e, stat) : undefined)}
              onMouseLeave={onLeave}
              // aria-label, not <title>: a <title> child makes the browser draw
              // its OWN tooltip on top of ours, so you get two overlapping
              // boxes. This keeps the shape named for assistive tech without
              // the duplicate.
              role="img"
              aria-label={`${STATE_NAMES[code] ?? code} — ${
                empty
                  ? "no customers"
                  : `${count} customer${count === 1 ? "" : "s"}`
              }`}
            />
          );
        })}

        {[...byCode.values()].map((stat) => {
          const b = bin(stat.customers);
          const pos = STATE_LABEL_POS[stat.code];
          if (!pos) return null;

          // Big enough to hold the label — set it straight on the shape.
          if (ROOMY.has(stat.code)) {
            return (
              <g key={stat.code} pointerEvents="none">
                <text
                  x={pos[0]}
                  y={pos[1] - 2}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill={ink(b)}
                >
                  {stat.code}
                </text>
                <text
                  x={pos[0]}
                  y={pos[1] + 12}
                  textAnchor="middle"
                  fontSize={12}
                  fill={ink(b)}
                  opacity={0.85}
                >
                  {stat.customers}
                </text>
              </g>
            );
          }

          // Too small — label in the margin, joined by a leader line.
          const out = OUTSET_LABEL_POS[stat.code];
          if (!out) return null;
          const leftOfLabel = out[0] > MAP_WIDTH / 2;
          return (
            <g key={stat.code} pointerEvents="none">
              <line
                x1={pos[0]}
                y1={pos[1]}
                x2={out[0] + (leftOfLabel ? -6 : 6)}
                y2={out[1] - 4}
                stroke="var(--axis)"
                strokeWidth={1}
              />
              <circle cx={pos[0]} cy={pos[1]} r={2} fill="var(--axis)" />
              <text
                x={out[0]}
                y={out[1]}
                textAnchor={leftOfLabel ? "end" : "start"}
                fontSize={12}
                fill="var(--text-secondary)"
              >
                <tspan fontWeight={600} fill="var(--text-primary)">
                  {stat.code}
                </tspan>
                <tspan dx={4}>{stat.customers}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScaleLegend({ bins }: { bins: Bin[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
      <span
        className="text-[11px] uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        Customers
      </span>
      {bins.map((b, i) => (
        <span key={`${b.min}-${b.max}`} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            style={{
              background: step(rampStep(i, bins.length)),
              width: 14,
              height: 10,
              borderRadius: 2,
              display: "block",
            }}
          />
          <span
            className="text-[11px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {b.min === b.max ? b.min : `${b.min}–${b.max}`}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            width: 14,
            height: 10,
            borderRadius: 2,
            display: "block",
          }}
        />
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          none
        </span>
      </span>
    </div>
  );
}

function Bars({
  data,
  onHover,
  onLeave,
}: {
  data: StateCount[];
  onHover: (e: React.PointerEvent | React.MouseEvent, s: StateCount) => void;
  onLeave: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(boxRef, 900);
  // Fixed viewBox sized to the column rather than to the bars, so the chart
  // fills the width the card gives it instead of stranding whitespace on the
  // right. The row cap is generous enough that a normal network shows in full;
  // the footnote only appears if it actually bites.
  const MAX_ROWS = 20;
  const top = data.slice(0, MAX_ROWS);
  const max = Math.max(1, ...top.map((d) => d.customers));
  const ticks = axisTicks(max, 4);
  const scaleMax = ticks[ticks.length - 1] || max;

  // Drawn at 1 unit = 1 pixel so the state names stay readable on a phone.
  const VB_W = Math.max(measured, 320);
  const rowH = 28;
  const barH = 15;
  // The name column has to give ground on a narrow screen or there's no plot
  // left to draw into.
  const labelW = VB_W < 520 ? 96 : 150;
  const valueW = VB_W < 520 ? 40 : 54;
  const plotW = VB_W - labelW - valueW;
  const h = top.length * rowH + 24;

  return (
    <div className="mt-3 overflow-x-auto" ref={boxRef}>
      <svg
        viewBox={`0 0 ${VB_W} ${h}`}
        width="100%"
        className="chart-bars"
        role="img"
        aria-label="States ranked by customer count"
      >
        {ticks.map((t) => (
          <line
            key={t}
            className="gridline"
            x1={labelW + (t / scaleMax) * plotW}
            x2={labelW + (t / scaleMax) * plotW}
            y1={0}
            y2={top.length * rowH}
          />
        ))}

        {top.map((d, i) => {
          const y = i * rowH + (rowH - barH) / 2;
          const bw = Math.max(2, (d.customers / scaleMax) * plotW);
          return (
            <g
              key={d.code}
              onPointerMove={(e) => onHover(e, d)}
              onPointerDown={(e) => onHover(e, d)}
              onMouseLeave={onLeave}
            >
              <rect
                x={0}
                y={i * rowH}
                width={VB_W}
                height={rowH}
                fill="transparent"
              />
              <text
                x={labelW - 10}
                y={i * rowH + rowH / 2 + 4}
                textAnchor="end"
                fontSize={12.5}
                fill="var(--text-secondary)"
              >
                {d.name}
              </text>
              <path
                d={roundedRightBar(labelW, y, bw, barH, 4)}
                fill="var(--series-1)"
              />
              <text
                x={labelW + bw + 8}
                y={i * rowH + rowH / 2 + 4}
                fontSize={12.5}
                fontWeight={600}
                fill="var(--text-primary)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {d.customers}
              </text>
            </g>
          );
        })}

        <line
          className="baseline"
          x1={labelW}
          x2={labelW}
          y1={0}
          y2={top.length * rowH}
        />
        {ticks.map((t) => (
          <text
            key={t}
            className="axis-text"
            x={labelW + (t / scaleMax) * plotW}
            y={top.length * rowH + 16}
            textAnchor="middle"
          >
            {t}
          </text>
        ))}
      </svg>
      {data.length > top.length ? (
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          Showing the top {top.length} of {data.length} states — the table view
          has all of them.
        </p>
      ) : null}
    </div>
  );
}

function Table({ data }: { data: StateCount[] }) {
  return (
    <div className="mt-3 max-h-[420px] overflow-y-auto">
      <table className="dataview">
        <thead>
          <tr>
            <th>State</th>
            <th className="num">Customers</th>
            <th className="num">MRR</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.code}>
              <td>{d.name}</td>
              <td className="num">{fullNumber(d.customers)}</td>
              <td className="num">{money(d.mrrCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    ["map", "Map"],
    ["bars", "Bars"],
    ["table", "Table"],
  ];
  return (
    <div className="seg" role="tablist" aria-label="Chart view">
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

/** Bar with a 4px rounded data-end and a square baseline end. */
function roundedRightBar(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
}
