import type { LlmProviderId } from "@koklo/domain";
import type { EncryptedSecret } from "../crypto/token-cipher.ts";
import type { AuditActor } from "../tracker/audit.ts";

export const LLM_CREDENTIAL_REPOSITORY = Symbol("LLM_CREDENTIAL_REPOSITORY");

/** Statut public d'une clé : AUCUNE valeur dérivée de la clé, ni `keyVersion`. Dates en ISO-8601 UTC. */
export interface LlmCredentialStatus {
  readonly id: string;
  readonly provider: LlmProviderId;
  readonly defaultModel: string | null;
  readonly invalid: boolean;
  readonly invalidatedAt: string | null;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Ligne brute (chiffrée) : réservée au résolveur et à la rotation, jamais exposée. */
export interface StoredLlmCredential {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: LlmProviderId;
  readonly secret: EncryptedSecret;
  readonly defaultModel: string | null;
  readonly invalidatedAt: string | null;
}

export interface UpsertLlmCredential {
  readonly provider: LlmProviderId;
  readonly secret: EncryptedSecret;
  readonly defaultModel: string | null;
  readonly createdByUserId: string | null;
  /** Instant de l'horloge de l'application (ISO-8601). */
  readonly at: string;
}

/** Résultat d'un `upsert` : `created` distingue la première écriture d'un remplacement. */
export interface UpsertResult {
  readonly status: LlmCredentialStatus;
  readonly created: boolean;
}

/**
 * Port de dépôt des clés BYOK (organisation en premier argument, sous `withOrganization`).
 * Toute erreur de base est rejetée sous la forme `LlmCredentialStoreError`. Quand `actor` est
 * fourni, la ligne d'audit (`llm_credential.create|replace|invalidate|delete`) est écrite dans la
 * MÊME transaction que l'écriture ; sans lui (rotation, usage interne) rien n'est journalisé.
 */
export interface LlmCredentialRepository {
  /** Crée ou remplace en place : `invalidated_at` et `last_used_at` remis à NULL ; `defaultModel` absent = NULL. */
  upsert(
    organizationId: string,
    input: UpsertLlmCredential,
    actor?: AuditActor,
  ): Promise<UpsertResult>;
  list(organizationId: string): Promise<LlmCredentialStatus[]>;
  find(organizationId: string, provider: LlmProviderId): Promise<StoredLlmCredential | null>;
  /** `true` si une ligne a été supprimée. */
  remove(organizationId: string, provider: LlmProviderId, actor?: AuditActor): Promise<boolean>;
  /**
   * `null` si absente. Idempotent : une clé déjà invalidée garde son `invalidated_at` et ne
   * journalise rien.
   */
  invalidate(
    organizationId: string,
    provider: LlmProviderId,
    at: string,
    actor?: AuditActor,
  ): Promise<LlmCredentialStatus | null>;
  /** Au plus une écriture par minute : sans effet si `last_used_at` a moins de 60 s avant `at`. */
  markUsed(organizationId: string, provider: LlmProviderId, at: string): Promise<void>;
}
