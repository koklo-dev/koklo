"use client";

import type { CreationStatus, ProjectCard } from "@koklo/contract";
import { ProjectCardCreating, type ProjectCardCreatingProps } from "@koklo/ui";
import { describeCreationFailure } from "../lib/creation-copy.ts";
import { creationSteps } from "../lib/creation-progress.ts";
import { projectPath, settingsPath } from "../lib/shell-routes.ts";
import { useCreationRetry } from "../lib/use-creation-retry.ts";
import { useCreationStatus } from "../lib/use-creation-status.ts";
import { CreationActions } from "./creation-actions.tsx";
import { ShellLink } from "./shell-link.tsx";

const NOTE = "Vous pouvez déjà ouvrir le projet et écrire l'idée.";

type CreatingCard = ProjectCard & { creation: CreationStatus };

/** Une carte porte une création tant que le dépôt de spec n'existe pas (en cours, en échec, sans compte). */
export const hasCreation = (card: ProjectCard): card is CreatingCard => card.creation !== null;

/**
 * Carte de création d'un projet (maquette 08 l.85-96, S-projects v7 §4.2) : l'avancement vient du serveur,
 * relu toutes les 3 s tant que le worker travaille ; un échec garde la carte en tête avec sa phrase et son action.
 */
export function CreationCard({ card, className }: { card: CreatingCard; className?: string }) {
  const { status } = useCreationStatus(card.id, card.creation);
  const retry = useCreationRetry(card.id);
  const failure = status.error ? describeCreationFailure(status.error, status.canAct) : null;
  const invitationFailed = status.steps.some(
    (step) => step.key === "invitation" && step.status === "error",
  );
  const actions: ProjectCardCreatingProps["actions"] = (
    <>
      {failure ? (
        <CreationActions
          failure={failure}
          ownerLogin={status.error?.ownerLogin}
          repoName={status.error?.repoName}
          pending={retry.pending}
          onRetry={(input) => void retry.run(input)}
        />
      ) : null}
      {retry.error ? <p className="text-caption text-destructive">{retry.error}</p> : null}
      {invitationFailed && status.canAct ? (
        <ShellLink
          href={settingsPath("members")}
          className="self-start text-meta font-medium underline underline-offset-4"
        >
          Ouvrir les membres
        </ShellLink>
      ) : null}
    </>
  );
  return (
    <ProjectCardCreating
      href={projectPath(card.id)}
      name={card.name}
      initials={card.initials}
      colorKey={card.colorKey as ProjectCardCreatingProps["colorKey"]}
      steps={creationSteps(status, failure)}
      note={NOTE}
      actions={actions}
      LinkComponent={ShellLink}
      {...(className ? { className } : {})}
    />
  );
}
