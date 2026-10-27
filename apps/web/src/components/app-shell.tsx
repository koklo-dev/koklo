import {
  Icon,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@koklo/ui";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

/**
 * Gabarit d'application (bloc shadcn `sidebar-07`, DESIGN.md §5) : barre latérale 248 px
 * repliable en icônes dès 768 px, Sheet en dessous, marge de page 32 px (16 px en mobile).
 * Le panneau de détail (380-440 px) est réservé et absent du DOM tant qu'aucun détail n'existe.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider data-testid="app-shell">
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-9 items-center gap-2 px-0.5">
            <BrandMark />
            <span className="font-semibold group-data-[collapsible=icon]:hidden">Koklo</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Navigation principale">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive tooltip="Projets">
                  <a href="/projects" aria-current="page">
                    <Icon name="account_tree" size={20} fill />
                    <span>Projets</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <ThemeToggle />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4 md:px-8">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="min-w-0 flex-1 p-4 pt-0 md:p-8 md:pt-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
