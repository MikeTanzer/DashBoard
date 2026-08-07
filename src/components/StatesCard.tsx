"use client";

import { useMemo, useRef, useState } from "react";
import type { StateCount } from "@/lib/metrics";
import { STATE_NAMES } from "@/lib/states";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  OUTSET_LABEL_POS,
  ROOMY,
  STATE_LABEL_POS,
  STATE_PATHS,
} from "@/lib/us-map";
import { axisTicks, fullNumber, money } from "@/lib/format";

type View = "map" | "bars" | "table";

interface Props {
  data: StateCount[];
  customersWithoutState: number;
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

  /** Ramp step number for a count, or 0 for "no customers here". */
  const bin = (count: number) => {
    if (count <= 0) return 0;
    const i = bins.findIndex((b) => count >= b.min && count <= b.max);
    return rampStep(i < 0 ? bins.length - 1 : i, bins.length);
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
          <Choropleth byCode={byCode} bin={bin} onHover={showTip} onLeave={() => setHover(null)} />
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
  onHover: (e: React.MouseEvent, s: StateCount) => void;
  onLeave: () => void;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        width="100%"
        style={{ maxWidth: MAP_WIDTH, minWidth: 620 }}
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
              onMouseMove={(e) => (stat ? onHover(e, stat) : undefined)}
              onMouseLeave={onLeave}
            >
              {/* One expression, not two children — adjacent text nodes
                  serialize differently on the server and break hydration. */}
              <title>
                {`${STATE_NAMES[code] ?? code} — ${
                  empty
                    ? "no customers"
                    : `${count} customer${count === 1 ? "" : "s"}`
                }`}
              </title>
            </path>
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
