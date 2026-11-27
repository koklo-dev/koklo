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

export const submitErrors = {
  ...writeOneErrors,
  ...validationError,
  /**
   * `choices_open` (3.18.0, B775) : un choix technique de la tête reste à trancher. Sécurité (3.19.0, B804) :
   * `threats_open` (menace élevée sans parade) puis `data_unclassified` (champ non classé ou sans durée).
   */
  ...conflictOf(
    "baseline_not_open",
    "review_incomplete",
    "choices_open",
    "threats_open",
    "data_unclassified",
  ),
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
