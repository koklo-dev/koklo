"use client";

import type { ProjectShellOutput } from "@koklo/contract";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  PhaseRail,
  Skeleton,
  useShell,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "../lib/orpc.ts";
import { PROJECTS_PATH, projectPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

function RecentProjects({ open, currentId }: { open: boolean; currentId: string }) {
  const recent = useQuery({ ...orpc.project.recent.queryOptions(), enabled: open });
  if (recent.isPending && !recent.isError) {
    return (
      <div className="flex flex-col gap-1 p-1" aria-busy="true">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }
  if (recent.isError) return null;
  if (recent.data.length === 0) {
    return <p className="px-2 py-1.5 text-meta text-muted-foreground">Aucun projet récent</p>;
  }
  return recent.data.map((project) => (
    <DropdownMenuItem key={project.id} asChild>
      <ShellLink
        href={projectPath(project.id)}
        aria-current={project.id === currentId ? "true" : undefined}
      >
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        {project.id === currentId ? <Icon name="check" size={16} /> : null}
      </ShellLink>
    </DropdownMenuItem>
  ));
}

/** Carte du projet courant (absente dans le rail replié) : nom, fil de phase inline, menu des huit projets récents (liste longue : jamais tous). */
export function SidebarProjectCard({
  projectId,
  shell,
  canCreate,
}: {
  projectId: string;
  shell: { data?: ProjectShellOutput; isPending: boolean };
  canCreate: boolean;
}) {
  const { collapsed, mobile } = useShell();
  const [open, setOpen] = useState(false);
  // Replié : la carte disparaît (maquette 05 l.266) ; le changement de projet reste atteignable par ⌘K.
  if (collapsed) return null;
  if (shell.isPending)
    return <Skeleton data-testid="project-card-loading" className="h-16 rounded-card" />;
  const name = shell.data?.name ?? "Projet";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-16 w-full items-center gap-2 rounded-card border bg-background px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(max-height:900px)]:min-h-14"
        >
          <span className="grid min-w-0 flex-1 gap-1.5">
            <span className="truncate text-body font-semibold">{name}</span>
            {shell.data ? <PhaseRail phase={shell.data.phase} size="inline" /> : null}
          </span>
          <Icon name="unfold_more" size={16} className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={mobile ? "bottom" : "right"}
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel>Récents</DropdownMenuLabel>
        <RecentProjects open={open} currentId={projectId} />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <ShellLink href={PROJECTS_PATH}>
            <Icon name="folder_open" size={20} />
            Tous les projets
          </ShellLink>
        </DropdownMenuItem>
        {canCreate ? (
          <DropdownMenuItem asChild>
            <ShellLink href={PROJECTS_PATH}>
              <Icon name="add" size={20} />
              Créer un projet
            </ShellLink>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
