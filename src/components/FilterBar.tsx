"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Platform } from "@/lib/types";
import { DEFAULT_RANGE, defaultBucket, RANGES, type Grain, type RangeId } from "@/lib/range";
import { PlatformLogo, hasPlatformLogo } from "./PlatformLogo";

/**
 * One filter row above everything it scopes — every card re-renders against the
 * same slice. State lives in the URL so a filtered view is shareable.
 *
 * The current selection arrives as a prop rather than via `useSearchParams`.
 * That hook makes the nearest Suspense boundary fall back during SSR, so the
 * server would ship the fallback while the client rendered the real bar —
 * a guaranteed hydration mismatch. The page already reads searchParams; passing
 * the value down keeps both renders identical.
 */
export function FilterBar({
  platforms,
  selected,
  range,
  from,
  to,
  bucket,
}: {
  platforms: Platform[];
  selected: string[];
  /** Carried through so changing platform doesn't reset the time range. */
  range: RangeId;
  /** Custom-range bounds, carried for the same reason. */
  from?: string;
  to?: string;
  /** Bucket size, carried so changing platform doesn't reset the chart grain. */
  bucket?: Grain;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const all = selected.length === 0;

  const setPlatforms = (next: string[]) => {
    const params = new URLSearchParams();
    if (next.length) params.set("platform", next.join(","));
    if (range !== DEFAULT_RANGE) params.set("range", range);
    if (range === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    // Only carry the bucket when it isn't what this window would pick anyway,
    // so the URL stays short for the common case.
    const spec = RANGES.find((r) => r.id === range);
    if (bucket && spec && bucket !== defaultBucket(spec)) {
      params.set("grain", bucket);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/", { scroll: false }));
  };

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setPlatforms(next.length === platforms.length ? [] : next);
  };

  return (
    <div
      className="control-scroll flex flex-wrap items-center gap-2"
      style={{ opacity: pending ? 0.6 : 1, transition: "opacity 120ms" }}
    >
      <span className="eyebrow mr-1">Platform</span>

      <Chip active={all} onClick={() => setPlatforms([])}>
        <AllMark />
        All platforms
      </Chip>

      {platforms.map((p) =>
        // Where we hold the real wordmark, it IS the label — repeating the name
        // beside it just says the same thing twice.
        hasPlatformLogo(p.id) ? (
          <Chip
            key={p.id}
            active={!all && selected.includes(p.id)}
            onClick={() => toggle(p.id)}
          >
            <PlatformLogo platform={p.id} />
          </Chip>
        ) : (
          <Chip
            key={p.id}
            active={!all && selected.includes(p.id)}
            onClick={() => toggle(p.id)}
          >
            {p.name}
          </Chip>
        ),
      )}
    </div>
  );
}

/** Two overlapping marks, standing for "more than one platform". */
function AllMark({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 17 17"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <rect x="0" y="0" width="12" height="12" rx="3.6" fill="#1f3155" />
      <rect
        x="5"
        y="5"
        width="12"
        height="12"
        rx="3.6"
        fill="#e1639c"
        stroke="var(--chip-bg, #fff)"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="chip flex items-center gap-2"
    >
      {children}
    </button>
  );
}
