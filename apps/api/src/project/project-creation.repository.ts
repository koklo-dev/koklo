import type { IdeaTemplateKey } from "@koklo/domain";
import type { AuditActor } from "../tracker/audit.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { CreationRecord } from "./project-creation-status.ts";

export const PROJECT_CREATION_REPOSITORY = Symbol("PROJECT_CREATION_REPOSITORY");

/** Compte GitHub choisi : une installation active de l'organisation de l'acteur. */
export interface InstallationChoice {
  id: string;
  ownerLogin: string;
}

export interface NewProject {
  name: string;
  euOnly: boolean;
  ideaTemplate: IdeaTemplateKey;
  /** Nom du dépôt de spec, déjà validé (`specRepoName`). */
  repoName: string;
  /** `null` : aucun compte choisi, la création est « sautée » sans job. */
  installationId: string | null;
  idempotencyKey: string | null;
  /** Client déjà membre : son accès au projet est posé dans la même transaction (B303). */
  clientUserId: string | null;
  /** Invitation vivante de cette adresse : le projet lui est ajouté dans la même transaction (B303). */
  invitationId: string | null;
}

export interface CreatedProject {
  id: string;
  name: string;
  /** Ligne `project_creations` du projet. */
  creationId: string;
  /** Vrai si le worker doit créer le dépôt (`pending`) ; faux pour une création « sautée ». */
  queued: boolean;
  /** Même clé d'idempotence déjà vue : le projet existant est rendu, rien n'est recréé. */
  replayed: boolean;
}

export interface LatestCreation {
  id: string;
  installationId: string | null;
  record: CreationRecord;
  ideaPages: number;
  invited: boolean;
}

export interface RetryRequest {
  repoName: string;
  installationId: string;
}

/** Résultat d'une relance : la nouvelle ligne, ou le refus motivé (état courant). */
export type RetryOutcome =
  | { kind: "created"; creationId: string }
  | { kind: "refused"; reason: "creation_running" | "creation_succeeded" };

/**
 * Port des écritures de création de projet (TK-93). `create` écrit en UNE transaction le projet, ses
 * pages d'idée, la ligne `project_creations`, le lien client existant et l'audit : tout ou rien.
 */
export interface ProjectCreationRepository {
  /** Projet déjà créé avec cette clé d'idempotence dans l'organisation, s'il existe. */
  findByKey(organizationId: string, key: string): Promise<{ id: string; name: string } | null>;
  create(actor: AuditActor, input: NewProject): Promise<CreatedProject>;
  /** Installation active de l'organisation ; `null` si inconnue, suspendue ou supprimée. */
  installation(organizationId: string, installationId: string): Promise<InstallationChoice | null>;
  projectName(scope: ProjectScope): Promise<string | null>;
  latestCreation(scope: ProjectScope): Promise<LatestCreation | null>;
  /** Nouvelle ligne `pending` si la dernière n'est ni en cours ni réussie, avec audit `project.retry_repo`. */
  retry(scope: ProjectScope, request: RetryRequest): Promise<RetryOutcome>;
  /** L'invitation du client demandée à la création n'a pas pu être envoyée : l'étape passe en erreur (B303). */
  markInvitationFailed(scope: ProjectScope, creationId: string): Promise<void>;
  /** La création n'a pas pu être confiée au worker : `failed` + code, pour une relance depuis l'écran. */
  failEnqueue(scope: ProjectScope, creationId: string): Promise<void>;
  setEuOnly(scope: ProjectScope, euOnly: boolean): Promise<void>;
}
