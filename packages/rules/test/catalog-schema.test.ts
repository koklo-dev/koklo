import { describe, expect, it } from "vitest";
import {
  AGENT_ROLES,
  catalogSchema,
  enforcementSchema,
  PROFILE_KINDS,
  profileSchema,
  ruleSchema,
} from "../src/index.ts";
import { minimalCatalog } from "./helpers.ts";

const rule = () =>
  (minimalCatalog().rules as Record<string, unknown>[])[0] as Record<string, unknown>;

describe("enforcementSchema (gate | evidence | instruction)", () => {
  it.each([
    [{ kind: "gate", adapter: "secret-scan" }],
    [{ kind: "gate", adapter: "biome", command: "pnpm lint" }],
    [{ kind: "evidence", evidence: "Liste des fichiers modifiés" }],
    [{ kind: "instruction" }],
  ])("accepte %j", (value) => {
    expect(enforcementSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    [{ kind: "gate" }, "gate sans adapter"],
    [{ kind: "gate", adapter: "" }, "adapter vide"],
    [{ kind: "evidence" }, "evidence sans texte"],
    [{ kind: "instruction", adapter: "x" }, "instruction avec clé en trop"],
    [{ kind: "magic" }, "type inconnu"],
    [{}, "sans kind"],
  ])("rejette %j (%s)", (value, _why) => {
    expect(enforcementSchema.safeParse(value).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepte chaque kind connu", () => {
    for (const kind of PROFILE_KINDS) {
      expect(profileSchema.safeParse({ kind, description: "d" }).success).toBe(true);
    }
  });
  it("liste fermée des kinds, dont `standard` (D2)", () => {
    expect([...PROFILE_KINDS]).toEqual([
      "global",
      "language",
      "domain",
      "infrastructure",
      "business",
      "standard",
    ]);
  });
  it("rejette un kind inconnu ou une clé en trop", () => {
    expect(profileSchema.safeParse({ kind: "other", description: "d" }).success).toBe(false);
    expect(profileSchema.safeParse({ kind: "global", description: "d", x: 1 }).success).toBe(false);
  });
});

describe("ruleSchema", () => {
  it("accepte une règle valide au format JSON d'entrée", () => {
    expect(ruleSchema.safeParse(rule()).success).toBe(true);
  });
  it("liste fermée des 8 rôles d'agent", () => {
    expect([...AGENT_ROLES].sort()).toEqual(
      [
        "analyst",
        "designer",
        "developer",
        "doc-writer",
        "product-owner",
        "qa-reviewer",
        "tech-lead",
        "test-writer",
      ].sort(),
    );
  });
  it.each([
    ["id sans point", { id: "secrets" }],
    ["id en majuscules", { id: "Global.Secrets" }],
    ["profiles vide", { profiles: [] }],
    ["agents vide", { agents: [] }],
    ["agents en double", { agents: ["developer", "developer"] }],
    ["rôle inconnu", { agents: ["intern"] }],
    ["sévérité inconnue", { severity: "fatal" }],
    ["titre vide", { title: "" }],
    ["clé inconnue", { surprise: 1 }],
  ])("rejette : %s", (_name, patch) => {
    expect(ruleSchema.safeParse({ ...rule(), ...patch }).success).toBe(false);
  });
  it("protected vaut false par défaut", () => {
    const { protected: _p, ...rest } = rule();
    const parsed = ruleSchema.safeParse(rest);
    expect(parsed.success && parsed.data.protected).toBe(false);
  });
  it("une règle protégée est toujours blocking", () => {
    const r = { ...rule(), protected: true, severity: "advisory" };
    expect(ruleSchema.safeParse(r).success).toBe(false);
  });
});

describe("catalogSchema : snake_case en entrée, camelCase en sortie", () => {
  it("transforme les clés de premier niveau", () => {
    const parsed = catalogSchema.safeParse(minimalCatalog());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.schemaVersion).toBe(1);
    expect(parsed.data.catalogVersion).toBe("2026.11.0");
    expect(parsed.data.protectedRuleIds).toEqual(["global.secrets"]);
    expect(Object.keys(parsed.data.profiles)).toEqual(["core", "node"]);
    expect(parsed.data.rules.map((r) => r.id)).toEqual([
      "global.secrets",
      "node.esm",
      "global.scope",
    ]);
  });
  it("rejette schema_version != 1", () => {
    expect(catalogSchema.safeParse({ ...minimalCatalog(), schema_version: 2 }).success).toBe(false);
  });
  it("rejette un catalogue sans règle ou sans profil", () => {
    expect(catalogSchema.safeParse({ ...minimalCatalog(), rules: [] }).success).toBe(false);
    expect(catalogSchema.safeParse({ ...minimalCatalog(), profiles: {} }).success).toBe(false);
  });
});
