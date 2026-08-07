"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Platform } from "@/lib/types";

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
}: {
  platforms: Platform[];
  selected: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const all = selected.length === 0;

  const setPlatforms = (next: string[]) => {
    const query = next.length ? `?platform=${next.join(",")}` : "";
    startTransition(() => router.push(`/${query}`, { scroll: false }));
  };

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setPlatforms(next.length === platforms.length ? [] : next);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      style={{ opacity: pending ? 0.6 : 1, transition: "opacity 120ms" }}
    >
      <span
        className="text-[11px] uppercase tracking-wider font-medium mr-1"
        style={{ color: "var(--text-muted)" }}
      >
        Platform
      </span>

      <Chip active={all} onClick={() => setPlatforms([])}>
        All platforms
      </Chip>

      {platforms.map((p) => (
        <Chip
          key={p.id}
          active={!all && selected.includes(p.id)}
          onClick={() => toggle(p.id)}
        >
          {p.name}
        </Chip>
      ))}
    </div>
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
      className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
      style={{
        border: `1px solid ${active ? "transparent" : "var(--border)"}`,
        background: active ? "var(--text-primary)" : "transparent",
        color: active ? "var(--page)" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}
