"use client";

import { SegmentedControl } from "@koklo/ui";
import type { Theme } from "../lib/theme.ts";
import { useTheme } from "./theme-toggle.tsx";

const OPTIONS = [
  { value: "light", label: "Clair", icon: "light_mode" },
  { value: "dark", label: "Sombre", icon: "dark_mode" },
] as const;

/** Bascule de la galerie (S-dev-ui §5) : même classe `.dark` et même préférence que l'application. */
export function DevUiThemeSwitch() {
  const { theme, select } = useTheme();
  return (
    <SegmentedControl
      aria-label="Thème"
      className="self-start"
      options={OPTIONS}
      value={theme}
      onValueChange={(value: Theme) => select(value)}
    />
  );
}
