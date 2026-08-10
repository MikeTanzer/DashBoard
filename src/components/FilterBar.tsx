"use client";

import type { Platform } from "@/lib/types";
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
  onChange,
}: {
  platforms: Platform[];
  selected: string[];
  /** Called with the new selection. The page owns the state and the URL. */
  onChange: (next: string[]) => void;
}) {
  const all = selected.length === 0;

  const setPlatforms = onChange;

  /**
   * Clicking a platform scopes the dashboard to that platform. Clicking the
   * one already showing clears back to the whole network.
   *
   * This used to ADD to the selection, which broke on a two-platform network:
   * from WebJoint, clicking Menu.com selected both — and "both of two" is the
   * same as "all", so it collapsed to All platforms. The chip appeared to do
   * nothing and you had to click it a second time to actually get there.
   *
   * Selecting an arbitrary subset only becomes meaningful at three or more
   * platforms, and it needs a control that says so; with a dedicated "All
   * platforms" chip sitting right there, accumulating on plain click reads as
   * a bug either way.
   */
  const toggle = (id: string) => {
    const only = selected.length === 1 && selected[0] === id;
    setPlatforms(only ? [] : [id]);
  };

  return (
    <div
      className="control-scroll flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Platform"

    >
      {/* No "Platform" label. The chips — All platforms, and the two
          wordmarks — say what they are without one, and the row reads cleaner
          starting on the control itself. The group is still named for
          assistive tech via aria-label below. */}
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
