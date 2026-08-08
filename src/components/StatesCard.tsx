"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RecencyBand, StateCount } from "@/lib/metrics";
import type { Metric } from "@/lib/types";
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

/** Which population the map, bars and table are measuring. */
type Dimension = "customers" | "consumers";

interface Props {
  data: StateCount[];
  customersWithoutState: number;
  /** Window label for the GMV row, so the period is never ambiguous. */
  gmvWindowLabel?: string;
  /** Set when per-state GMV can't be shown, with the reason. */
  gmvUnavailable?: string | null;
  /** Consumer recency, shown as an inset panel over the map's empty corner. */
  recency?: RecencyBand[];
  /**
   * The same breakdown per state, keyed by USPS code. Selecting a state on the
   * map, bars or table swaps the panel over to its entry.
   */
  recencyByState?: Record<string, Metric<RecencyBand[]>>;
  /** Set when the source can't break recency down by state, with the reason. */
  stateRecencyUnavailable?: string | null;
  /** Customer-side counterpart to recency: how long each has been a customer. */
  tenure?: RecencyBand[];
  /** Tenure scoped to one state, keyed by USPS code. */
  tenureByState?: Record<string, Metric<RecencyBand[]>>;
  /** Calendar months the window covers, for the per-month tooltip rows. */
  windowMonthCount?: number;
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
  recencyByState,
  stateRecencyUnavailable,
  tenure,
  tenureByState,
  gmvWindowLabel,
  gmvUnavailable,
  windowMonthCount = 0,
}: Props) {
  const [view, setView] = useState<View>("map");
  const [dim, setDim] = useState<Dimension>("customers");
  const [rawPicked, setPicked] = useState<string | null>(null);

  /**
   * Consumers per state only exist when the source groups them that way. If
   * nothing does, the toggle is disabled rather than switching to a map of
   * zeroes — an all-empty choropleth reads as "no shoppers anywhere" rather
   * than "not measured".
   */
  const hasConsumerDim = data.some((d) => d.consumers !== null);
  const activeDim: Dimension = hasConsumerDim ? dim : "customers";

  const valueOf = (d: StateCount) =>
    activeDim === "customers" ? d.customers : (d.consumers ?? 0);

  // Re-sorted per dimension: the ranking that matters for bars and the table
  // is the one being measured, and the biggest customer state is not
  // necessarily the biggest consumer state.
  const ranked = useMemo(
    () =>
      [...data].sort((a, b) =>
        activeDim === "customers"
          ? b.customers - a.customers
          : (b.consumers ?? 0) - (a.consumers ?? 0),
      ),
    [data, activeDim],
  );
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
  // Bins follow the active dimension — customer counts run 1-42 while consumer
  // counts run into the hundreds of thousands, so one set of breaks cannot
  // serve both.
  const bins = useMemo(
    () =>
      makeBins(
        data.map((d) =>
          activeDim === "customers" ? d.customers : (d.consumers ?? 0),
        ),
      ),
    [data, activeDim],
  );

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

  /** Clicking the selected state again clears it, so the map is its own toggle. */
  const pick = (code: string) =>
    setPicked((cur) => (cur === code ? null : code));

  // Changing the platform filter can drop a state from the data entirely.
  // Derived rather than cleared in an effect: a selection that isn't in `data`
  // is simply not active, so there's no render where the chip names a state
  // the map no longer shows. Switching back to a platform that has the state
  // restores the selection, which is what you'd want from a filter anyway.
  const picked = rawPicked && data.some((d) => d.code === rawPicked)
    ? rawPicked
    : null;

  /**
   * What the recency panel renders. A selected state swaps in that state's
   * breakdown; if the source doesn't carry per-state purchasers, the panel says
   * so rather than showing national figures under a state's name — which would
   * be a wrong number, not a missing one.
   */
  const isCustomerDim = activeDim === "customers";

  const panel: {
    bands?: RecencyBand[];
    needs?: string;
  } = !picked
    ? { bands: isCustomerDim ? tenure : recency }
    : isCustomerDim
      ? (() => {
          const t = tenureByState?.[picked];
          if (!t) return { needs: `No customers in ${picked}.` };
          return t.available ? { bands: t.value } : { needs: t.needs };
        })()
      : stateRecencyUnavailable
        ? { needs: stateRecencyUnavailable }
        : (() => {
            const m = recencyByState?.[picked];
            if (!m) return { needs: `No consumer records for ${picked}.` };
            return m.available ? { bands: m.value } : { needs: m.needs };
          })();

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
        <h2 className="text-[15px] font-bold">
          {activeDim === "customers" ? "Customers" : "Consumers"} by state
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {activeDim === "customers" ? (
            <>
              {/* Counted, not data.length: the list now also carries states
                  that hold shoppers but no customer. */}
              {data.filter((d) => d.customers > 0).length} state
              {data.filter((d) => d.customers > 0).length === 1 ? "" : "s"} with
              at least one customer
              {customersWithoutState > 0
                ? ` · ${customersWithoutState} customer${customersWithoutState === 1 ? "" : "s"} missing a state`
                : ""}
            </>
          ) : (
            <>
              {fullNumber(
                data.reduce((a, d) => a + (d.consumers ?? 0), 0),
              )}{" "}
              tracked shoppers across {data.filter((d) => (d.consumers ?? 0) > 0).length}{" "}
              states · they shop on our customers&apos; storefronts
            </>
          )}
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
                valueOf={valueOf}
                dim={activeDim}
                onHover={showTip}
                onLeave={() => setHover(null)}
                picked={picked}
                onPick={pick}
              />
              <ScaleLegend bins={bins} dim={activeDim} />
            </>
          ) : view === "bars" ? (
            <Bars
              data={ranked}
              valueOf={valueOf}
              dim={activeDim}
              onHover={showTip}
              onLeave={() => setHover(null)}
              picked={picked}
              onPick={pick}
            />
          ) : (
            <Table
              data={ranked}
              dim={activeDim}
              hasConsumers={hasConsumerDim}
              picked={picked}
              onPick={pick}
            />
          )}
        </div>

        <aside className="states-side">
          <div className="seg" role="tablist" aria-label="Measure">
            <button
              role="tab"
              aria-selected={activeDim === "customers"}
              onClick={() => setDim("customers")}
            >
              Customers
            </button>
            <button
              role="tab"
              aria-selected={activeDim === "consumers"}
              onClick={() => hasConsumerDim && setDim("consumers")}
              disabled={!hasConsumerDim}
              title={
                hasConsumerDim
                  ? "Shoppers on our customers' storefronts"
                  : "No source breaks consumers down by state yet — add a consumersByState map to the consumer rollup."
              }
              style={hasConsumerDim ? undefined : { opacity: 0.45 }}
            >
              Consumers
            </button>
          </div>

          <ViewToggle view={view} onChange={setView} />

          {(isCustomerDim ? tenure?.length : recency?.length) ? (
            <div
              className="recency-panel"
              aria-label={isCustomerDim ? "Customer tenure" : "Consumer recency"}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-[12px] font-bold">
                  {isCustomerDim ? "Customer tenure" : "Consumer recency"}
                </h3>
                {picked ? (
                  <StateChip
                    code={picked}
                    onClear={() => setPicked(null)}
                  />
                ) : null}
              </div>

              {panel.bands?.length ? (
                <ConsumerPie
                  bands={panel.bands}
                  inset
                  totalLabel={isCustomerDim ? "Customers" : "Tracked"}
                />
              ) : (
                <p
                  className="text-[11px] leading-snug py-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  {panel.needs ??
                    (isCustomerDim
                      ? "No customers in this state."
                      : "No consumer data for this state.")}
                </p>
              )}

              <p
                className="text-[10px] mt-2 leading-snug"
                style={{ color: "var(--text-muted)" }}
              >
                {isCustomerDim
                  ? "How long each customer has been with us."
                  : "Shoppers on our customers' storefronts. Aggregate counts only."}
                {picked ? null : " Select a state to scope this panel."}
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

          {/* Two groups, split by a rule: what WE bill above, what shoppers
              spend on our customers' storefronts below. The two are an order of
              magnitude apart and mixing them in one list invited reading a GMV
              figure as revenue. */}
          <TipRow
            label="Customers"
            value={fullNumber(hover.state.customers)}
          />
          <TipRow label="MRR" value={`${money(hover.state.mrrCents)}/mo`} />
          <TipRow
            label={
              windowMonthCount > 0
                ? `Revenue · ${gmvWindowLabel ?? "window"} (est.)`
                : "Revenue (est.)"
            }
            // NOT a collected figure: revenue isn't broken down by state
            // anywhere in the data, so this is the recurring rate projected
            // across the window. Marked "est." because usage billing varies
            // month to month and this can't see that.
            value={
              windowMonthCount > 0
                ? compactMoney(hover.state.mrrCents * windowMonthCount)
                : "needs a longer window"
            }
            dim={windowMonthCount === 0}
          />

          <div className="tip-rule" />

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
            label="GMV · monthly avg"
            value={
              hover.state.gmvCents !== null && windowMonthCount > 0
                ? compactMoney(hover.state.gmvCents / windowMonthCount)
                : hover.state.gmvCents === null
                  ? (gmvUnavailable ?? "not tracked by state")
                  : "needs a full month"
            }
            dim={hover.state.gmvCents === null || windowMonthCount === 0}
          />
          <TipRow
            label={gmvWindowLabel ? `GMV · ${gmvWindowLabel}` : "GMV total"}
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
  valueOf,
  dim,
  onHover,
  onLeave,
  picked,
  onPick,
}: {
  byCode: Map<string, StateCount>;
  bin: (n: number) => number;
  valueOf: (d: StateCount) => number;
  dim: Dimension;
  onHover: (e: React.PointerEvent | React.MouseEvent, s: StateCount) => void;
  onLeave: () => void;
  picked: string | null;
  onPick: (code: string) => void;
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
          const count = stat ? valueOf(stat) : 0;
          const empty = count <= 0;
          return (
            <path
              key={code}
              d={d}
              fill={empty ? "var(--surface-2)" : step(bin(count))}
              stroke="var(--surface-1)"
              strokeWidth={1}
              strokeLinejoin="round"
              style={stat ? { cursor: "pointer" } : undefined}
              onClick={() => (stat ? onPick(code) : undefined)}
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
                  ? `no ${dim}`
                  : `${count} ${count === 1 ? dim.slice(0, -1) : dim}`
              }`}
            />
          );
        })}

        {/* The selection outline is a separate pass, drawn after every shape.
            Widening the stroke on the state's own path would let any neighbour
            rendered later paint over half of it — the states share borders and
            the fills are opaque. Selected state is outlined rather than
            recoloured so its fill still reads against the same scale. */}
        {picked && STATE_PATHS[picked] ? (
          <path
            d={STATE_PATHS[picked]}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth={2.25}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ) : null}

        {[...byCode.values()].map((stat) => {
          const b = bin(valueOf(stat));
          const pos = STATE_LABEL_POS[stat.code];
          if (!pos) return null;

          // Big enough to hold the label — set it straight on the shape.
          if (ROOMY.has(stat.code)) {
            return (
              <g key={stat.code} className="map-label" pointerEvents="none">
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
                  {dim === "customers" ? stat.customers : compactNumber(valueOf(stat))}
                </text>
              </g>
            );
          }

          // Too small — label in the margin, joined by a leader line.
          const out = OUTSET_LABEL_POS[stat.code];
          if (!out) return null;
          const leftOfLabel = out[0] > MAP_WIDTH / 2;
          return (
            <g key={stat.code} className="map-label" pointerEvents="none">
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
                <tspan dx={4}>
                  {dim === "customers" ? stat.customers : compactNumber(valueOf(stat))}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
      {/* Shown only where the labels are suppressed, so the numbers they
          carried are still one tap away rather than simply missing. */}
      <p
        className="hidden max-[640px]:block text-[11px] mt-2"
        style={{ color: "var(--text-muted)" }}
      >
        Tap a state for its figures, or switch to Bars or Table for the ranked
        list.
      </p>
    </div>
  );
}

/**
 * The active state filter, with its own clear button.
 *
 * The X is a real nested <button>, not an onClick on the chip: the chip names
 * what's being filtered and the X removes it, and collapsing both into one
 * control would mean the only way to clear a state is to click the thing that
 * says it's selected.
 */
function StateChip({ code, onClear }: { code: string; onClear: () => void }) {
  const name = STATE_NAMES[code] ?? code;
  return (
    <span className="state-chip">
      {name}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${name} — show all states`}
        title={`Clear ${name}`}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <path
            d="M1 1l7 7M8 1l-7 7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

