import { useCallback, useEffect, useState } from "react";

/**
 * Theme handling for the desktop shell.
 *
 * The design system (`@koklo/ui/tokens.css`) exposes a dark palette under
 * `:root[data-theme="dark"]`, so switching themes is a matter of toggling the
 * `data-theme` attribute on the document root. The chosen theme is persisted to
 * `localStorage`; on first run we fall back to the OS preference.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "koklo.theme";

/**
 * Pure resolver for the initial theme. Prefers a previously persisted choice,
 * then the OS `prefers-color-scheme`, then light.
 */
export function resolveInitialTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return prefersDark ? "dark" : "light";
}

export function readInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage?.getItem(THEME_STORAGE_KEY) ?? null;
  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  return resolveInitialTheme(stored, prefersDark);
}

/**
 * Applies the initial theme to the document root synchronously. Call once before
 * the first render to avoid a flash of the wrong theme on launch.
 */
export function applyInitialTheme(): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.setAttribute("data-theme", readInitialTheme());
}

/**
 * Applies the theme to the document root and persists the choice. Returns the
 * current theme and a toggle. Keep all DOM/storage side effects here so the
 * rest of the app stays declarative.
 */
export function useTheme(): { theme: Theme; isDark: boolean; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, isDark: theme === "dark", toggle };
}
