"use client";

import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";

const EVENT = "pyrotree-theme-change";
const KEY = "pyrotree-theme";

/**
 * Stamps data-theme on <html>; the CSS gives that scope priority over the OS.
 * localStorage is the source of truth and is read through useSyncExternalStore,
 * so there's no mount-time setState. The inline script in layout.tsx has
 * already applied the saved theme before first paint.
 */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as Mode);

  const next: Mode =
    mode === "system" ? "light" : mode === "light" ? "dark" : "system";

  const change = () => {
    localStorage.setItem(KEY, next);
    apply(next);
    window.dispatchEvent(new Event(EVENT));
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

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readMode(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}
