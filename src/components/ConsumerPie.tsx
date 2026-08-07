"use client";

import { useRef, useState } from "react";
import type { RecencyBand } from "@/lib/metrics";
import { compactNumber, fullNumber, percent } from "@/lib/format";

type View = "chart" | "table";

/**
 * How the consumer base breaks down by last purchase.
 *
 * A donut rather than a flat pie: the hole carries the total, which is the one
 * number the old funnel showed that slices alone would lose.
 *
 * Slices are mutually exclusive by construction (see RecencyBand) — the
 * source's own purchaser windows are nested, and plotting those directly would
 * count the same shopper in every window they fall inside.
 *
 * Bands are ordered, not nominal, so they take the sequential ramp rather than
 * categorical hues; "never purchased" sits outside that order and gets a
 * neutral. Every slice is direct-labelled in the legend, so nothing is
 * reachable only by hovering.
 */
export function ConsumerPie({
  bands,
  inset = false,
}: {
  bands: RecencyBand[];
  /** Compact form for the map corner: smaller ring, tighter legend, no toggle. */
  inset?: boolean;
}) {
  const [view, setView] = useState<View>("chart");
  const [active, setActive] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const total = bands.reduce((a, b) => a + b.value, 0);

  const SIZE = inset ? 150 : 230;
  const R = inset ? 66 : 100;
  const INNER = inset ? 40 : 62;
  const C = SIZE / 2;
  const GAP = 0.012; // radians of surface between slices, in place of a stroke

  // Cumulative offsets computed up front rather than mutated inside map() —
  // a closure variable reassigned during render is a lint error and would
  // misbehave if React ever re-ran the mapper.
  const slices = bands.map((b, i) => {
    const before = bands.slice(0, i).reduce((a, x) => a + x.value, 0);
    const startAngle = -Math.PI / 2 + (before / total) * Math.PI * 2;
    const sweep = (b.value / total) * Math.PI * 2;
    const start = startAngle + GAP / 2;
    const end = startAngle + sweep - GAP / 2;
    return { band: b, start, end: Math.max(start, end) };
  });

  const fill = (b: RecencyBand) =>
    b.step === null ? "var(--surface-sunken)" : `var(--seq-${b.step})`;

  const move = (e: React.MouseEvent, key: string) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setActive(key);
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const hovered = bands.find((b) => b.key === active);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div className={`flex justify-end mb-1 ${inset ? "hidden" : ""}`}>
        <div className="seg" role="tablist" aria-label="Breakdown view">
          {(
            [
              ["chart", "Chart"],
              ["table", "Table"],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "chart" ? (
        <div
          className={
            inset
              ? "flex flex-col items-center gap-2"
              : "flex flex-wrap items-center gap-x-10 gap-y-6"
          }
        >
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label="Consumer base by how recently they last purchased"
            style={{ flexShrink: 0 }}
            onMouseLeave={() => {
              setActive(null);
              setTip(null);
            }}
          >
            {slices.map(({ band, start, end }) => (
              <path
                key={band.key}
                d={ringSlice(C, C, R, INNER, start, end)}
                fill={fill(band)}
                opacity={active && active !== band.key ? 0.45 : 1}
                style={{ transition: "opacity 130ms ease" }}
                onMouseMove={(e) => move(e, band.key)}
              />
            ))}

            <text
              x={C}
              y={C - (inset ? 3 : 6)}
              textAnchor="middle"
              className="display"
              style={{ fontSize: inset ? 19 : 26, fill: "var(--text-primary)" }}
            >
              {compactNumber(total)}
            </text>
            <text
              x={C}
              y={C + (inset ? 12 : 14)}
              textAnchor="middle"
              style={{
                fontSize: inset ? 9 : 11,
                fill: "var(--text-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Tracked
            </text>
          </svg>

          <ul
            className={
              inset
                ? "flex flex-col gap-1 w-full"
                : "flex flex-col gap-2.5 min-w-[240px] flex-1"
            }
          >
            {bands.map((b) => (
              <li
                key={b.key}
                className={`flex items-center ${inset ? "gap-2 text-[11px]" : "gap-3 text-[13px]"}`}
                onMouseEnter={() => setActive(b.key)}
                onMouseLeave={() => setActive(null)}
                style={{
                  opacity: active && active !== b.key ? 0.5 : 1,
                  transition: "opacity 130ms ease",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    background: fill(b),
                    width: inset ? 9 : 12,
                    height: inset ? 9 : 12,
                    borderRadius: inset ? 3 : 4,
                    flexShrink: 0,
                    border:
                      b.step === null ? "1px solid var(--border)" : undefined,
                  }}
                />
                <span
                  className="flex-1 min-w-0"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {b.label}
                </span>
                <span
                  className="font-semibold"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {compactNumber(b.value)}
                </span>
                <span
                  className={inset ? "w-[38px] text-right" : "w-[46px] text-right"}
                  style={{
                    color: "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {percent(b.share, 1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <table className="dataview mt-2">
          <thead>
            <tr>
              <th>Last purchase</th>
              <th className="num">Consumers</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td className="num">{fullNumber(b.value)}</td>
                <td className="num">{percent(b.share, 1)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-semibold">Tracked consumers</td>
              <td className="num font-semibold">{fullNumber(total)}</td>
              <td className="num font-semibold">100.0%</td>
            </tr>
          </tbody>
        </table>
      )}

      {tip && hovered && view === "chart" ? (
        <div className="viz-tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="font-semibold mb-1">{hovered.label}</div>
          <div className="flex items-baseline justify-between gap-6">
            <span className="tip-label">Consumers</span>
            <span className="tip-value">{fullNumber(hovered.value)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <span className="tip-label">Share</span>
            <span className="tip-value">{percent(hovered.share, 1)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** An annulus wedge — outer arc out, inner arc back. */
function ringSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
): string {
  // A full circle can't be drawn with one arc (start and end coincide), so
  // nudge it just shy of 360°.
  const sweep = Math.min(end - start, Math.PI * 2 - 0.001);
  const e = start + sweep;
  const large = sweep > Math.PI ? 1 : 0;

  const x1 = cx + rOuter * Math.cos(start);
  const y1 = cy + rOuter * Math.sin(start);
  const x2 = cx + rOuter * Math.cos(e);
  const y2 = cy + rOuter * Math.sin(e);
  const x3 = cx + rInner * Math.cos(e);
  const y3 = cy + rInner * Math.sin(e);
  const x4 = cx + rInner * Math.cos(start);
  const y4 = cy + rInner * Math.sin(start);

  return [
    `M${x1},${y1}`,
    `A${rOuter},${rOuter} 0 ${large} 1 ${x2},${y2}`,
    `L${x3},${y3}`,
    `A${rInner},${rInner} 0 ${large} 0 ${x4},${y4}`,
    "Z",
  ].join(" ");
}
