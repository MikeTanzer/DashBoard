"use client";

import { useState } from "react";
import {
  THEME_COOKIE,
  THEME_MAX_AGE,
  type ThemeMode,
} from "@/lib/theme";

/**
 * Cycles system → light → dark.
 *
 * The choice lives in a cookie so the server can stamp `data-theme` on <html>
 * in the initial HTML — no bootstrap script, no flash, and no hydration
 * mismatch. The attribute is also updated here directly, so the switch is
 * instant rather than waiting on a round trip.
 */
export function ThemeToggle({ initial }: { initial: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initial);

  const next: ThemeMode =
    mode === "system" ? "light" : mode === "light" ? "dark" : "system";

  const change = () => {
    setMode(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_MAX_AGE}; samesite=lax`;
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  };

  return (
    <button
      onClick={change}
      title={`Theme: ${mode} — click for ${next}`}
      aria-label={`Theme: ${mode}. Switch to ${next}.`}
      className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
      style={{
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      {mode === "system" ? "Auto" : mode === "light" ? "Light" : "Dark"}
    </button>
  );
}
