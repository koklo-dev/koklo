import { z } from "zod";
import { validationError } from "./errors.ts";
import { readOneErrors, route, writeOneErrors } from "./route-helpers.ts";
import {
  suggestionCreateInputSchema,
  suggestionDecideInputSchema,
  suggestionListInputSchema,
  suggestionListOutputSchema,
  suggestionSchema,
  suggestionWithdrawInputSchema,
} from "./schemas-suggestion.ts";

const COLLECTION = "/projects/{projectId}/suggestions";

/** Raisons de conflit propres au client : aucune ne parle de la structure interne. */
const conflictOf = <R extends [string, ...string[]]>(...reasons: R) =>
  ({
    CONFLICT: {
      status: 409,
      message: "Conflit avec l'état actuel",
      data: z.object({ reason: z.enum(reasons) }),
    },
  }) as const;

const createErrors = {
  ...writeOneErrors,
  ...validationError,
  ...conflictOf("suggestion_quota", "framing_closed"),
} as const;
const stateErrors = {
  ...writeOneErrors,
  ...validationError,
  ...conflictOf("suggestion_not_open"),
} as const;

/**
 * Suggestions `SG-n` (CDC §14, TK-55c) : le client suggère, l'équipe accepte ou rejette. Un projet
 * ou une suggestion hors périmètre est un NOT_FOUND uniforme ; aucune écriture de spec.
 */
export const suggestion = {
  create: route("POST", COLLECTION)
    .errors(createErrors)
    .input(suggestionCreateInputSchema)
    .output(suggestionSchema),
  list: route("GET", COLLECTION)
    .errors({ ...readOneErrors, ...validationError })
    .input(suggestionListInputSchema)
    .output(suggestionListOutputSchema),
  withdraw: route("POST", `${COLLECTION}/{id}/withdraw`)
    .errors(stateErrors)
    .input(suggestionWithdrawInputSchema)
    .output(suggestionSchema),
  accept: route("POST", `${COLLECTION}/{id}/accept`)
    .errors(stateErrors)
    .input(suggestionDecideInputSchema)
    .output(suggestionSchema),
  reject: route("POST", `${COLLECTION}/{id}/reject`)
    .errors(stateErrors)
    .input(suggestionDecideInputSchema)
    .output(suggestionSchema),
};
