import {
  type LlmErrorDiagnostic,
  type LlmProviderId,
  LlmProviderUnavailableError,
} from "@koklo/domain";

export type CallOperation = "complete" | "stream";

/** Contexte d'une erreur : le fournisseur et l'opération, jamais de cause, d'en-tête ni de corps. */
export interface ErrorContext {
  readonly provider: LlmProviderId;
  readonly operation: CallOperation;
}

export const diagnosticOf = (context: ErrorContext, status?: number): LlmErrorDiagnostic => ({
  operation: context.operation,
  provider: context.provider,
  ...(status === undefined ? {} : { status }),
});

/** Réponse inexploitable ou refusée par l'adaptateur (taille, forme, bloc inattendu). */
export const unavailable = (context: ErrorContext, status?: number): LlmProviderUnavailableError =>
  new LlmProviderUnavailableError(diagnosticOf(context, status));
