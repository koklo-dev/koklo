import { validationError } from "./errors.ts";
import { route, writeOneErrors } from "./route-helpers.ts";
import {
  projectClientAddInputSchema,
  projectClientListInputSchema,
  projectClientRemoveInputSchema,
  projectClientRemoveOutputSchema,
  projectClientSchema,
} from "./schemas-project-client.ts";

const COLLECTION = "/projects/{projectId}/clients";

/**
 * Liens client <-> projet (CDC §14, TK-55a) : owner et admin seulement. Un projet étranger ou
 * inconnu est un NOT_FOUND uniforme ; un membre non client, étranger ou inconnu un VALIDATION
 * unique (aucun oracle d'existence).
 */
export const projectClient = {
  list: route("GET", COLLECTION)
    .errors(writeOneErrors)
    .input(projectClientListInputSchema)
    .output(projectClientSchema.array()),
  add: route("POST", COLLECTION)
    .errors({ ...writeOneErrors, ...validationError })
    .input(projectClientAddInputSchema)
    .output(projectClientSchema),
  remove: route("DELETE", `${COLLECTION}/{memberId}`)
    .errors(writeOneErrors)
    .input(projectClientRemoveInputSchema)
    .output(projectClientRemoveOutputSchema),
};
