import { conflictOf, spaceNotReadyError, staleVersionError, validationError } from "./errors.ts";
import { route, writeOneErrors } from "./route-helpers.ts";
import {
  reviewListInputSchema,
  reviewListOutputSchema,
  reviewRemindInputSchema,
  reviewRemindOutputSchema,
  reviewSubmitInputSchema,
  reviewSubmitOutputSchema,
} from "./schemas-review.ts";

const COLLECTION = "/projects/{projectId}/reviews";

const submitErrors = {
  ...writeOneErrors,
  ...validationError,
  ...conflictOf("baseline_not_open", "review_incomplete"),
  ...staleVersionError,
  ...spaceNotReadyError,
} as const;

/**
 * Validation (CDC §14, TK-55d) : le client approuve ou demande des modifications sur une feature ou
 * une baseline, liée à la version exacte qu'il a lue. Journal append-only : aucune route de
 * modification ni de suppression. Un projet ou une cible hors périmètre est un NOT_FOUND uniforme.
 */
export const review = {
  submit: route("POST", COLLECTION)
    .errors(submitErrors)
    .input(reviewSubmitInputSchema)
    .output(reviewSubmitOutputSchema),
  list: route("GET", COLLECTION)
    .errors({ ...writeOneErrors, ...validationError })
    .input(reviewListInputSchema)
    .output(reviewListOutputSchema),
  remind: route("POST", `${COLLECTION}/reminders`)
    .errors({ ...writeOneErrors, ...conflictOf("no_client") })
    .input(reviewRemindInputSchema)
    .output(reviewRemindOutputSchema),
};
