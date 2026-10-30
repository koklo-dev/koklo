import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalize, jsonSchemas } from "../src/index.ts";

const schemasDir = resolve(import.meta.dirname, "../schemas");
const NAMES = ["endpoint", "feature", "project", "relation", "screen", "table", "test-scenario"];

type JsonSchema = {
  $schema?: string;
  $id?: string;
  type?: string;
  additionalProperties?: unknown;
  required?: string[];
  properties?: Record<string, { enum?: string[]; pattern?: string; type?: string }>;
};
const schemas = jsonSchemas as unknown as Record<string, JsonSchema>;

describe("CA2 JSON Schema généré", () => {
  it("expose un schéma par entité", () => {
    expect(Object.keys(jsonSchemas).sort()).toEqual(NAMES);
  });

  it.each(NAMES)("%s : 2020-12, $id stable, objet fermé", (name) => {
    const schema = schemas[name] as JsonSchema;
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe(`https://koklo.dev/schemas/spec/v1/${name}.schema.json`);
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("feature : parité avec Zod (required, enum, pattern)", () => {
    const feature = schemas.feature as JsonSchema;
    expect(feature.required).toEqual(
      expect.arrayContaining(["id", "titre", "statut", "priorite", "description", "criteres"]),
    );
    expect(feature.required).not.toContain("tables");
    expect(feature.properties?.statut?.enum).toEqual([
      "brouillon",
      "specifiee",
      "implementee",
      "adoptee",
    ]);
    const pattern = new RegExp(feature.properties?.id?.pattern ?? "$^");
    expect(pattern.test("F-001")).toBe(true);
    expect(pattern.test("F-1")).toBe(false);
    expect(pattern.test("f-001")).toBe(false);
  });

  it("project : spec_version est la constante 1", () => {
    const project = schemas.project as JsonSchema;
    expect(project.required).toEqual(
      expect.arrayContaining(["projet", "organisation", "spec_version"]),
    );
    expect(JSON.stringify(project.properties?.spec_version)).toMatch(/"(const|enum)":\s*(1|\[1\])/);
  });

  it("anti-dérive : les fichiers publiés dans schemas/ sont identiques à la génération, octet à octet", () => {
    expect(readdirSync(schemasDir).sort()).toEqual(NAMES.map((n) => `${n}.schema.json`));
    for (const name of NAMES) {
      const onDisk = readFileSync(resolve(schemasDir, `${name}.schema.json`), "utf8");
      expect(
        onDisk,
        `${name}.schema.json a dérivé : pnpm --filter @koklo/schema schemas:generate`,
      ).toBe(canonicalize(jsonSchemas[name as keyof typeof jsonSchemas]));
    }
  });

  it("la génération est déterministe", () => {
    expect(canonicalize(jsonSchemas)).toBe(canonicalize(jsonSchemas));
  });
});
