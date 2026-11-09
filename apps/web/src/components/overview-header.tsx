import type { ProjectOverview } from "@koklo/contract";
import { Button, Icon, ProjectHeader } from "@koklo/ui";
import { summaryOf } from "../lib/overview-labels.ts";
import { projectPath, settingsPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

/**
 * En-tête de la vue d'ensemble (maquette 07 l.67-84) : « Inviter » secondaire (équipe qui gère), action principale
 * de la phase à droite. Sans données (chargement, erreur), seul le nom du projet, quand il est connu.
 */
export function OverviewHeader({
  projectId,
  name,
  overview,
}: {
  projectId: string;
  name: string | undefined;
  overview: ProjectOverview | undefined;
}) {
  const action = overview?.primaryAction;
  return (
    <ProjectHeader
      project={{ name: overview?.project.name ?? name ?? "Projet", href: projectPath(projectId) }}
      page="Vue d'ensemble"
      title="Vue d'ensemble"
      {...(overview ? { summary: summaryOf(overview.project) } : {})}
      {...(overview?.canInvite
        ? {
            secondaryActions: (
              <Button asChild variant="outline" className="h-11 w-full md:h-9 md:w-auto">
                <ShellLink href={settingsPath("members")}>
                  <Icon name="person_add" size={20} />
                  Inviter
                </ShellLink>
              </Button>
            ),
          }
        : {})}
      {...(action
        ? {
            primaryAction: (
              <Button asChild className="h-11 w-full md:h-9 md:w-auto">
                <ShellLink href={action.href}>
                  {action.label}
                  <Icon name="arrow_forward" size={20} />
                </ShellLink>
              </Button>
            ),
          }
        : {})}
      LinkComponent={ShellLink}
    />
  );
}
