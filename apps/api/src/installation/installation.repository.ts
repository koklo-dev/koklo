import type { InstallationOutput } from "@koklo/contract";
import type { GitUserCredentials, GitUserInstallation } from "@koklo/domain";
import type { AuditActor } from "../tracker/audit.ts";

export const INSTALLATION_REPOSITORY = Symbol("INSTALLATION_REPOSITORY");

/** Installation de l'organisation telle que le callback la relit (l'identifiant externe ne sort jamais). */
export interface LinkedInstallation {
  externalId: string;
  status: "active" | "suspended" | "deleted";
}

export interface NewAuthState {
  nonce: string;
  installationId: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Ce que l'état consommé établit : la ré-autorisation cible une installation déjà liée. */
export interface ConsumedState {
  installationId: string | null;
}

export type LinkResult = "linked" | "reauthorized" | "already_linked";

/**
 * Accès base du flux d'installation. Chaque méthode est une transaction courte sous
 * `withOrganization` : le réseau n'est jamais appelé pendant qu'une transaction est ouverte.
 */
export interface InstallationRepository {
  /** Installations de l'organisation, avec l'autorisation utilisateur de `actor` (jamais le jeton). */
  list(actor: AuditActor, now: string): Promise<InstallationOutput[]>;
  /** `null` si l'installation n'est pas de l'organisation. */
  findInstallation(
    organizationId: string,
    installationId: string,
  ): Promise<LinkedInstallation | null>;
  /**
   * Purge les états expirés de l'organisation, applique le plafond par utilisateur, enregistre
   * l'état et journalise `installation.start` dans la même transaction.
   */
  createState(actor: AuditActor, state: NewAuthState): Promise<"created" | "too_many_pending">;
  /** Consommation atomique : `null` si l'état est inconnu, d'un autre utilisateur, expiré ou déjà consommé. */
  consumeState(claim: StateKey, now: string): Promise<ConsumedState | null>;
  /** Propriétaire ou admin de l'organisation, relu dans `members`. */
  isManager(actor: AuditActor): Promise<boolean>;
  /**
   * Lie (ou ré-autorise) l'installation prouvée par le jeton : ligne, jeton chiffré et audit dans
   * une même transaction. `already_linked` : l'identifiant appartient à une autre organisation.
   */
  link(
    actor: AuditActor,
    installation: GitUserInstallation,
    credentials: GitUserCredentials,
  ): Promise<LinkResult>;
  /** `installation.link_refused` (cible : l'organisation de l'état, sans identifiant externe). */
  recordRefusal(actor: AuditActor): Promise<void>;
}

export interface StateKey extends AuditActor {
  nonce: string;
}
