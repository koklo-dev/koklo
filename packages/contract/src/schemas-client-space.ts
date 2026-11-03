import { z } from "zod";
import {
  criterionIdSchema,
  featureIdSchema,
  featurePrioritySchema,
  stepSchema,
} from "./schemas-spec.ts";
import { pageInputSchema } from "./schemas-tickets.ts";

/**
 * Espace client (TK-55b) : vocabulaire métier seulement. `version` est un jeton opaque que le
 * client renvoie tel quel ; aucune clé ni valeur ne parle de git ou de structure interne.
 */
export const clientValidationSchema = z.enum(["validated", "to_validate", "to_revise"]);
export const clientPhaseSchema = z.enum(["framing", "iteration"]);

export const clientSpaceProjectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phase: clientPhaseSchema,
});

export const clientSpaceProjectsInputSchema = z.object({});
export const clientSpaceProjectsOutputSchema = clientSpaceProjectSchema.array();

export const clientSpaceFeaturesInputSchema = z.object({
  projectId: z.uuid(),
  ...pageInputSchema,
});

export const clientFeatureSummarySchema = z.object({
  id: featureIdSchema,
  title: z.string(),
  priority: featurePrioritySchema,
  criteriaCount: z.number().int().min(0),
  validation: clientValidationSchema,
  previouslyValidated: z.boolean(),
  openSuggestions: z.number().int().min(0),
});

export const clientSpaceFeaturesOutputSchema = z.object({
  items: z.array(clientFeatureSummarySchema),
  version: z.string().min(1),
  nextCursor: z.string().nullable(),
});

export const clientSpaceFeatureInputSchema = z.object({
  projectId: z.uuid(),
  featureId: featureIdSchema,
});

export const clientSpaceFeatureOutputSchema = z.object({
  id: featureIdSchema,
  title: z.string(),
  description: z.string(),
  priority: featurePrioritySchema,
  criteria: z.array(
    z.object({ id: criterionIdSchema, title: z.string(), steps: z.array(stepSchema) }),
  ),
  validation: clientValidationSchema,
  previouslyValidated: z.boolean(),
  version: z.string().min(1),
});
