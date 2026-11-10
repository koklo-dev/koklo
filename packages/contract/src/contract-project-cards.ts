import { conflictOf, validationError } from "./errors.ts";
import { readErrors, readOneErrors, route, writeOneErrors } from "./route-helpers.ts";
import {
  creationStatusSchema,
  projectCardsInputSchema,
  projectCardsOutputSchema,
  projectCreationStatusInputSchema,
  projectCreationStatusOutputSchema,
  projectRetryRepoInputSchema,
  projectSetEuOnlyInputSchema,
  projectSetEuOnlyOutputSchema,
} from "./schemas-projects.ts";

/**
 * Liste en cartes et création en une étape (TK-93, 2.8.0). Rejoint le groupe `project`.
 * `cards` : tout rôle ayant accès (le client ne voit que ses projets) ; `retryRepo` et `setEuOnly` :
 * owner et admin, rôle relu en base.
 */
export const projectCards = {
  cards: route("GET", "/projects/cards")
    .errors({ ...readErrors, ...validationError })
    .input(projectCardsInputSchema)
    .output(projectCardsOutputSchema),
  creationStatus: route("GET", "/projects/{projectId}/creation")
    .errors(readOneErrors)
    .input(projectCreationStatusInputSchema)
    .output(projectCreationStatusOutputSchema),
  retryRepo: route("POST", "/projects/{projectId}/creation/retry")
    .errors({
      ...writeOneErrors,
      ...validationError,
      ...conflictOf("creation_running", "creation_succeeded"),
    })
    .input(projectRetryRepoInputSchema)
    .output(creationStatusSchema),
  setEuOnly: route("PATCH", "/projects/{projectId}/eu-only")
    .errors(writeOneErrors)
    .input(projectSetEuOnlyInputSchema)
    .output(projectSetEuOnlyOutputSchema),
};
