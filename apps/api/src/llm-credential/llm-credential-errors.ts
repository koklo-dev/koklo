import type { LlmProviderId } from "@koklo/domain";

/** Toute erreur de la base sur la table des clés BYOK, sans cause, sans `meta`, sans message du driver. */
export class LlmCredentialStoreError extends Error {
  constructor() {
    super("Échec du magasin des clés de fournisseur LLM");
    this.name = "LlmCredentialStoreError";
  }
}

export type LlmCredentialUnavailableReason =
  | "missing"
  | "invalidated"
  | "undecryptable"
  | "no-encryption-key";

/** `resolve` ne peut pas rendre de clé ; ne porte ni clé ni organisation. */
export class LlmCredentialUnavailableError extends Error {
  readonly reason: LlmCredentialUnavailableReason;
  constructor(reason: LlmCredentialUnavailableReason) {
    super(`Clé de fournisseur LLM indisponible (${reason})`);
    this.name = "LlmCredentialUnavailableError";
    this.reason = reason;
  }
}

/** Aucun porte-clés configuré : `set` est impossible (503 `ENCRYPTION_UNAVAILABLE` en 52b). */
export class EncryptionUnavailableError extends Error {
  constructor() {
    super("Chiffrement indisponible : KOKLO_ENCRYPTION_KEY n'est pas configurée");
    this.name = "EncryptionUnavailableError";
  }
}

/** Entrée refusée avant tout accès à la base ; ne reprend jamais la valeur. */
export class LlmCredentialInputError extends Error {
  readonly field: "apiKey" | "defaultModel";
  readonly reason: string;
  constructor(field: "apiKey" | "defaultModel", reason: string) {
    super(`Entrée invalide (${field}: ${reason})`);
    this.name = "LlmCredentialInputError";
    this.field = field;
    this.reason = reason;
  }
}

export type { LlmProviderId };
