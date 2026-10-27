import { Icon } from "@koklo/ui";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

/**
 * Gabarit d'application (DESIGN.md §5) : barre latérale 248 px dès 768 px, barre supérieure
 * empilée en dessous, marge de page 32 px (16 px en mobile). Le panneau de détail (380-440 px)
 * est réservé et absent du DOM tant qu'aucun détail n'existe.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-testid="app-shell" className="flex min-h-screen flex-col md:flex-row">
      <nav
        aria-label="Navigation principale"
        className="flex items-center gap-4 border-b bg-card px-4 py-2 md:w-[248px] md:shrink-0 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-4 md:py-6"
      >
        <div className="flex items-center gap-2">
          <BrandMark />
          <span className="font-semibold">Koklo</span>
        </div>
        <a
          href="/projects"
          aria-current="page"
          className="flex min-h-11 items-center gap-2 rounded-md bg-accent px-3 font-medium text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
        >
          <Icon name="account_tree" size={22} fill />
          Projets
        </a>
        <ThemeToggle className="ml-auto md:mt-auto md:ml-0 md:self-start" />
      </nav>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
