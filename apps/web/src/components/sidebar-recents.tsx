"use client";

import { ProjectTile, ShellNavGroup, ShellNavItem } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/orpc.ts";
import { projectPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

/** Projets récents montrés dans la barre (B306) : trois ; `project.recent` en rend huit au plus. */
const RECENTS_SHOWN = 3;

/**
 * Groupe « Récents » (maquette 08 l.37-42) : les trois derniers projets ouverts, tuile de 22 aux initiales. Absent
 * tant que la liste n'est pas lue, vide, ou en échec : la barre ne montre jamais un groupe sans entrée.
 */
export function SidebarRecents() {
  const recent = useQuery(orpc.project.recent.queryOptions());
  const projects = recent.data?.slice(0, RECENTS_SHOWN) ?? [];
  if (projects.length === 0) return null;
  return (
    <ShellNavGroup label="Récents">
      {projects.map((project) => (
        <ShellNavItem
          key={project.id}
          href={projectPath(project.id)}
          label={project.name}
          leading={
            <ProjectTile
              initials={project.initials}
              colorKey={project.colorKey as 1 | 2 | 3 | 4 | 5}
              size={22}
            />
          }
          LinkComponent={ShellLink}
        />
      ))}
    </ShellNavGroup>
  );
}
