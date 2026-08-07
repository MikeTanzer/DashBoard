export type ThemeMode = "system" | "light" | "dark";

export const THEME_COOKIE = "pyrotree-theme";

/** Cookie values are user-controlled — never trust one straight onto the DOM. */
export function readTheme(raw: string | undefined): ThemeMode {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export const THEME_MAX_AGE = 60 * 60 * 24 * 365;
