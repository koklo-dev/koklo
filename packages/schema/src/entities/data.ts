import { z } from "zod";
import type { TableV2 } from "./data-v2.ts";
import { FEATURE_ZONE_MAX_LENGTH } from "./feature.ts";
import { endpointId, PATTERNS, tableId } from "./ids.ts";

const FieldSchema = z.strictObject({
  nom: z.string().regex(PATTERNS.fieldName),
  type: z.enum(["uuid", "text", "integer", "decimal", "boolean", "timestamp", "json"]),
  nullable: z.boolean(),
  unique: z.boolean(),
});

/** Table au format v1 (`data/tables/T-<slug>.yaml`). */
export const TableSchema = z.strictObject({
  id: tableId,
  description: z.string().optional(),
  champs: z.array(FieldSchema),
});

export const RelationSchema = z.strictObject({
  from: z.string().regex(PATTERNS.tableField),
  to: z.string().regex(PATTERNS.tableField),
  cardinalite: z.enum(["1-1", "1-n", "n-1", "n-n"]),
});

/** Forme de `data/relations.yaml`. */
export const RelationsFileSchema = z.strictObject({ relations: z.array(RelationSchema) });

const jsonObject = z.record(z.string(), z.unknown());

export const EndpointSchema = z.strictObject({
  id: endpointId,
  /** Zone du produit (format v2 : premier segment de l'identifiant `zone.verbe`). */
  zone: z.string().min(1).max(FEATURE_ZONE_MAX_LENGTH).optional(),
  methode: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  chemin: z.string().startsWith("/"),
  entree: jsonObject.optional(),
  sortie: jsonObject.optional(),
  erreurs: z.array(z.strictObject({ statut: z.int(), code: z.string().min(1) })).optional(),
  tables: z.array(tableId).optional(),
});

export type TableV1 = z.output<typeof TableSchema>;
/** Table lue dans l'un ou l'autre format ; la v2 est définie dans `data-v2.ts`. */
export type Table = TableV1 | TableV2;
export type Relation = z.output<typeof RelationSchema>;
export type RelationsFile = z.output<typeof RelationsFileSchema>;
export type Endpoint = z.output<typeof EndpointSchema>;
