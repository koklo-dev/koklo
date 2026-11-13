import { z } from "zod";
import { CARDINALITES_V2, FIELD_TYPE } from "../entities/data-v2.ts";
import { FIXTURE_ROWS_MAX, hasForeignEmailDomain } from "../entities/fixture.ts";
import { PATTERNS } from "../entities/ids.ts";
import { safeText } from "./ai-text-policy.ts";

/**
 * Types `table`, `relations`, `fixtures` du livrable Données (TK-107, B387) : les noms des champs suivent ceux des opérations
 * `table.create`, `table.update` et `fixture.create` (anglais) ; le vocabulaire des types de champ et des cardinalités est
 * celui, fermé, du format v2. L'identifiant `T-<slug>` n'est jamais fourni : le serveur le pose d'après le nom. La zone est
 * celle de la proposition, pas du contenu.
 */
const oneLine = (max: number) => safeText({ min: 1, max });
const sourceLink = z
  .string()
  .regex(new RegExp(`${PATTERNS.feature.source}|${PATTERNS.rule.source}`));
const tableLink = z.string().regex(PATTERNS.table);

const fieldProposalSchema = z
  .object({
    name: z.string().regex(PATTERNS.fieldName),
    type: z.string().regex(FIELD_TYPE),
    primaryKey: z.boolean().optional(),
    constraints: oneLine(300).optional(),
    values: z.array(oneLine(100)).min(1).max(50).optional(),
    rule: z.string().regex(PATTERNS.rule).optional(),
    personalData: z.boolean().optional(),
  })
  .strict()
  .refine((field) => field.type !== "enum" || field.values !== undefined, {
    message: "un champ enum porte la liste values",
    path: ["values"],
  });

export const tableProposalSchema = z
  .object({
    name: oneLine(120),
    description: safeText({ min: 1, max: 2000, multiline: true }).optional(),
    sources: z.array(sourceLink).max(50).optional(),
    fields: z.array(fieldProposalSchema).min(1).max(100),
  })
  .strict();

/** Relations du modèle : une proposition par lancement, chaque entrée devient une relation de la table `from`. */
export const relationsProposalSchema = z
  .object({
    relations: z
      .array(
        z.object({ from: tableLink, to: tableLink, cardinality: z.enum(CARDINALITES_V2) }).strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

const cell = z.union([oneLine(200), z.number(), z.boolean()]);

export const fixturesProposalSchema = z
  .object({
    title: oneLine(200),
    table: tableLink,
    locale: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
      .optional(),
    rows: z
      .array(z.record(z.string().regex(PATTERNS.fieldName), cell))
      .min(1)
      .max(FIXTURE_ROWS_MAX),
  })
  .strict()
  .refine(
    (fixture) =>
      !fixture.rows.some((row) =>
        Object.values(row).some(
          (value) => typeof value === "string" && hasForeignEmailDomain(value),
        ),
      ),
    { message: "une adresse e-mail d'un jeu d'exemple porte un domaine réservé", path: ["rows"] },
  );
