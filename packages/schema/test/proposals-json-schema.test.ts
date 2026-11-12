import { describe, expect, it } from "vitest";
import { z } from "zod";
import { featureProposalSchema, jsonSchemaOf } from "../src/index.ts";

/** TK-99a lot B : le schéma JSON demandé au fournisseur vit ici (l'API et le worker le partagent). */
const keysOf = (node: unknown): string[] =>
  typeof node !== "object" || node === null
    ? []
    : Object.entries(node).flatMap(([key, value]) => [key, ...keysOf(value)]);

describe("jsonSchemaOf", () => {
  it("garde la structure et retire les mots-clés de contrainte que le fournisseur ne gère pas", () => {
    const json = jsonSchemaOf(featureProposalSchema);
    const keys = keysOf(json);
    for (const unsupported of ["$schema", "minLength", "maxLength", "minItems", "maxItems"]) {
      expect(keys).not.toContain(unsupported);
    }
    expect(json).toMatchObject({ type: "object", additionalProperties: false });
    expect(Object.keys((json as { properties: object }).properties)).toEqual([
      "title",
      "priority",
      "description",
      "criteria",
    ]);
  });

  it("rend les bornes à Zod : la structure seule ne suffit pas à valider", () => {
    const schema = z.object({ text: z.string().max(3) }).strict();
    expect(jsonSchemaOf(schema)).toMatchObject({ properties: { text: { type: "string" } } });
    expect(schema.safeParse({ text: "trop long" }).success).toBe(false);
  });
});
