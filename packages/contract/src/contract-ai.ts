import { eventIterator } from "@orpc/contract";
import {
  conflictOf,
  encryptionUnavailableError,
  notFoundError,
  proposalInProgressError,
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
  aiPrefillItemInputSchema,
  aiPrefillItemOutputSchema,
  aiProposeCriteriaInputSchema,
  aiProposeCriteriaOutputSchema,
  aiProposeFeaturesInputSchema,
  aiProposeFeaturesOutputSchema,
} from "./schemas-ai.ts";
import { ideaSynthesisSchema } from "./schemas-idea.ts";
import {
  aiProposeDeliverableInputSchema,
  aiProposeDeliverableOutputSchema,
  aiProposeOptionsInputSchema,
  aiProposeOptionsOutputSchema,
  aiReviseProposalInputSchema,
  proposalSchema,
} from "./schemas-proposals.ts";

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
  /**
   * Lancement d'une génération de propositions (TK-99a, 2.9.0) : rapide (refus du moteur, quota et audit avant,
   * verrou en base, tâche de fond) ; la génération se lit ensuite par `proposal.list`. 409 PROPOSAL_IN_PROGRESS si un
   * lancement est déjà actif pour ce livrable.
   */
  proposeDeliverable: route("POST", "/projects/{projectId}/ai/deliverable/propose")
    .errors({ ...proposalErrors, ...proposalInProgressError })
    .input(aiProposeDeliverableInputSchema)
    .output(aiProposeDeliverableOutputSchema),
  /** Options du popover « Proposer » : comptes calculés en base, ce que l'agent lit, disponibilité. */
  proposeOptions: route("GET", "/projects/{projectId}/ai/deliverable/options")
    .errors({ ...writeErrors, ...notFoundError, ...validationError })
    .input(aiProposeOptionsInputSchema)
    .output(aiProposeOptionsOutputSchema),
  /**
   * Préremplit le formulaire d'un élément à partir d'une phrase (TK-101, 2.11.0) : texte brut, aucune écriture, aucune
   * proposition. Erreurs des propositions ; `PROPOSAL_ROLES` (client et business : 403).
   */
  prefillItem: route("POST", "/projects/{projectId}/ai/item/prefill")
    .errors(proposalErrors)
    .input(aiPrefillItemInputSchema)
    .output(aiPrefillItemOutputSchema),
  /** Révise UNE proposition (appel synchrone, texte brut) : elle reste en attente et n'entre jamais dans la spec. */
  reviseProposal: route("POST", "/projects/{projectId}/ai/proposals/{proposalId}/revise")
    .errors({ ...proposalErrors, ...conflictOf("proposal_applied") })
    .input(aiReviseProposalInputSchema)
    .output(proposalSchema),
};
