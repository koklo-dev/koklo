import { ENVIRONMENT_DATA, ENVIRONMENT_DEPLOYMENTS, STACK_STATUSES } from "@koklo/contract";
import { criteriaListSchema, featureProposalSchema, PATTERNS, safeText } from "@koklo/schema";
import { z } from "zod";

export const DEFAULT_MAX_FEATURES = 8;

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

const line = (max: number) => safeText({ min: 1, max });
const lines = (max: number, count: number) => z.array(line(max)).max(count);

/** Préremplissage de la feuille « Choix technique » (TK-115) : les critères sont des noms, sans valeur ni identifiant neuf. */
export const stackPrefillOutputSchema = z
  .object({
    role: line(120).optional(),
    components: z.array(z.string().regex(PATTERNS.component)).max(30).optional(),
    status: z.enum(STACK_STATUSES).optional(),
    choice: line(200).optional(),
    options: lines(120, 8).optional(),
    criteria: lines(120, 12).optional(),
    why: safeText({ min: 1, max: 1000, multiline: true }).optional(),
    requirements: z.array(z.string().regex(PATTERNS.nfr)).max(30).optional(),
  })
  .strict();

/** Préremplissage de la feuille « Environnement » (TK-115) : ni variable, ni valeur. */
export const environmentPrefillOutputSchema = z
  .object({
    name: line(120).optional(),
    address: line(200).optional(),
    hosting: line(200).optional(),
    database: line(200).optional(),
    data: z.enum(ENVIRONMENT_DATA).optional(),
    deployment: z.enum(ENVIRONMENT_DEPLOYMENTS).optional(),
    access: line(200).optional(),
  })
  .strict();
