/**
 * Création d'un projet (TK-93, B301) : file pg-boss du worker, états de la ligne `project_creations`
 * et codes d'échec rendus à l'écran. Règles partagées par l'API (qui dépose `{ creationId }` seul) et
 * le worker (qui crée le dépôt de spec). Pures, sans I/O.
 */

/** File pg-boss du worker ; l'API y dépose `{ creationId }` seul, jamais un jeton ni un nom. */
export const PROJECT_CREATION_QUEUE = "project-creation";

/** Clé de singleton : une seule exécution à la fois par création. */
export const projectCreationSingletonKey = (creationId: string): string => creationId;

export const PROJECT_CREATION_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;
export type ProjectCreationStatus = (typeof PROJECT_CREATION_STATUSES)[number];

/** Codes d'échec de création (liste fermée, jamais un message brut du fournisseur). */
export const PROJECT_CREATION_ERROR_CODES = [
  "no_account",
  "name_taken",
  "user_token_required",
  "auth_expired_user",
  "auth_expired_installation",
  "resource_not_accessible",
  "provider_unavailable",
  "rate_limited",
  "account_unavailable",
  "invalid_name",
  "forbidden",
  "unknown",
] as const;
export type ProjectCreationErrorCode = (typeof PROJECT_CREATION_ERROR_CODES)[number];

export const IDEA_TEMPLATE_KEYS = ["default", "empty"] as const;
export type IdeaTemplateKey = (typeof IDEA_TEMPLATE_KEYS)[number];

/** Une création qui ne peut plus changer d'état seule : on ne la relance pas, on en ouvre une autre. */
export const isSettledCreation = (status: ProjectCreationStatus): boolean =>
  status === "succeeded" || status === "failed" || status === "skipped";

/** Relancer n'a de sens que depuis un échec ou un dépôt non demandé : jamais pendant ni après un succès. */
export const canRetryCreation = (status: ProjectCreationStatus): boolean =>
  status === "failed" || status === "skipped";

export type CreationStepKey = "project" | "idea" | "invitation" | "repo";
export type CreationStepState = "done" | "running" | "todo" | "error";
