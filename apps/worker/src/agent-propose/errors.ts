import {
  LlmAuthError,
  LlmInvalidOutputError,
  LlmRateLimitedError,
  UntrustedDelimiterCollisionError,
} from "@koklo/domain";
import { AiCapReachedError, AiNotConfiguredError } from "@koklo/llm";

/** Sortie du modèle inexploitable (forme, arrêt anormal) : jamais le texte fautif. */
export class OutputInvalidError extends Error {
  constructor() {
    super("Sortie du modèle invalide");
    this.name = "OutputInvalidError";
  }
}

/** Échec décidé par le job lui-même, avec son code (`no_frozen_version`, `timeout`...). */
export class AgentProposeFailure extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Génération interrompue (${code})`);
    this.name = "AgentProposeFailure";
    this.code = code;
  }
}

/**
 * Code typé stocké dans `agent_launches.error_code` (motif `^[a-z][a-z0-9_]{0,63}$`) : jamais le message de
 * l'erreur, qui pourrait citer la réponse du fournisseur.
 */
export function errorCodeOf(error: unknown): string {
  if (error instanceof AgentProposeFailure) return error.code;
  if (error instanceof OutputInvalidError || error instanceof LlmInvalidOutputError) {
    return "output_invalid";
  }
  if (error instanceof AiCapReachedError) return "llm_cap_reached";
  if (error instanceof AiNotConfiguredError) return "llm_not_configured";
  if (error instanceof LlmRateLimitedError) return "llm_rate_limited";
  if (error instanceof LlmAuthError) return "llm_rejected";
  return "provider_error";
}

/** Une zone dont la sortie ou le prompt est refusé est ignorée et comptée ; les autres erreurs interrompent. */
export const isIgnorableZoneError = (error: unknown): boolean =>
  error instanceof OutputInvalidError ||
  error instanceof LlmInvalidOutputError ||
  error instanceof UntrustedDelimiterCollisionError;
