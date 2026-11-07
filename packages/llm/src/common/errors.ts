import {
  LlmAuthError,
  LlmContextTooLongError,
  LlmModelNotFoundError,
  type LlmProviderError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmTimeoutError,
} from "@koklo/domain";
import { diagnosticOf, type ErrorContext, unavailable } from "./diagnostic.ts";

const SECOND_MS = 1_000;
/** Secondes décimales seulement (pas de date HTTP, de signe, de décimale ni d'exposant). */
const RETRY_AFTER = /^\d{1,15}$/;
const OUT_OF_CREDIT =
  /credit balance is too low|insufficient_quota|exceeded your current quota|insufficient credits/i;
const TOO_LONG =
  /prompt is too long|context length|context_length_exceeded|maximum context|too many tokens/i;

/** `retry-after` en millisecondes ; toute valeur douteuse vaut 0 (le domaine plafonne à 1 h). */
export const retryAfterMs = (value: string | null | undefined): number =>
  typeof value === "string" && RETRY_AFTER.test(value) ? Number(value) * SECOND_MS : 0;

const stringOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** Message d'un corps d'erreur (`error.message` ou `message`) ; sert à reconnaître une cause. */
export const errorMessageOf = (text: string): string => {
  try {
    const body = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown } | null;
    return stringOf(body?.error?.message) || stringOf(body?.message);
  } catch {
    return "";
  }
};

/** Un 400 n'est reconnu que pour le solde de crédit et le contexte trop long ; sinon indisponible. */
const badRequest = (context: ErrorContext, message: string): LlmProviderError => {
  if (OUT_OF_CREDIT.test(message)) {
    return new LlmQuotaExceededError(diagnosticOf(context, 400));
  }
  return TOO_LONG.test(message)
    ? new LlmContextTooLongError(diagnosticOf(context, 400))
    : unavailable(context, 400);
};

const rateLimited = (context: ErrorContext, retryAfter: string | undefined, message: string) =>
  OUT_OF_CREDIT.test(message)
    ? new LlmQuotaExceededError(diagnosticOf(context, 429))
    : new LlmRateLimitedError({
        ...diagnosticOf(context, 429),
        retryAfterMs: retryAfterMs(retryAfter),
      });

/**
 * Erreur typée d'un statut HTTP en échec. `body` (texte du corps) ne sert qu'à reconnaître une cause
 * (400, 429) ; `retryAfter` est l'en-tête brut. Aucun en-tête, corps ou message amont n'est repris.
 */
export const errorForStatus = (
  context: ErrorContext,
  status: number,
  retryAfter: string | null | undefined,
  body: string,
): LlmProviderError => {
  const diagnostic = diagnosticOf(context, status);
  switch (status) {
    case 400:
      return badRequest(context, errorMessageOf(body));
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
      return rateLimited(context, retryAfter ?? undefined, errorMessageOf(body));
    default:
      return unavailable(context, status);
  }
};
