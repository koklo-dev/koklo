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

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <IconButton
      variant="ghost"
      icon={theme === "dark" ? "light_mode" : "dark_mode"}
      aria-label={next === "dark" ? "Passer au thème sombre" : "Passer au thème clair"}
      className={`size-11 md:size-9 ${className ?? ""}`}
      onClick={() => {
        applyTheme(next);
        for (const listener of listeners) listener();
      }}
    />
  );
}
