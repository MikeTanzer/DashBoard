"use client";

import { useMemo, useRef, useState } from "react";
import type { StateCount } from "@/lib/metrics";
import { GRID_COLS, GRID_ROWS, STATE_GRID } from "@/lib/states";
import { axisTicks, fullNumber, money } from "@/lib/format";

type View = "map" | "bars" | "table";

interface Props {
  data: StateCount[];
  customersWithoutState: number;
}

/** Five sequential steps, one hue. Zero-customer states stay on the surface. */
const RAMP = [
  "var(--seq-100)",
  "var(--seq-200)",
  "var(--seq-400)",
  "var(--seq-600)",
  "var(--seq-700)",
];

/**
 * Ink for a tile label, picked per step so it clears contrast in BOTH modes.
 * The ramp inverts in dark mode (low values recede toward the dark surface), so
 * the safe ink flips with it — hence the CSS variable rather than a fixed hex.
 */
const RAMP_INK = [
  "var(--ink-on-seq-100)",
  "var(--ink-on-seq-200)",
  "var(--ink-on-seq-400)",
  "var(--ink-on-seq-600)",
  "var(--ink-on-seq-700)",
];

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

/** Spread however many bins we ended up with across the five ramp steps. */
function rampIndex(binIdx: number, binCount: number): number {
  if (binCount <= 1) return 4;
  return Math.round((binIdx / (binCount - 1)) * 4);
}

export function StatesCard({ data, customersWithoutState }: Props) {
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

  /** Ramp step 0..4 for a count, or -1 for "no customers here". */
  const bin = (count: number) => {
    if (count <= 0) return -1;
    const i = bins.findIndex((b) => count >= b.min && count <= b.max);
    return rampIndex(i < 0 ? bins.length - 1 : i, bins.length);
  };

  const showTip = (e: React.MouseEvent, state: StateCount) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      state,
    });
  };

  return (
    <section className="card p-5" ref={wrapRef} style={{ position: "relative" }}>
      <header className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold">Customers by state</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {data.length} state{data.length === 1 ? "" : "s"} with at least one
            customer
            {customersWithoutState > 0
              ? ` · ${customersWithoutState} customer${customersWithoutState === 1 ? "" : "s"} missing a state`
              : ""}
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </header>

      {view === "map" ? (
        <>
          <Cartogram byCode={byCode} bin={bin} onHover={showTip} onLeave={() => setHover(null)} />
          <ScaleLegend bins={bins} />
        </>
      ) : view === "bars" ? (
        <Bars data={data} onHover={showTip} onLeave={() => setHover(null)} />
      ) : (
        <Table data={data} />
      )}

      {hover && view !== "table" ? (
        <div
          className="viz-tooltip"
          style={{ left: hover.x, top: hover.y }}
          role="status"
        >
          <div className="font-semibold">{hover.state.name}</div>
          <div style={{ color: "var(--text-secondary)" }}>
            {fullNumber(hover.state.customers)} customer
            {hover.state.customers === 1 ? "" : "s"} ·{" "}
            {money(hover.state.mrrCents)}/mo
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const TILE = 40;
const GAP = 4;

function Cartogram({
  byCode,
  bin,
  onHover,
  onLeave,
}: {
  byCode: Map<string, StateCount>;
  bin: (n: number) => number;
  onHover: (e: React.MouseEvent, s: StateCount) => void;
  onLeave: () => void;
}) {
  const w = GRID_COLS * (TILE + GAP);
  const h = GRID_ROWS * (TILE + GAP);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        style={{ maxWidth: w, minWidth: 560 }}
        role="img"
        aria-label="Grid map of US states shaded by customer count"
      >
        {STATE_GRID.map((cell) => {
          const stat = byCode.get(cell.code);
          const count = stat?.customers ?? 0;
          const b = bin(count);
          const empty = b < 0;
          const x = cell.col * (TILE + GAP);
          const y = cell.row * (TILE + GAP);
          return (
            <g
              key={cell.code}
              onMouseMove={(e) =>
                stat ? onHover(e, stat) : undefined
              }
              onMouseLeave={onLeave}
              style={{ cursor: stat ? "default" : "default" }}
            >
              <rect
                x={x}
                y={y}
                width={TILE}
                height={TILE}
                rx={5}
                fill={empty ? "var(--surface-2)" : RAMP[b]}
                stroke={empty ? "var(--border)" : "none"}
                strokeWidth={1}
              />
              <text
                x={x + TILE / 2}
                y={y + TILE / 2 - 3}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={empty ? "var(--text-muted)" : RAMP_INK[b]}
              >
                {cell.code}
              </text>
              {!empty ? (
                <text
                  x={x + TILE / 2}
                  y={y + TILE / 2 + 11}
                  textAnchor="middle"
                  fontSize={10}
                  fill={RAMP_INK[b]}
                  opacity={0.85}
                >
                  {count}
                </text>
              ) : null}
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
              background: RAMP[rampIndex(i, bins.length)],
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
  onHover: (e: React.MouseEvent, s: StateCount) => void;
  onLeave: () => void;
}) {
  const top = data.slice(0, 12);
  const max = Math.max(1, ...top.map((d) => d.customers));
  const ticks = axisTicks(max, 4);
  const scaleMax = ticks[ticks.length - 1] || max;

  const rowH = 26;
  const barH = 14;
  const labelW = 116;
  const valueW = 44;
  const plotW = 420;
  const w = labelW + plotW + valueW;
  const h = top.length * rowH + 22;

  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        style={{ maxWidth: w, minWidth: 520 }}
        role="img"
        aria-label="Top states by customer count"
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
              onMouseMove={(e) => onHover(e, d)}
              onMouseLeave={onLeave}
            >
              <rect
                x={0}
                y={i * rowH}
                width={w}
                height={rowH}
                fill="transparent"
              />
              <text
                x={labelW - 8}
                y={i * rowH + rowH / 2 + 4}
                textAnchor="end"
                fontSize={12}
                fill="var(--text-secondary)"
              >
                {d.name}
              </text>
              <path
                d={roundedRightBar(labelW, y, bw, barH, 4)}
                fill="var(--series-1)"
              />
              <text
                x={labelW + bw + 7}
                y={i * rowH + rowH / 2 + 4}
                fontSize={12}
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
            y={top.length * rowH + 14}
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
          className="px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: view === id ? "var(--surface-2)" : "transparent",
            color:
              view === id ? "var(--text-primary)" : "var(--text-secondary)",
          }}
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
