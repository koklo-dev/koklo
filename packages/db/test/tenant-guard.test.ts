import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { schemaPath } from "../src/testing/prisma-cli.ts";
import { LLM_MODELS } from "./support/llm-credentials-fixtures.ts";
import { OAUTH_MODELS } from "./support/oauth-fixtures.ts";
import { SPEC_MODELS } from "./support/spec-fixtures.ts";
import { SUGGESTION_MODELS } from "./support/suggestions-fixtures.ts";
import { TICKET_MODELS } from "./support/ticket-fixtures.ts";

const { TENANT_MODELS, TENANT_EXCLUDED_MODELS } = dbPackage;

interface SchemaModel {
  name: string;
  body: string;
}

function schemaModels(): SchemaModel[] {
  const source = readFileSync(schemaPath, "utf8");
  return [...source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({
    name: m[1] as string,
    body: m[2] as string,
  }));
}

const EXPECTED_TENANT_MODELS = [
  "Project",
  ...TICKET_MODELS,
  ...SPEC_MODELS,
  ...OAUTH_MODELS,
  ...LLM_MODELS,
  ...SUGGESTION_MODELS,
];

const carriesOrganizationId = (model: SchemaModel) => /^\s*organizationId\s/m.test(model.body);

describe("garde multi-tenant : tout modèle portant organizationId est classé (TK-20 C5)", () => {
  it("exporte la liste des modèles métier et les exclusions documentées", () => {
    expect(Array.isArray(TENANT_MODELS)).toBe(true);
    expect(typeof TENANT_EXCLUDED_MODELS).toBe("object");
  });

  it("les modèles métier : Project, ticket (TK-28), spec (TK-41), OAuth (TK-48a1), BYOK (TK-51a), suggestions (TK-51b)", () => {
    expect([...TENANT_MODELS].sort()).toEqual([...EXPECTED_TENANT_MODELS].sort());
  });

  it("chaque modèle avec organizationId est métier ou explicitement exclu", () => {
    const classified = new Set([...TENANT_MODELS, ...Object.keys(TENANT_EXCLUDED_MODELS)]);
    const unclassified = schemaModels()
      .filter(carriesOrganizationId)
      .map((model) => model.name)
      .filter((name) => !classified.has(name));
    expect(unclassified, "modèles à classer dans TENANT_MODELS ou TENANT_EXCLUDED_MODELS").toEqual(
      [],
    );
  });

  it("Member et Invitation (organizationId géré par Better Auth) sont exclus", () => {
    expect(Object.keys(TENANT_EXCLUDED_MODELS).sort()).toEqual(
      [
        "Account",
        "Invitation",
        "Member",
        "Organization",
        "Session",
        "User",
        "Verification",
        "WebhookDelivery",
      ].sort(),
    );
  });

  it("chaque exclusion est justifiée par une raison non vide", () => {
    for (const [model, reason] of Object.entries(TENANT_EXCLUDED_MODELS)) {
      expect(reason.trim().length, `raison de ${model}`).toBeGreaterThan(10);
    }
  });

  it("aucun modèle n'est à la fois métier et exclu, et tous existent dans le schéma", () => {
    const names = new Set(schemaModels().map((model) => model.name));
    for (const model of TENANT_MODELS) {
      expect(TENANT_EXCLUDED_MODELS, model).not.toHaveProperty(model);
      expect(names.has(model), `${model} existe dans schema.prisma`).toBe(true);
    }
    for (const model of Object.keys(TENANT_EXCLUDED_MODELS)) {
      expect(names.has(model), `${model} existe dans schema.prisma`).toBe(true);
    }
  });

  it("chaque modèle métier porte organizationId et un @@index([organizationId])", () => {
    const byName = new Map(schemaModels().map((model) => [model.name, model]));
    for (const name of TENANT_MODELS) {
      const model = byName.get(name);
      expect(model && carriesOrganizationId(model), `${name}.organizationId`).toBe(true);
      expect(model?.body, `${name} index`).toMatch(/@@index\(\[organizationId\]\)/);
    }
  });
});
