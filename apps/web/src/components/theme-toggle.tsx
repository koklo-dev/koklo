"use client";

import { IconButton } from "@koklo/ui";
import { useSyncExternalStore } from "react";
import { applyTheme, type Theme } from "../lib/theme.ts";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// La source de vérité est la classe `dark` de <html>, posée avant le rendu par le script d'init.
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const toggle = () => {
    applyTheme(next);
    for (const listener of listeners) listener();
  };
  return { theme, next, toggle };
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
