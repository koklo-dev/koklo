import { spaceNotReadyError, validationError } from "./errors.ts";
import { readErrors, readOneErrors, route } from "./route-helpers.ts";
import {
  clientSpaceDataFixtureRowsInputSchema,
  clientSpaceDataFixtureRowsOutputSchema,
  clientSpaceDataFixturesInputSchema,
  clientSpaceDataFixturesOutputSchema,
  clientSpaceDataModelInputSchema,
  clientSpaceDataModelOutputSchema,
  clientSpaceFeatureInputSchema,
  clientSpaceFeatureOutputSchema,
  clientSpaceFeaturesInputSchema,
  clientSpaceFeaturesOutputSchema,
  clientSpaceFlowsOutputSchema,
  clientSpaceListInputSchema,
  clientSpaceProgressInputSchema,
  clientSpaceProgressOutputSchema,
  clientSpaceProjectsInputSchema,
  clientSpaceProjectsOutputSchema,
  clientSpaceRolesInputSchema,
  clientSpaceRolesOutputSchema,
  clientSpaceRulesInputSchema,
  clientSpaceRulesOutputSchema,
} from "./schemas-client-space.ts";

/** Lectures de l'espace client (TK-55b, TK-104) : six rôles, cloisonnement par projet côté API. */
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
  progress: route("GET", "/client-space/projects/{projectId}/progress")
    .errors(spaceReadErrors)
    .input(clientSpaceProgressInputSchema)
    .output(clientSpaceProgressOutputSchema),
  flows: route("GET", "/client-space/projects/{projectId}/flows")
    .errors(spaceReadErrors)
    .input(clientSpaceListInputSchema)
    .output(clientSpaceFlowsOutputSchema),
  rules: route("GET", "/client-space/projects/{projectId}/rules")
    .errors(spaceReadErrors)
    .input(clientSpaceRulesInputSchema)
    .output(clientSpaceRulesOutputSchema),
  roles: route("GET", "/client-space/projects/{projectId}/roles")
    .errors(spaceReadErrors)
    .input(clientSpaceRolesInputSchema)
    .output(clientSpaceRolesOutputSchema),
  /** Modèle de données validé (TK-109, 3.7.0) : tables, relations, positions ; jamais le contenu technique. */
  dataModel: route("GET", "/client-space/projects/{projectId}/data/model")
    .errors(spaceReadErrors)
    .input(clientSpaceDataModelInputSchema)
    .output(clientSpaceDataModelOutputSchema),
  dataFixtures: route("GET", "/client-space/projects/{projectId}/data/fixtures")
    .errors(spaceReadErrors)
    .input(clientSpaceDataFixturesInputSchema)
    .output(clientSpaceDataFixturesOutputSchema),
  dataFixtureRows: route("GET", "/client-space/projects/{projectId}/data/fixtures/{fixtureId}/rows")
    .errors(spaceReadErrors)
    .input(clientSpaceDataFixtureRowsInputSchema)
    .output(clientSpaceDataFixtureRowsOutputSchema),
};
