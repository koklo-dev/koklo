import {
  LlmAuthError,
  LlmContextTooLongError,
  LlmModelNotFoundError,
  type LlmProviderError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmTimeoutError,
} from "@koklo/domain";
import { diagnosticOf, unavailable } from "./diagnostic.ts";

const SECOND_MS = 1_000;
/** Secondes décimales seulement (pas de date HTTP, de signe, de décimale ni d'exposant). */
const RETRY_AFTER = /^\d{1,15}$/;
const CREDIT_TOO_LOW = /credit balance is too low/i;
const PROMPT_TOO_LONG = /prompt is too long/i;

/** `retry-after` en millisecondes ; toute valeur douteuse vaut 0 (le domaine plafonne à 1 h). */
export const retryAfterMs = (value: string | null): number =>
  value !== null && RETRY_AFTER.test(value) ? Number(value) * SECOND_MS : 0;

/** Message d'un corps d'erreur Anthropic ; sert à reconnaître une cause, jamais à la rapporter. */
export const errorMessageOf = (text: string): string => {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } } | null)?.error?.message;
    return typeof message === "string" ? message : "";
  } catch {
    return "";
  }
};

/** Un 400 n'est reconnu que pour le solde de crédit et le prompt trop long ; sinon indisponible. */
const badRequest = (message: string): LlmProviderError => {
  if (CREDIT_TOO_LOW.test(message)) {
    return new LlmQuotaExceededError(diagnosticOf(400));
  }
  return PROMPT_TOO_LONG.test(message)
    ? new LlmContextTooLongError(diagnosticOf(400))
    : unavailable(400);
};

/**
 * Erreur typée d'un statut HTTP en échec. `body` (texte du corps) n'est utile que pour un 400 ;
 * `retryAfter` est l'en-tête brut. Aucun en-tête, corps ou message amont n'est repris.
 */
export const errorForStatus = (
  status: number,
  retryAfter: string | null,
  body: string,
): LlmProviderError => {
  const diagnostic = diagnosticOf(status);
  switch (status) {
    case 400:
      return badRequest(errorMessageOf(body));
    case 401:
    case 403:
      return new LlmAuthError(diagnostic);
    case 402:
      return new LlmQuotaExceededError(diagnostic);
    case 404:
      return new LlmModelNotFoundError(diagnostic);
    case 408:
      return new LlmTimeoutError(diagnostic);
    case 413:
      return new LlmContextTooLongError(diagnostic);
    case 429:
      return new LlmRateLimitedError({ ...diagnostic, retryAfterMs: retryAfterMs(retryAfter) });
    default:
      return unavailable(status);
  }
};
