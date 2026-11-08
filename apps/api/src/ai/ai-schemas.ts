import { checkCriteriaSteps, type Feature } from "@koklo/schema";
import { z } from "zod";
import { safeText } from "./ai-text-policy.ts";

/** Bornes du contrat 0.9.0 (`@koklo/contract`, schemas-ai) : la sortie du modèle a la même forme. */
const CRITERIA_MAX = 12;
export const DEFAULT_MAX_FEATURES = 8;

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
 * Ordre Étant donné -> Quand -> Alors : la règle 5 de `@koklo/schema` (rendue stricte par le statut
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

const criteriaSchema = z
  .array(criterionSchema)
  .min(1)
  .max(CRITERIA_MAX)
  .refine(hasOrderedSteps, "ordre des étapes");

const featureSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    priority: z.enum(["must", "should", "could", "wont"]),
    description: safeText({ min: 0, max: 4000, multiline: true }),
    criteria: criteriaSchema,
  })
  .strict();

const briefSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    problem: safeText({ min: 1, max: 2000, multiline: true }),
    users: safeText({ min: 1, max: 2000, multiline: true }),
    expectedOutcome: safeText({ min: 1, max: 2000, multiline: true }),
    constraints: safeText({ min: 0, max: 2000, multiline: true }),
    openQuestions: z.array(safeText({ min: 1, max: 500 })).max(10),
  })
  .strict();

const IDEA_PROPOSALS_MAX = 3;
const IDEA_CONTENT_TOTAL_MAX = 50_000;
const ideaProposalSchema = z
  .object({
    op: z.enum(["insert_after", "replace", "append", "create_page"]),
    anchorBlockIndex: z.number().int().min(0).nullable(),
    rangeEnd: z.number().int().min(0).nullable(),
    title: safeText({ min: 1, max: 120 }).nullable(),
    contentMd: safeText({ min: 1, max: IDEA_CONTENT_TOTAL_MAX, multiline: true }),
    rationale: safeText({ min: 1, max: 200 }),
  })
  .strict();

/** Propositions de l'agent : texte filtré par la politique de contenu, 50 000 caractères au total (B223). */
export const ideaProposalsOutputSchema = z
  .object({ proposals: z.array(ideaProposalSchema).max(IDEA_PROPOSALS_MAX) })
  .strict()
  .refine(
    ({ proposals }) =>
      proposals.reduce((sum, proposal) => sum + proposal.contentMd.length, 0) <=
      IDEA_CONTENT_TOTAL_MAX,
    "contenu total",
  );

/** Manques du dossier : la page est un titre (existante ou à créer), jamais un identifiant. */
export const ideaGapsOutputSchema = z
  .object({
    items: z
      .array(
        z
          .object({ page: safeText({ min: 1, max: 120 }), text: safeText({ min: 1, max: 200 }) })
          .strict(),
      )
      .max(10),
  })
  .strict();

/** `maxFeatures` : borne appliquée à la sortie (le modèle la connaît, mais ne la fait pas respecter). */
export const featuresOutputSchema = (maxFeatures: number) =>
  z.object({ features: z.array(featureSchema).min(1).max(maxFeatures) }).strict();

export const criteriaOutputSchema = z.object({ criteria: criteriaSchema }).strict();
export const briefOutputSchema = briefSchema;

/** Mots-clés de contrainte que la sortie structurée du fournisseur ne gère pas : le Zod strict les applique. */
const UNSUPPORTED = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "pattern",
  "format",
]);

function withoutConstraints(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutConstraints);
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !UNSUPPORTED.has(key))
      .map(([key, value]) => [key, withoutConstraints(value)]),
  );
}

/** Schéma JSON demandé au fournisseur : la structure seulement ; les bornes sont revérifiées par Zod. */
export function jsonSchemaOf(schema: z.ZodType): Readonly<Record<string, unknown>> {
  return withoutConstraints(z.toJSONSchema(schema, { io: "output" })) as Record<string, unknown>;
}
