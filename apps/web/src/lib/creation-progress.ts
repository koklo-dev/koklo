import type { CreationStatus } from "@koklo/contract";
import type { ProgressStep } from "@koklo/ui";
import { type FailureView, INVITATION_FAILED_TEXT } from "./creation-copy.ts";

type Step = CreationStatus["steps"][number];

const REPO_LABEL = {
  done: "Dépôt de spec créé",
  running: "Création du dépôt de spec sur GitHub…",
  todo: "Dépôt de spec en attente",
  error: "Le dépôt de spec n'a pas pu être créé",
} as const;

function labelOf(step: Step, ideaPages: number): string {
  switch (step.key) {
    case "project":
      return "Projet créé";
    case "idea":
      return `Dossier d'idée prêt (${ideaPages} pages)`;
    case "invitation":
      return step.status === "error"
        ? "L'invitation n'a pas pu être envoyée"
        : "Invitation envoyée au client";
    case "repo":
      return REPO_LABEL[step.status];
  }
}

function detailOf(step: Step, failure: FailureView | null): string | undefined {
  if (step.key === "invitation" && step.status === "error") return INVITATION_FAILED_TEXT;
  if (step.key === "repo" && failure && step.status !== "done") return failure.text;
  return undefined;
}

/** Étapes de la liste d'avancement : libellés de S-projects v7 §4.2, la phrase d'échec sous l'étape du dépôt. */
export function creationSteps(status: CreationStatus, failure: FailureView | null): ProgressStep[] {
  return status.steps.map((step) => {
    const detail = detailOf(step, failure);
    return {
      key: step.key,
      label: labelOf(step, status.ideaPages),
      status: step.status,
      ...(detail ? { detail } : {}),
    };
  });
}
