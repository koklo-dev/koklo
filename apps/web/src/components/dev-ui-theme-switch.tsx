"use client";

import { Button, Icon } from "@koklo/ui";
import type { Theme } from "../lib/theme.ts";
import { useTheme } from "./theme-toggle.tsx";

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: "light_mode" | "dark_mode" }> = [
  { value: "light", label: "Clair", icon: "light_mode" },
  { value: "dark", label: "Sombre", icon: "dark_mode" },
];

/** Bascule de la galerie (S-dev-ui §5) : même classe `.dark` et même préférence que l'application. */
export function DevUiThemeSwitch() {
  const { theme, select } = useTheme();
  return (
    <fieldset className="inline-flex gap-1 self-start rounded-lg border p-1">
      <legend className="sr-only">Thème</legend>
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <Button
            key={option.value}
            size="sm"
            variant={active ? "default" : "ghost"}
            aria-pressed={active}
            className={active ? undefined : "text-muted-foreground"}
            onClick={() => select(option.value)}
          >
            <Icon name={option.icon} size={16} />
            {option.label}
          </Button>
        );
      })}
    </fieldset>
  );
}
