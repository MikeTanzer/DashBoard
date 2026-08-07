"use client";

import { useEffect, useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";

const KEY = "pyrotree-theme";
const EVENT = "pyrotree-theme-change";

/**
 * Cycles system → light → dark, persisted in localStorage.
 *
 * A static export has no server, so the cookie approach (server stamps
 * data-theme into the HTML) isn't available — the attribute has to be applied
 * on the client. Read through useSyncExternalStore so there's no setState in an
 * effect, and applied in an effect because touching document during render is
 * not allowed. Someone whose choice differs from their OS setting sees one
 * frame of the OS theme first; that's the honest cost of having no server.
 */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }, [mode]);

  const next: Mode =
    mode === "system" ? "light" : mode === "light" ? "dark" : "system";

  return (
    <button
      onClick={() => {
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* private mode — the toggle still works for this session */
        }
        window.dispatchEvent(new Event(EVENT));
      }}
      title={`Theme: ${mode} — click for ${next}`}
      aria-label={`Theme: ${mode}. Switch to ${next}.`}
      className="ghost-btn"
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

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
