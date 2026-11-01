import { type LlmErrorDiagnostic, LlmProviderUnavailableError } from "@koklo/domain";

/** Diagnostic commun de toutes les erreurs de l'adaptateur : jamais de cause, d'en-tête ni de corps. */
export const diagnosticOf = (status?: number): LlmErrorDiagnostic => ({
  operation: "complete",
  provider: "anthropic",
  ...(status === undefined ? {} : { status }),
});

/** Réponse inexploitable ou refusée par l'adaptateur (taille, forme, bloc inattendu). */
export const unavailable = (status?: number): LlmProviderUnavailableError =>
  new LlmProviderUnavailableError(diagnosticOf(status));
