import { z } from "zod";
import {
  AROUND_WITH_CURSOR_MESSAGE,
  listInputShape,
  noAroundWithCursor,
  pageNumberOf,
} from "./schemas-lists.ts";

/**
 * Tables et jeux d'exemple (TK-107, contrat 3.5.0, B383 à B391). Valeurs et motifs identiques à ceux de @koklo/schema
 * (parité vérifiée par apps/api/test). Les identifiants `T-<slug>` et `FX-<slug>` sont attribués par le serveur à la
 * création, d'après le nom ou le titre.
 */
const slug = "[a-z0-9][a-z0-9-]*";
export const tableIdSchema = z.string().regex(new RegExp(`^T-${slug}$`));
export const fixtureIdSchema = z.string().regex(new RegExp(`^FX-${slug}$`));
/** Types de champ : vocabulaire fermé, `texte(n)` et `ref(T-slug)`. */
export const fieldTypeSchema = z
  .string()
  .regex(
    new RegExp(
      `^(uuid|texte\\(\\d+\\)|entier|decimal|booleen|horodatage|date|enum|json|ref\\(T-${slug}\\))$`,
    ),
  );
export const CARDINALITIES = ["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"] as const;
export const cardinalitySchema = z.enum(CARDINALITIES);

const DATA_ZONE_MAX_LENGTH = 80;
const zoneSchema = z.string().min(1).max(DATA_ZONE_MAX_LENGTH);
const fieldNameSchema = z.string().regex(/^[a-z_][a-z0-9_]*$/);
const text = (max: number) => z.string().min(1).max(max);
const sourceLink = z.string().regex(/^(F-\d{3,}|R-\d{3,})$/);
const ruleLink = z.string().regex(/^R-\d{3,}$/);
/** Valeur d'une cellule d'un jeu : scalaire, jamais d'objet. */
export const cellSchema = z.union([z.string(), z.number(), z.boolean()]);
export const FIXTURE_ROWS_MAX = 200;

// --- Écriture ---
const tableFieldSchema = z
  .object({
    name: fieldNameSchema,
    type: fieldTypeSchema,
    primaryKey: z.boolean().optional(),
    constraints: text(300).optional(),
    values: z.array(text(100)).min(1).max(50).optional(),
    rule: ruleLink.optional(),
    personalData: z.boolean().optional(),
  })
  .refine((field) => field.type !== "enum" || field.values !== undefined, {
    message: "un champ enum porte la liste values",
    path: ["values"],
  });
const tableRelationSchema = z.object({ to: tableIdSchema, cardinality: cardinalitySchema });

const tableFields = {
  name: text(120),
  zone: zoneSchema,
  description: z.string().max(2000),
  fields: z.array(tableFieldSchema).min(1).max(100),
  sources: z.array(sourceLink).max(50),
  relations: z.array(tableRelationSchema).max(50),
};

export const tableCreateSchema = z
  .object(tableFields)
  .partial()
  .required({ name: true, zone: true, fields: true })
  .extend({ kind: z.literal("table.create") });
export const tableUpdateSchema = z
  .object(tableFields)
  .partial()
  .extend({ kind: z.literal("table.update"), specId: tableIdSchema })
  .refine(
    (op) =>
      Object.keys(tableFields).some((key) => (op as Record<string, unknown>)[key] !== undefined),
    {
      message: "au moins un champ modifié",
    },
  );
export const tableDeleteSchema = z.object({
  kind: z.literal("table.delete"),
  specId: tableIdSchema,
});
/** Jeu d'exemple : valeurs fictives, 200 lignes au plus (le volume réel est généré côté serveur, TK-110). */
export const fixtureCreateSchema = z.object({
  kind: z.literal("fixture.create"),
  title: text(200),
  table: tableIdSchema,
  locale: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional(),
  rows: z.array(z.record(fieldNameSchema, cellSchema)).max(FIXTURE_ROWS_MAX),
});

export const DATA_OPERATION_KINDS = [
  "table.create",
  "table.update",
  "table.delete",
  "fixture.create",
] as const;

// --- Lecture : fiche d'une table (panneau d'édition) ---
export const tableDetailSchema = z.object({
  specId: tableIdSchema,
  name: z.string(),
  description: z.string(),
  zone: zoneSchema.optional(),
  sources: z.array(sourceLink),
  fields: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      primaryKey: z.boolean(),
      constraints: z.string().optional(),
      values: z.array(z.string()).optional(),
      rule: ruleLink.optional(),
      personalData: z.boolean(),
    }),
  ),
  relations: z.array(tableRelationSchema),
  filePath: z.string(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
});

// --- Lecture : onglets Tables et Jeux d'exemple ---
const revision = {
  branch: z.string().min(1).optional(),
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
};
const exclusiveRevision = (value: { branch?: string; commitSha?: string }) =>
  value.branch === undefined || value.commitSha === undefined;
const REVISION_MESSAGE = "branch et commitSha sont exclusifs";

/** `around` : une table `T-<slug>` à amener dans la page (lien direct, B388). `zone` filtre sur toute la tête. */
export const dataTablesListInputSchema = z
  .object({
    projectId: z.uuid(),
    zone: zoneSchema.optional(),
    ...revision,
    ...listInputShape(tableIdSchema),
  })
  .refine(exclusiveRevision, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
export const dataTableSummarySchema = z.object({
  specId: tableIdSchema,
  name: z.string(),
  zone: zoneSchema.optional(),
  fieldCount: z.number().int().min(0),
  /** Relations déclarées par la table et relations qui la visent (B384). */
  relationCount: z.number().int().min(0),
  /** « Utilisée par » : les fonctionnalités et règles citées par `source`. */
  usedBy: z.array(sourceLink),
  personalData: z.boolean(),
  filePath: z.string(),
});

export const dataMermaidInputSchema = z
  .object({ projectId: z.uuid(), ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);
/** `generated` : `data/model.mmd` est absent de la tête, le texte est produit à la volée depuis les tables. */
export const dataMermaidSchema = z.object({
  text: z.string(),
  generated: z.boolean(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
});

export const dataFixturesListInputSchema = dataMermaidInputSchema;
export const dataFixtureSummarySchema = z.object({
  specId: fixtureIdSchema,
  title: z.string(),
  table: tableIdSchema,
  locale: z.string(),
  rowCount: z.number().int().min(0),
  filePath: z.string(),
});
export const dataFixturesListSchema = z.object({ items: z.array(dataFixtureSummarySchema) });

/** Lignes d'un jeu, 25 par page (tableau paginé de la passation 08 §2.2). */
export const dataFixtureRowsInputSchema = z
  .object({
    projectId: z.uuid(),
    fixtureId: fixtureIdSchema,
    page: z.coerce.number().int().min(1),
    size: z.coerce.number().pipe(z.literal(25)),
    ...revision,
  })
  .refine(exclusiveRevision, REVISION_MESSAGE);
export const dataFixtureRowsSchema = pageNumberOf(z.record(z.string(), cellSchema)).extend({
  columns: z.array(z.string()),
});
