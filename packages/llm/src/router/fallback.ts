import {
  type AiFallbackReason,
  LlmAuthError,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmTimeoutError,
} from "@koklo/domain";

type ErrorClass = abstract new (...args: never[]) => Error;

/**
 * Les seules erreurs qui justifient une bascule : authentification, limite, quota, indisponibilité,
 * délai. Jamais l'annulation, le budget, le refus, le contexte trop long, la sortie invalide, le
 * prompt rejeté, le modèle introuvable ni une erreur non typée.
 */
const TRIGGERS: readonly (readonly [ErrorClass, AiFallbackReason])[] = [
  [LlmAuthError, "auth"],
  [LlmRateLimitedError, "rate_limited"],
  [LlmQuotaExceededError, "quota"],
  [LlmProviderUnavailableError, "unavailable"],
  [LlmTimeoutError, "timeout"],
];

export const fallbackReasonOf = (error: unknown): AiFallbackReason | undefined =>
  TRIGGERS.find(([type]) => error instanceof type)?.[1];
