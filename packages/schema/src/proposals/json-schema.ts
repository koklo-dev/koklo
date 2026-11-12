import { z } from "zod";

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
