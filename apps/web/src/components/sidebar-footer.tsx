"use client";

import { cn, ShellCollapseButton, useShell } from "@koklo/ui";
import { NavUser } from "./nav-user.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

/** Pied de la barre : « Replier la barre », puis l'identité et le bouton de thème. */
export function SidebarFooter() {
  const { collapsed } = useShell();
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <ShellCollapseButton />
      <div
        className={cn(
          "border-t border-sidebar-border pt-2",
          collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1",
        )}
      >
        <NavUser />
        {collapsed ? null : <ThemeToggle className="shrink-0" />}
      </div>
    </div>
  );
}
