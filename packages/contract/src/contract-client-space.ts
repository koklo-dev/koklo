import { spaceNotReadyError, validationError } from "./errors.ts";
import { readErrors, readOneErrors, route } from "./route-helpers.ts";
import {
  clientSpaceFeatureInputSchema,
  clientSpaceFeatureOutputSchema,
  clientSpaceFeaturesInputSchema,
  clientSpaceFeaturesOutputSchema,
  clientSpaceProjectsInputSchema,
  clientSpaceProjectsOutputSchema,
} from "./schemas-client-space.ts";

/** Lectures de l'espace client (TK-55b) : six rôles, cloisonnement par projet côté API. */
const spaceReadErrors = { ...readOneErrors, ...validationError, ...spaceNotReadyError } as const;

export const clientSpace = {
  projects: route("GET", "/client-space/projects")
    .errors(readErrors)
    .input(clientSpaceProjectsInputSchema)
    .output(clientSpaceProjectsOutputSchema),
  features: route("GET", "/client-space/projects/{projectId}/features")
    .errors(spaceReadErrors)
    .input(clientSpaceFeaturesInputSchema)
    .output(clientSpaceFeaturesOutputSchema),
  feature: route("GET", "/client-space/projects/{projectId}/features/{featureId}")
    .errors(spaceReadErrors)
    .input(clientSpaceFeatureInputSchema)
    .output(clientSpaceFeatureOutputSchema),
};
