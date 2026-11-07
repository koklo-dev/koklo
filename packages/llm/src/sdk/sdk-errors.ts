import {
  LlmAbortedError,
  LlmInvalidOutputError,
  LlmProviderError,
  LlmTimeoutError,
} from "@koklo/domain";
import { APICallError, JSONParseError, NoObjectGeneratedError, TypeValidationError } from "ai";
import { diagnosticOf, type ErrorContext, unavailable } from "../common/diagnostic.ts";
import { errorForStatus } from "../common/errors.ts";

export interface FailureSignals {
  readonly caller: AbortSignal | undefined;
  readonly deadline: AbortSignal;
}

const MAX_CAUSE_DEPTH = 5;

const isTimeout = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { name?: unknown }).name === "TimeoutError";

/** Première erreur typée du port dans la chaîne des causes (le SDK emballe ce que `fetch` lève). */
const typedCause = (error: unknown): LlmProviderError | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth += 1) {
    if (current instanceof LlmProviderError) {
      return current;
    }
    current = (current as { cause?: unknown } | null)?.cause;
  }
  return undefined;
};

const isInvalidOutput = (error: unknown): boolean =>
  NoObjectGeneratedError.isInstance(error) ||
  JSONParseError.isInstance(error) ||
  TypeValidationError.isInstance(error);

const headerOf = (error: APICallError, name: string): string | undefined => {
  const headers = error.responseHeaders ?? {};
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
};

/**
 * Erreur typée du port pour tout échec du SDK : annulation de l'appelant, délai, erreur HTTP,
 * sortie invalide, sinon indisponible. Ni message, ni URL, ni en-tête, ni corps ne sont repris.
 */
export const toPortError = (
  error: unknown,
  context: ErrorContext,
  signals: FailureSignals,
): LlmProviderError | LlmInvalidOutputError => {
  const typed = typedCause(error);
  if (typed !== undefined) {
    return typed;
  }
  if (signals.caller?.aborted) {
    return new LlmAbortedError(diagnosticOf(context));
  }
  if (signals.deadline.aborted || isTimeout(error)) {
    return new LlmTimeoutError(diagnosticOf(context));
  }
  if (APICallError.isInstance(error) && error.statusCode !== undefined) {
    return errorForStatus(
      context,
      error.statusCode,
      headerOf(error, "retry-after"),
      error.responseBody ?? "",
    );
  }
  return isInvalidOutput(error) ? new LlmInvalidOutputError("shape") : unavailable(context);
};
