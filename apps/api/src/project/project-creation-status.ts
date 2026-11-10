import type { CreationStatus } from "@koklo/contract";
import type { ProjectCreationErrorCode, ProjectCreationStatus } from "@koklo/domain";

/**
 * État de la création d'un projet tel que l'écran le montre (TK-93, B301) : fonction pure d'une ligne
 * `project_creations` et de quelques faits du projet. Les étapes « projet » et « idée » sont faites dès
 * que la ligne existe (même transaction) ; seule l'étape « dépôt » suit le worker.
 */
export interface CreationRecord {
  status: ProjectCreationStatus;
  errorCode: ProjectCreationErrorCode | null;
  retryAfterMs: number | null;
  repoName: string;
  /** L'invitation du client demandée à la création n'a pas pu être envoyée (B303). */
  invitationFailed: boolean;
  /** Propriétaire du compte GitHub choisi ; `null` sans compte ou compte disparu. */
  ownerLogin: string | null;
}

export interface CreationExtras {
  /** Pages du dossier d'idée (10 pour le gabarit par défaut, 4 pour le gabarit vide). */
  ideaPages: number;
  /** Une invitation ou un lien client existe pour le projet. */
  invited: boolean;
  /** Owner ou admin : seuls à relancer. */
  canAct: boolean;
}

const REPO_STATE: Record<ProjectCreationStatus, CreationStatus["steps"][number]["status"]> = {
  pending: "running",
  running: "running",
  succeeded: "done",
  failed: "error",
  skipped: "todo",
};

function invitationStep(failed: boolean, invited: boolean): CreationStatus["steps"] {
  if (failed) return [{ key: "invitation", status: "error" }];
  return invited ? [{ key: "invitation", status: "done" }] : [];
}

function stepsOf(record: CreationRecord, invited: boolean): CreationStatus["steps"] {
  return [
    { key: "project", status: "done" },
    { key: "idea", status: "done" },
    ...invitationStep(record.invitationFailed, invited),
    { key: "repo", status: REPO_STATE[record.status] },
  ];
}

export function creationStatusOf(record: CreationRecord, extras: CreationExtras): CreationStatus {
  const { errorCode, ownerLogin, retryAfterMs, repoName } = record;
  return {
    status: record.status,
    steps: stepsOf(record, extras.invited),
    ideaPages: extras.ideaPages,
    ...(errorCode === null
      ? {}
      : {
          error: {
            code: errorCode,
            repoName,
            ...(ownerLogin === null ? {} : { ownerLogin }),
            ...(retryAfterMs === null ? {} : { retryAfterMs }),
          },
        }),
    canAct: extras.canAct,
  };
}

/**
 * Sur la carte, une création dont le dépôt n'existe pas encore (en cours, en échec ou sans compte GitHub)
 * remplace la carte normale ; seule une création réussie la rend.
 */
export const showsCreationCard = (status: ProjectCreationStatus): boolean => status !== "succeeded";
