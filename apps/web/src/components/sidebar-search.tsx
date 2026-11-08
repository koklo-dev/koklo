"use client";

import { Icon, Kbd, useShell } from "@koklo/ui";
import { useEffect, useState } from "react";

/** Raccourci affiché : ⌘K sur Mac et iOS, Ctrl K ailleurs (le rendu serveur et le premier rendu disent Ctrl K). */
export function useShortcutLabel(): string {
  const [label, setLabel] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setLabel("⌘K");
  }, []);
  return label;
}

/** Champ « Rechercher » de la barre : ouvre la palette ⌘K. */
export function SidebarSearch({ onOpen }: { onOpen: () => void }) {
  const { collapsed } = useShell();
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={collapsed ? "Rechercher" : undefined}
      aria-keyshortcuts="Control+K Meta+K"
      title={collapsed ? "Rechercher" : undefined}
      className="flex h-11 w-full md:h-8.5 items-center gap-2 rounded-lg border bg-background px-2.5 text-meta text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[collapsed=true]:justify-center data-[collapsed=true]:px-0"
      data-collapsed={collapsed}
    >
      <Icon name="search" size={18} />
      {collapsed ? null : (
        <>
          <span className="flex-1 text-left">Rechercher</span>
          <Kbd>{shortcut}</Kbd>
        </>
      )}
    </button>
  );
}
