import { z } from "zod";
import { criterionId, endpointId, featureId, PATTERNS, screenId, tableId } from "./ids.ts";

export const STEP_TYPES = ["etant_donne", "quand", "alors", "et"] as const;

const StepSchema = z.strictObject({ type: z.enum(STEP_TYPES), texte: z.string().min(1) });

export const CriterionSchema = z.strictObject({
  id: criterionId,
  titre: z.string().min(1),
  etapes: z.array(StepSchema),
});

const links = <T extends z.ZodType>(item: T) => z.array(item).default([]);

export const FeatureSchema = z.strictObject({
  id: featureId,
  titre: z.string().min(1),
  statut: z.enum(["brouillon", "specifiee", "implementee", "adoptee"]),
  priorite: z.enum(["must", "should", "could", "wont"]),
  tables: links(tableId),
  endpoints: links(endpointId),
  ecrans: links(screenId),
  roles: links(z.string().regex(PATTERNS.role)),
  regles: links(z.string().regex(PATTERNS.rule)),
  nfr: links(z.string().regex(PATTERNS.nfr)),
  description: z.string(),
  criteres: z.array(CriterionSchema),
});

export type Feature = z.output<typeof FeatureSchema>;
export type Criterion = z.output<typeof CriterionSchema>;
