import {
  LlmAbortedError,
  LlmAuthError,
  LlmBudgetExceededError,
  LlmContextTooLongError,
  LlmInvalidOutputError,
  LlmModelNotFoundError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmTimeoutError,
} from "@koklo/domain";
import { ORPCError } from "@orpc/server";
import type { LlmCredentialUnavailableReason } from "../llm-credential/llm-credential-errors.ts";

/** Raisons de `LLM_PROVIDER_ERROR` (liste fermée du contrat 0.9.0). */
export type ProviderErrorReason =
  | "auth"
  | "quota"
  | "timeout"
  | "aborted"
  | "budget"
  | "context_too_long"
  | "refused"
  | "model_not_found"
  | "unavailable";

/** Aucune de ces erreurs ne porte clé, prompt, sortie, id d'organisation ni texte du fournisseur. */
export const providerError = (reason: ProviderErrorReason) =>
  new ORPCError("LLM_PROVIDER_ERROR", { data: { reason } });

export const outputInvalid = () => new ORPCError("LLM_OUTPUT_INVALID");

export const promptRejected = (rank: number) =>
  new ORPCError("PROMPT_REJECTED", { data: { rank } });

export const rateLimited = (retryAfterSeconds: number) =>
  new ORPCError("LLM_RATE_LIMITED", {
    data: { retryAfterSeconds: Math.max(1, retryAfterSeconds) },
  });

/** `no-encryption-key` est un 503 (porte-clés absent) ; les autres raisons sont des 409. */
export function unavailableCredential(
  reason: LlmCredentialUnavailableReason,
): ORPCError<string, unknown> {
  return reason === "no-encryption-key"
    ? new ORPCError("ENCRYPTION_UNAVAILABLE")
    : new ORPCError("LLM_NOT_CONFIGURED", { data: { reason } });
}

type ErrorClass = abstract new (...args: never[]) => Error;

/** Table ordonnée : première classe qui correspond (les sous-classes avant leur parent). */
const REASONS: readonly (readonly [ErrorClass, ProviderErrorReason])[] = [
  [LlmAuthError, "auth"],
  [LlmQuotaExceededError, "quota"],
  [LlmTimeoutError, "timeout"],
  [LlmAbortedError, "aborted"],
  [LlmBudgetExceededError, "budget"],
  [LlmContextTooLongError, "context_too_long"],
  [LlmRefusedError, "refused"],
  [LlmModelNotFoundError, "model_not_found"],
];

/**
 * Erreur du port vers l'erreur typée du contrat. Toute exception inattendue devient `unavailable` :
 * jamais un 500, et l'original n'est ni renvoyé ni envoyé à Sentry.
 */
export function portFailure(error: unknown): ORPCError<string, unknown> {
  if (error instanceof LlmRateLimitedError) {
    return rateLimited(Math.ceil(error.retryAfterMs / 1000));
  }
  if (error instanceof LlmInvalidOutputError) return outputInvalid();
  const match = REASONS.find(([type]) => error instanceof type);
  return providerError(match?.[1] ?? "unavailable");
}

/** Seul un 401 explicite invalide la clé ; un 403 ou un statut absent n'y touche pas. */
export const isRejectedKey = (error: unknown): boolean =>
  error instanceof LlmAuthError && error.status === 401;

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Nom de l'erreur seulement (jamais son message) ; un nom inhabituel est ramené à `Error`. */
export function errorNameOf(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  return NAME_PATTERN.test(name) ? name : "Error";
}
