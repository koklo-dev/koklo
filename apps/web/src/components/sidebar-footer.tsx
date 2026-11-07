"use client";

import { ShellCollapseButton, useShell } from "@koklo/ui";
import { NavUser } from "./nav-user.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

/** Pied de la barre : « Replier la barre », puis l'identité et le bouton de thème. */
export function SidebarFooter() {
  const { collapsed } = useShell();
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-sidebar-border pt-3">
      <ShellCollapseButton />
      <div className={collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1"}>
        <NavUser />
        <ThemeToggle className="shrink-0" />
      </div>
    </div>
  );
}
