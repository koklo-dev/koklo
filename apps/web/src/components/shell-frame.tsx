"use client";

import { AppShell, IconButton } from "@koklo/ui";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { canListMembers } from "../lib/roles.ts";
import { isSpecSlug, projectIdFromPath, type SpecSlug } from "../lib/shell-routes.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { useProjectShell, useProjectVisit } from "../lib/use-project-shell.ts";
import { AppSidebar } from "./app-sidebar.tsx";
import { ShellPalette } from "./shell-palette.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

/**
 * Coquille partagée par les pages connectées de l'organisation (groupe de routes `(shell)`) : elle reste montée d'une
 * page à l'autre. Le projet est celui de l'adresse ; il alimente la carte projet, SPEC et la palette. Une page de
 * projet enregistre sa visite une fois (`project.visit`).
 */
export function ShellFrame({ children }: { children: ReactNode }) {
  const projectId = projectIdFromPath(usePathname());
  const shell = useProjectShell(projectId);
  useProjectVisit(projectId);
  const { role } = useActiveOrganization();
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const available = useMemo(
    () =>
      (shell.data?.deliverables ?? [])
        .filter((deliverable) => deliverable.available)
        .map((deliverable) => deliverable.key)
        .filter((key): key is SpecSlug => isSpecSlug(key)),
    [shell.data],
  );

  return (
    <AppShell
      sidebar={<AppSidebar projectId={projectId} onOpenSearch={openSearch} />}
      mobileTitle={shell.data?.name ?? "Koklo"}
      mobileActions={
        <>
          <ThemeToggle />
          <IconButton
            variant="ghost"
            icon="search"
            aria-label="Rechercher"
            className="size-11"
            onClick={openSearch}
          />
        </>
      }
    >
      <main id="contenu" className="min-w-0">
        {children}
      </main>
      <ShellPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        projectId={projectId}
        available={available}
        canSettings={canListMembers(role)}
      />
    </AppShell>
  );
}
