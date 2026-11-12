import { z } from "zod";
import type { Feature } from "../entities/feature.ts";
import { featureId } from "../entities/ids.ts";
import { checkCriteriaSteps } from "../rules/rule5-criteria.ts";
import { safeText } from "./ai-text-policy.ts";

/** Bornes du contrat 0.9.0 (schemas-ai du contrat) : la sortie du modèle a la même forme. */
export const CRITERIA_MAX = 12;

const stepSchema = z
  .object({
    type: z.enum(["etant_donne", "quand", "alors", "et"]),
    text: safeText({ min: 1, max: 500 }),
  })
  .strict();

const criterionSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    steps: z.array(stepSchema).min(3).max(12),
  })
  .strict();

type Criterion = z.output<typeof criterionSchema>;

/**
 * Ordre Étant donné -> Quand -> Alors : la règle 5 de ce paquet (rendue stricte par le statut
 * `specifiee`), jamais une copie. Toute issue refuse la sortie.
 */
function hasOrderedSteps(criteria: readonly Criterion[]): boolean {
  const feature = {
    id: "F-000",
    titre: "proposition",
    statut: "specifiee",
    priorite: "should",
    tables: [],
    endpoints: [],
    ecrans: [],
    roles: [],
    regles: [],
    nfr: [],
    description: "",
    criteres: criteria.map((criterion, index) => ({
      id: `AC-${index + 1}`,
      titre: criterion.title,
      etapes: criterion.steps.map((step) => ({ type: step.type, texte: step.text })),
    })),
  } as unknown as Feature;
  return checkCriteriaSteps("proposal", feature).length === 0;
}

export const criteriaListSchema = z
  .array(criterionSchema)
  .min(1)
  .max(CRITERIA_MAX)
  .refine(hasOrderedSteps, "ordre des étapes");

/** Proposition `feature` : une fonctionnalité à créer (`feature.create`), sans statut ni lien. */
export const featureProposalSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    priority: z.enum(["must", "should", "could", "wont"]),
    description: safeText({ min: 0, max: 4000, multiline: true }),
    criteria: criteriaListSchema,
  })
  .strict();

/** Proposition `criteria` : des critères pour une fonctionnalité existante (`feature.update`). */
export const criteriaProposalSchema = z
  .object({ specId: featureId, criteria: criteriaListSchema })
  .strict();
