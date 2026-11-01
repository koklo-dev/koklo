/** Erreurs du marquage des données non fiables (TK-50a). Aucune ne porte le contenu d'une donnée. */

/** Origine hors de la liste fermée `UNTRUSTED_ORIGINS`. */
export class InvalidUntrustedOriginError extends Error {
  readonly origin: unknown;
  constructor(origin: unknown) {
    super("Origine de donnée non fiable inconnue");
    this.name = "InvalidUntrustedOriginError";
    this.origin = origin;
  }
}

/** Une consigne de confiance ne reçoit aucune interpolation. */
export class TrustedInterpolationError extends Error {
  constructor() {
    super("Une consigne de confiance n'accepte aucune interpolation");
    this.name = "TrustedInterpolationError";
  }
}

/** Le nonce fourni par l'appelant est inutilisable (trop court ou hors alphabet). */
export class InvalidPromptNonceError extends Error {
  constructor() {
    super("Nonce de cadrage de prompt invalide");
    this.name = "InvalidPromptNonceError";
  }
}

/** Une donnée contient le nonce ou une séquence de délimiteur : jamais d'échappement silencieux. */
export class UntrustedDelimiterCollisionError extends Error {
  /** Rang (à partir de 1) de la donnée fautive ; jamais son contenu. */
  readonly index: number;
  constructor(index: number) {
    super(`La donnée ${index} contient un délimiteur de bloc`);
    this.name = "UntrustedDelimiterCollisionError";
    this.index = index;
  }
}

/** La sortie du modèle n'a pas passé la validation de l'appelant ; `reason` ne reprend pas la sortie. */
export class LlmInvalidOutputError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super("Sortie du modèle invalide");
    this.name = "LlmInvalidOutputError";
    this.reason = reason;
  }
}

export const INVALID_LLM_CREDENTIAL_REASONS = [
  "not-a-string",
  "empty",
  "too-long",
  "control-characters",
] as const;
export type InvalidLlmCredentialReason = (typeof INVALID_LLM_CREDENTIAL_REASONS)[number];

/** Clé inutilisable ; ne reprend jamais la valeur fournie. */
export class InvalidLlmCredentialError extends Error {
  readonly reason: InvalidLlmCredentialReason;
  constructor(reason: InvalidLlmCredentialReason) {
    super("Clé de fournisseur LLM invalide");
    this.name = "InvalidLlmCredentialError";
    this.reason = reason;
  }
}

export const INVALID_LLM_REQUEST_REASONS = [
  "model",
  "credential",
  "prompt",
  "output",
  "temperature",
  "signal",
  "trace",
] as const;
export type InvalidLlmRequestReason = (typeof INVALID_LLM_REQUEST_REASONS)[number];

/** Requête mal formée (erreur de programmation de l'appelant) ; ne reprend aucun contenu. */
export class InvalidLlmRequestError extends Error {
  readonly reason: InvalidLlmRequestReason;
  constructor(reason: InvalidLlmRequestReason) {
    super(`Requête LLM invalide : ${reason}`);
    this.name = "InvalidLlmRequestError";
    this.reason = reason;
  }
}

export const INVALID_LLM_BUDGET_FIELDS = [
  "budget",
  "maxOutputTokens",
  "timeoutMs",
  "maxPromptChars",
  "maxCostMicroUsd",
] as const;
export type InvalidLlmBudgetField = (typeof INVALID_LLM_BUDGET_FIELDS)[number];

/** Budget absent ou champ qui n'est pas un entier strictement positif. */
export class InvalidLlmBudgetError extends Error {
  readonly field: InvalidLlmBudgetField;
  constructor(field: InvalidLlmBudgetField) {
    super(`Budget LLM invalide : ${field}`);
    this.name = "InvalidLlmBudgetError";
    this.field = field;
  }
}
