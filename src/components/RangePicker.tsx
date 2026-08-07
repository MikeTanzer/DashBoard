"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DEFAULT_RANGE, RANGES, type RangeId } from "@/lib/range";

/**
 * The time range lives in the URL, like the platform filter, so the server
 * computes every range-scoped figure in one place and a filtered view stays
 * shareable. Keeping it in component state would have scoped it to the chart
 * alone and let the tiles disagree with the headline.
 */
export function RangePicker({
  range,
  platform,
}: {
  range: RangeId;
  platform: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (next: RangeId) => {
    const params = new URLSearchParams();
    if (platform.length) params.set("platform", platform.join(","));
    if (next !== DEFAULT_RANGE) params.set("range", next);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/", { scroll: false }));
  };

  return (
    <div
      className="flex rounded-lg overflow-hidden"
      role="group"
      aria-label="Time range"
      style={{
        border: "1px solid var(--border)",
        opacity: pending ? 0.6 : 1,
        transition: "opacity 120ms",
      }}
    >
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => go(r.id)}
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
