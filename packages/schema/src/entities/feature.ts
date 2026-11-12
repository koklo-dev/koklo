import { z } from "zod";
import {
  criterionId,
  endpointId,
  featureId,
  PATTERNS,
  roleId,
  ruleId,
  screenId,
  tableId,
} from "./ids.ts";

export const STEP_TYPES = ["etant_donne", "quand", "alors", "et"] as const;

const StepSchema = z.strictObject({ type: z.enum(STEP_TYPES), texte: z.string().min(1) });

export const CriterionSchema = z.strictObject({
  id: criterionId,
  titre: z.string().min(1),
  etapes: z.array(StepSchema),
});

const links = <T extends z.ZodType>(item: T) => z.array(item).default([]);

/** Zone du produit (texte brut, une ligne) : regroupe les fonctionnalités proposées par l'agent. */
export const FEATURE_ZONE_MAX_LENGTH = 80;

export const FeatureSchema = z.strictObject({
  id: featureId,
  titre: z.string().min(1),
  statut: z.enum(["brouillon", "specifiee", "implementee", "adoptee"]),
  priorite: z.enum(["must", "should", "could", "wont"]),
  zone: z.string().min(1).max(FEATURE_ZONE_MAX_LENGTH).optional(),
  tables: links(tableId),
  endpoints: links(endpointId),
  ecrans: links(screenId),
  roles: links(roleId),
  regles: links(ruleId),
  nfr: links(z.string().regex(PATTERNS.nfr)),
  description: z.string(),
  criteres: z.array(CriterionSchema),
});

export type Feature = z.output<typeof FeatureSchema>;
export type Criterion = z.output<typeof CriterionSchema>;
