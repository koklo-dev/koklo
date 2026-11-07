"use client";

import { IconButton } from "@koklo/ui";
import { useEffect, useSyncExternalStore } from "react";
import {
  applyTheme,
  DARK_QUERY,
  readTheme,
  type Theme,
  type ThemePreference,
} from "../lib/theme.ts";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// La source de vérité est la classe `dark` de <html>, posée avant le rendu par le script d'init.
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

const notify = () => {
  for (const listener of listeners) listener();
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const preference = useSyncExternalStore(subscribe, readTheme, () => "light" as ThemePreference);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const select = (value: ThemePreference) => {
    applyTheme(value);
    notify();
  };
  // « Système » suit le système en direct : le thème est réappliqué quand la préférence change.
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => {
      applyTheme("system");
      notify();
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);
  return { theme, preference, next, toggle: () => select(next), select };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, next, toggle } = useTheme();

  return (
    <IconButton
      variant="ghost"
      icon={theme === "dark" ? "light_mode" : "dark_mode"}
      aria-label={next === "dark" ? "Passer au thème sombre" : "Passer au thème clair"}
      className={`size-11 md:size-9 ${className ?? ""}`}
      onClick={toggle}
    />
  );
}