function ScaleLegend({ bins, dim }: { bins: Bin[]; dim: Dimension }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
      <span
        className="text-[11px] uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {dim === "customers" ? "Customers" : "Consumers"}
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
            {dim === "customers"
              ? b.min === b.max
                ? b.min
                : `${b.min}–${b.max}`
              : b.min === b.max
                ? compactNumber(b.min)
                : `${compactNumber(b.min)}–${compactNumber(b.max)}`}
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
  valueOf,
  dim,
  onHover,
  onLeave,
  picked,
  onPick,
}: {
  data: StateCount[];
  valueOf: (d: StateCount) => number;
  dim: Dimension;
  onHover: (e: React.PointerEvent | React.MouseEvent, s: StateCount) => void;
  onLeave: () => void;
  picked: string | null;
  onPick: (code: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(boxRef, 900);
  // Fixed viewBox sized to the column rather than to the bars, so the chart
  // fills the width the card gives it instead of stranding whitespace on the
  // right. The row cap is generous enough that a normal network shows in full;
  // the footnote only appears if it actually bites.
  const MAX_ROWS = 20;
  const top = data.slice(0, MAX_ROWS);
  const max = Math.max(1, ...top.map(valueOf));
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
          const bw = Math.max(2, (valueOf(d) / scaleMax) * plotW);
          return (
            <g
              key={d.code}
              style={{ cursor: "pointer" }}
              onClick={() => onPick(d.code)}
              onPointerMove={(e) => onHover(e, d)}
              onPointerDown={(e) => onHover(e, d)}
              onMouseLeave={onLeave}
            >
              <rect
                x={0}
                y={i * rowH}
                width={VB_W}
                height={rowH}
                rx={6}
                fill={
                  picked === d.code ? "var(--surface-2)" : "transparent"
                }
              />
              <text
                x={labelW - 10}
                y={i * rowH + rowH / 2 + 4}
                textAnchor="end"
                fontSize={12.5}
                fontWeight={picked === d.code ? 700 : 400}
                fill={
                  picked === d.code
                    ? "var(--text-primary)"
                    : "var(--text-secondary)"
                }
              >
                {d.name}
              </text>
              <path
                d={roundedRightBar(labelW, y, bw, barH, 4)}
                fill="var(--series-1)"
                opacity={picked && picked !== d.code ? 0.45 : 1}
              />
              <text
                x={labelW + bw + 8}
                y={i * rowH + rowH / 2 + 4}
                fontSize={12.5}
                fontWeight={600}
                fill="var(--text-primary)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {dim === "customers" ? d.customers : compactNumber(valueOf(d))}
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

function Table({
  data,
  dim,
  hasConsumers,
  picked,
  onPick,
}: {
  data: StateCount[];
  dim: Dimension;
  hasConsumers: boolean;
  picked: string | null;
  onPick: (code: string) => void;
}) {
  return (
    <div className="mt-3 max-h-[420px] overflow-y-auto">
      <table className="dataview">
        <thead>
          <tr>
            <th>State</th>
            {/* Both populations stay in the table whichever one is selected —
                comparing them is the point of a table. The active one leads. */}
            <th className="num">
              {dim === "customers" ? "Customers" : "Consumers"}
            </th>
            {hasConsumers ? (
              <th className="num">
                {dim === "customers" ? "Consumers" : "Customers"}
              </th>
            ) : null}
            <th className="num">MRR</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            // The row itself is the control. A <button> in the first cell
            // would only make the state's name clickable, and the obvious
            // thing to click for "show me this state" is the row.
            <tr
              key={d.code}
              onClick={() => onPick(d.code)}
              aria-selected={picked === d.code}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(d.code);
                }
              }}
              className="row-pick"
            >
              <td>{d.name}</td>
              <td className="num">
                {dim === "customers"
                  ? fullNumber(d.customers)
                  : compactNumber(d.consumers ?? 0)}
              </td>
              {hasConsumers ? (
                <td className="num">
                  {dim === "customers"
                    ? compactNumber(d.consumers ?? 0)
                    : fullNumber(d.customers)}
                </td>
              ) : null}
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
