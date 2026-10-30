import { z } from "zod";
import { endpointId, PATTERNS, tableId } from "./ids.ts";

const FieldSchema = z.strictObject({
  nom: z.string().regex(PATTERNS.fieldName),
  type: z.enum(["uuid", "text", "integer", "decimal", "boolean", "timestamp", "json"]),
  nullable: z.boolean(),
  unique: z.boolean(),
});

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
  methode: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  chemin: z.string().startsWith("/"),
  entree: jsonObject.optional(),
  sortie: jsonObject.optional(),
  erreurs: z.array(z.strictObject({ statut: z.int(), code: z.string().min(1) })).optional(),
  tables: z.array(tableId).optional(),
});

export type Table = z.output<typeof TableSchema>;
export type Relation = z.output<typeof RelationSchema>;
export type RelationsFile = z.output<typeof RelationsFileSchema>;
export type Endpoint = z.output<typeof EndpointSchema>;
