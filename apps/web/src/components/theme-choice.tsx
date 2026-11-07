"use client";

import { useId } from "react";
import { THEME_CHOICES } from "../lib/account-labels.ts";
import type { ThemePreference } from "../lib/theme.ts";
import { useTheme } from "./theme-toggle.tsx";

/** Thème Clair / Sombre / Système : trois radios natives (flèches, Tab), enregistré à l'action. */
export function ThemeChoice() {
  const { preference, select } = useTheme();
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-sm font-medium">
        Thème
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {THEME_CHOICES.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center rounded-md border px-4 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring md:min-h-9"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => select(value as ThemePreference)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
