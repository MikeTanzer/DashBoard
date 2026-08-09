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
      // The icon alone carries no meaning for a screen reader, so the state
      // and the next state both live in the label rather than the glyph.
      aria-label={`Theme: ${mode}. Switch to ${next}.`}
      className="ghost-btn icon-btn"
    >
      <ThemeMark mode={mode} />
    </button>
  );
}

/**
 * Half-sun/half-moon for system, sun for light, moon for dark.
 *
 * currentColor throughout so the mark inherits the topbar's ink and needs no
 * separate treatment per theme.
 */
function ThemeMark({ mode }: { mode: Mode }) {
  if (mode === "light") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="3.2" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="8"
            y1="1.4"
            x2="8"
            y2="3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            transform={`rotate(${deg} 8 8)`}
          />
        ))}
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  // System: the sun with a moon bitten out of it, so "auto" reads as both.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="3.6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M8 4.4a3.6 3.6 0 0 0 0 7.2Z" fill="currentColor" />
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={deg}
          x1="8"
          y1="1"
          x2="8"
          y2="2.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          transform={`rotate(${deg} 8 8)`}
        />
      ))}
    </svg>
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
