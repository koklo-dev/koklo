import {
  forbiddenOf,
  ideaConflictError,
  internalError,
  notFoundError,
  providerErrors,
  specBatchConflictError,
  unauthorizedError,
  validationError,
} from "./errors.ts";
import { readOneErrors, route, writeOneErrors } from "./route-helpers.ts";
import {
  ideaAgentStatusInputSchema,
  ideaAgentStatusOutputSchema,
  ideaGetInputSchema,
  ideaListInputSchema,
  ideaListOutputSchema,
  ideaMessageListInputSchema,
  ideaMessageListOutputSchema,
  ideaPageCreateInputSchema,
  ideaPageDetailSchema,
  ideaPageRefInputSchema,
  ideaPageRenameInputSchema,
  ideaPageReorderInputSchema,
  ideaPageReorderOutputSchema,
  ideaPageSchema,
  ideaPageSummarySchema,
  ideaPresenceInputSchema,
  ideaPresenceOutputSchema,
  ideaProposalDecideInputSchema,
  ideaProposalOutputSchema,
  ideaProposalRefInputSchema,
  ideaPublishInputSchema,
  ideaPublishOutputSchema,
  ideaSaveInputSchema,
  ideaSetStatusInputSchema,
} from "./schemas-idea.ts";

const BASE = "/projects/{projectId}/idea";
const PAGE = `${BASE}/pages/{pageId}`;

const writeErrors = { ...writeOneErrors, ...validationError } as const;
/** Une page requise ne se supprime pas : seul refus motivé de cette route (le rôle reste 403 sans raison). */
const deleteErrors = {
  ...internalError,
  ...unauthorizedError,
  ...forbiddenOf("required_page"),
  ...notFoundError,
} as const;

const page = {
  create: route("POST", `${BASE}/pages`)
    .errors(writeErrors)
    .input(ideaPageCreateInputSchema)
    .output(ideaPageSchema),
  rename: route("PATCH", PAGE)
    .errors(writeErrors)
    .input(ideaPageRenameInputSchema)
    .output(ideaPageSchema),
  reorder: route("PUT", `${BASE}/pages/order`)
    .errors(writeErrors)
    .input(ideaPageReorderInputSchema)
    .output(ideaPageReorderOutputSchema),
  delete: route("DELETE", PAGE)
    .errors(deleteErrors)
    .input(ideaPageRefInputSchema)
    .output(ideaPageSummarySchema),
  restore: route("POST", `${PAGE}/restore`)
    .errors(writeErrors)
    .input(ideaPageRefInputSchema)
    .output(ideaPageSchema),
};

/**
 * Propositions de l'agent (TK-90, contrat 2.5.0) : une décision humaine, jamais l'agent. Une version de page dépassée
 * est un CONFLICT + `currentVersion` (la proposition devient périmée) ; une proposition d'un autre projet, NOT_FOUND.
 */
const proposal = {
  decide: route("POST", `${BASE}/proposals/{proposalId}/decision`)
    .errors({ ...writeErrors, ...notFoundError, ...ideaConflictError })
    .input(ideaProposalDecideInputSchema)
    .output(ideaProposalOutputSchema),
  undo: route("POST", `${BASE}/proposals/{proposalId}/undo`)
    .errors({ ...writeErrors, ...notFoundError, ...ideaConflictError })
    .input(ideaProposalRefInputSchema)
    .output(ideaProposalOutputSchema),
};

/**
 * Espace Idée (TK-89, contrat 2.4.0 ; agent TK-90, 2.5.0) : le client rédige sans publier, le business lit. Un projet ou
 * une page hors périmètre est un NOT_FOUND uniforme ; `save` périmé rend CONFLICT + `currentVersion`.
 */
export const idea = {
  list: route("GET", `${BASE}/pages`)
    .errors(readOneErrors)
    .input(ideaListInputSchema)
    .output(ideaListOutputSchema),
  get: route("GET", PAGE)
    .errors(readOneErrors)
    .input(ideaGetInputSchema)
    .output(ideaPageDetailSchema),
  save: route("PUT", `${PAGE}/content`)
    .errors({ ...writeErrors, ...ideaConflictError })
    .input(ideaSaveInputSchema)
    .output(ideaPageSchema),
  setStatus: route("POST", `${PAGE}/status`)
    .errors(writeErrors)
    .input(ideaSetStatusInputSchema)
    .output(ideaPageSchema),
  publish: route("POST", `${BASE}/publish`)
    .errors({ ...writeErrors, ...providerErrors, ...specBatchConflictError })
    .input(ideaPublishInputSchema)
    .output(ideaPublishOutputSchema),
  presence: route("POST", `${BASE}/presence`)
    .errors(writeOneErrors)
    .input(ideaPresenceInputSchema)
    .output(ideaPresenceOutputSchema),
  message: {
    list: route("GET", `${BASE}/messages`)
      .errors({ ...readOneErrors, ...validationError })
      .input(ideaMessageListInputSchema)
      .output(ideaMessageListOutputSchema),
  },
  /** État de l'agent pour les rôles de lecture de l'espace Idée : le client ne lit pas `aiProvider.list`. */
  agent: {
    status: route("GET", `${BASE}/agent`)
      .errors(readOneErrors)
      .input(ideaAgentStatusInputSchema)
      .output(ideaAgentStatusOutputSchema),
  },
  proposal,
  page,
};
