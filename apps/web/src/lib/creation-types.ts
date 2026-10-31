import type { CreationResume } from "./creation-resume.ts";
import type { SpecRepoErrorView } from "./spec-repo-errors.ts";

export interface CreatedProject {
  id: string;
  name: string;
}

/** Étape courante du panneau (design/screens/S-projects.md §4.1). */
export type Phase =
  | { name: "form"; stepOneFailure?: "forbidden" | "generic" }
  | { name: "creating-project" }
  /** Le projet existe, le dépôt n'a pas encore été tenté (reprise). */
  | { name: "ready" }
  | { name: "creating-repo"; retry: boolean }
  | { name: "failed"; view: SpecRepoErrorView }
  | { name: "existing" }
  | { name: "no-account" };

export type CreationOutcome =
  | {
      kind: "created-with-repo" | "linked" | "existing-repo" | "created" | "repo-missing";
      name: string;
    }
  | { kind: "unresolved"; marker: CreationResume; offerLink: boolean }
  | { kind: "cancelled" };

/**
 * Projet dont il reste à créer le dépôt : le marqueur de session (compte et nom de dépôt connus) ou, depuis la
 * page du projet, le seul projet (le compte se choisit dans le panneau).
 */
export type ResumeTarget = Pick<CreationResume, "projectId" | "projectName"> &
  Partial<Pick<CreationResume, "installationId" | "repoName">>;

/** Projet à reprendre (`offerLink` : proposer le repli « relier »). */
export interface PendingResume {
  marker: ResumeTarget;
  offerLink: boolean;
  /** Ouvrir directement le repli « Relier un dépôt existant ». */
  openLink?: boolean;
}

export interface FieldErrorMap {
  name?: string;
  account?: string;
  repo?: string;
}
