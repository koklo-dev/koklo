import {
  encryptionUnavailableError,
  notFoundError,
  providerErrors,
  specIndexFailedError,
  validationError,
} from "./errors.ts";
import {
  llmNotConfiguredError,
  llmOutputInvalidError,
  llmProviderError,
  llmRateLimitedError,
  promptRejectedError,
} from "./errors-ai.ts";
import { route, writeErrors } from "./route-helpers.ts";
import {
  aiDraftBriefInputSchema,
  aiDraftBriefOutputSchema,
  aiProposeCriteriaInputSchema,
  aiProposeCriteriaOutputSchema,
  aiProposeFeaturesInputSchema,
  aiProposeFeaturesOutputSchema,
} from "./schemas-ai.ts";

/** Erreurs d'un appel au modèle, partagées par `ai.*` et `llmCredential.verify`. */
export const llmCallErrors = {
  ...writeErrors,
  ...validationError,
  ...encryptionUnavailableError,
  ...llmNotConfiguredError,
  ...llmRateLimitedError,
  ...llmProviderError,
} as const;

const proposalErrors = {
  ...llmCallErrors,
  ...notFoundError,
  ...llmOutputInvalidError,
  ...promptRejectedError,
} as const;

/**
 * Propositions de l'IA (CDC §14 : `SPEC_BATCH_ROLES`). Rien n'est écrit ni conservé : l'humain
 * relit puis soumet à `specBatch.submit`.
 */
export const ai = {
  draftBrief: route("POST", "/projects/{projectId}/ai/brief")
    .errors(proposalErrors)
    .input(aiDraftBriefInputSchema)
    .output(aiDraftBriefOutputSchema),
  proposeFeatures: route("POST", "/projects/{projectId}/ai/features")
    .errors(proposalErrors)
    .input(aiProposeFeaturesInputSchema)
    .output(aiProposeFeaturesOutputSchema),
  /** Lit la feature dans git au commit indexé : erreurs du fournisseur et de l'index comme `spec.getFeature`. */
  proposeCriteria: route("POST", "/projects/{projectId}/ai/criteria")
    .errors({ ...proposalErrors, ...providerErrors, ...specIndexFailedError })
    .input(aiProposeCriteriaInputSchema)
    .output(aiProposeCriteriaOutputSchema),
};
