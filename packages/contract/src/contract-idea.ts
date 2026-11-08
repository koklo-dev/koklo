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
  ideaGetInputSchema,
  ideaListInputSchema,
  ideaListOutputSchema,
  ideaPageCreateInputSchema,
  ideaPageRefInputSchema,
  ideaPageRenameInputSchema,
  ideaPageReorderInputSchema,
  ideaPageReorderOutputSchema,
  ideaPageSchema,
  ideaPageSummarySchema,
  ideaPresenceInputSchema,
  ideaPresenceOutputSchema,
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
 * Espace Idée (TK-89, contrat 2.4.0) : le client rédige sans publier, le business lit. Un projet ou
 * une page hors périmètre est un NOT_FOUND uniforme ; `save` périmé rend CONFLICT + `currentVersion`.
 */
export const idea = {
  list: route("GET", `${BASE}/pages`)
    .errors(readOneErrors)
    .input(ideaListInputSchema)
    .output(ideaListOutputSchema),
  get: route("GET", PAGE).errors(readOneErrors).input(ideaGetInputSchema).output(ideaPageSchema),
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
  page,
};
