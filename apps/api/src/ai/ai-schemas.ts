import { criteriaListSchema, featureProposalSchema, safeText } from "@koklo/schema";
import { z } from "zod";

export const DEFAULT_MAX_FEATURES = 8;

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

/** Synthèse de l'idée (TK-91) : un texte Markdown sans lien, balise ni image (D6), jamais d'identité. */
export const IDEA_SYNTHESIS_MAX = 12_000;
export const ideaSynthesisOutputSchema = z
  .object({ contentMd: safeText({ min: 1, max: IDEA_SYNTHESIS_MAX, multiline: true }) })
  .strict();

/** `maxFeatures` : borne appliquée à la sortie (le modèle la connaît, mais ne la fait pas respecter). */
export const featuresOutputSchema = (maxFeatures: number) =>
  z.object({ features: z.array(featureProposalSchema).min(1).max(maxFeatures) }).strict();

export const criteriaOutputSchema = z.object({ criteria: criteriaListSchema }).strict();
export const briefOutputSchema = briefSchema;

export { jsonSchemaOf } from "@koklo/schema";

/**
 * Préremplissage d'une fonctionnalité (TK-101, B329 d) : tout est facultatif, texte brut (D6) ; aucun identifiant ni statut.
 * Les liens sont des références à des éléments existants, que l'humain contrôle avant d'enregistrer.
 */
export const itemPrefillInputSchema = safeText({ min: 1, max: 500, multiline: true });
export const itemPrefillOutputSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }).optional(),
    priority: z.enum(["must", "should", "could", "wont"]).optional(),
    description: safeText({ min: 0, max: 4000, multiline: true }).optional(),
    criteria: criteriaListSchema.optional(),
    links: z
      .array(safeText({ min: 1, max: 100 }))
      .max(30)
      .optional(),
  })
  .strict();
