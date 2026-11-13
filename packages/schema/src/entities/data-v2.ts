import { z } from "zod";
import { FEATURE_ZONE_MAX_LENGTH } from "./feature.ts";
import { featureId, PATTERNS, ruleId, tableId } from "./ids.ts";

/** Types de champ du format v2 : `texte(n)`, `ref(T-slug)` et le vocabulaire fermé. */
export const FIELD_TYPE =
  /^(uuid|texte\(\d+\)|entier|decimal|booleen|horodatage|date|enum|json|ref\(T-[a-z0-9][a-z0-9-]*\))$/;

/** Cardinalités d'une relation de table (la forme `n → 1` complète la liste de la passation). */
export const CARDINALITES_V2 = ["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"] as const;

const FieldV2Schema = z
  .strictObject({
    nom: z.string().regex(PATTERNS.fieldName),
    type: z.string().regex(FIELD_TYPE),
    cle: z.literal("primaire").optional(),
    contraintes: z.string().min(1).optional(),
    valeurs: z.array(z.string().min(1)).min(1).optional(),
    regle: ruleId.optional(),
    donnees_personnelles: z.boolean().optional(),
  })
  .refine((field) => field.type !== "enum" || field.valeurs !== undefined, {
    path: ["valeurs"],
    message: "Un champ de type enum exige la liste `valeurs`",
  });

const RelationV2Schema = z.strictObject({
  vers: tableId,
  cardinalite: z.enum(CARDINALITES_V2),
});

/** Table au format v2 (`data/tables/<slug>.yaml`, `id: T-<slug>`). */
export const TableV2Schema = z.strictObject({
  id: tableId,
  nom: z.string().min(1),
  description: z.string().optional(),
  source: z.array(z.union([featureId, ruleId])).optional(),
  zone: z.string().min(1).max(FEATURE_ZONE_MAX_LENGTH).optional(),
  champs: z.array(FieldV2Schema),
  relations: z.array(RelationV2Schema).optional(),
});

export type TableV2 = z.output<typeof TableV2Schema>;
