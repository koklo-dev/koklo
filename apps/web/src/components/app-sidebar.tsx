"use client";

import { useShell } from "@koklo/ui";
import { usePathname } from "next/navigation";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { SidebarFooter } from "./sidebar-footer.tsx";
import { OrganizationNav, ProjectNav } from "./sidebar-nav.tsx";
import { SidebarOrganization } from "./sidebar-organization.tsx";
import { SidebarSearch } from "./sidebar-search.tsx";

/**
 * Contenu de la barre (DESIGN.md §5.4), de haut en bas : organisation, recherche, groupe Projet (si une page de
 * projet est ouverte), groupe Organisation, pied. Le rôle vient de `organization.list` croisé avec la session.
 */
export function AppSidebar({
  projectId,
  onOpenSearch,
}: {
  projectId: string | null;
  onOpenSearch: () => void;
}) {
  const pathname = usePathname();
  const { role } = useActiveOrganization();
  const { mobile } = useShell();
  return (
    <nav aria-label="Navigation principale" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      {/* Seule cette zone défile : le pied reste en bas de la barre, même sur un écran bas. */}
      <div
        data-slot="sidebar-scroll"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 [@media(max-height:900px)]:gap-3 overflow-y-auto px-1"
      >
        <div className="flex flex-col gap-4 [@media(max-height:900px)]:gap-3">
          {/* Dans le tiroir, le bouton de fermeture du panneau occupe le coin haut droit. */}
          <div className={mobile ? "pr-9" : undefined}>
            <SidebarOrganization />
          </div>
          <SidebarSearch onOpen={onOpenSearch} />
        </div>
        {projectId ? <ProjectNav projectId={projectId} pathname={pathname} role={role} /> : null}
        <OrganizationNav pathname={pathname} role={role} />
      </div>
      <SidebarFooter />
    </nav>
  );
}
