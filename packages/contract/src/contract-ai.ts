import { eventIterator } from "@orpc/contract";
import {
  encryptionUnavailableError,
  notFoundError,
  providerErrors,
  specIndexFailedError,
  validationError,
} from "./errors.ts";
import {
  llmCapReachedError,
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
  aiIdeaChatEventSchema,
  aiIdeaChatInputSchema,
  aiIdeaGapsInputSchema,
  aiIdeaGapsOutputSchema,
  aiIdeaSynthesisInputSchema,
  aiProposeCriteriaInputSchema,
  aiProposeCriteriaOutputSchema,
  aiProposeFeaturesInputSchema,
  aiProposeFeaturesOutputSchema,
} from "./schemas-ai.ts";
import { ideaSynthesisSchema } from "./schemas-idea.ts";

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
  ...llmCapReachedError,
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
  /**
   * Agent de l'espace Idée (TK-90, 2.5.0) : le message est streamé (SSE), les propositions suivent. Les refus
   * d'avant le flux (droit, verrou, clé, plafond) sont de vraies erreurs HTTP ; ceux du milieu du flux, des
   * évènements d'erreur de même code. L'agent ne modifie jamais une page : voir `idea.proposal.decide`.
   */
  ideaChat: route("POST", "/projects/{projectId}/ai/idea/chat")
    .errors(proposalErrors)
    .input(aiIdeaChatInputSchema)
    .output(eventIterator(aiIdeaChatEventSchema)),
  ideaGaps: route("POST", "/projects/{projectId}/ai/idea/gaps")
    .errors(proposalErrors)
    .input(aiIdeaGapsInputSchema)
    .output(aiIdeaGapsOutputSchema),
  /** Régénère la Synthèse de l'idée (TK-91, 2.6.0) : `source` = dernière version figée, `null` pour un aperçu. */
  ideaSynthesis: route("POST", "/projects/{projectId}/ai/idea/synthesis")
    .errors(proposalErrors)
    .input(aiIdeaSynthesisInputSchema)
    .output(ideaSynthesisSchema),
};
