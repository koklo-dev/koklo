import { describe, expect, it } from "vitest";
import {
  KOKLO_STRICT_PROFILE_ID,
  kokloStrictProfile,
  PROFILE_KINDS,
  ruleSchema,
} from "../src/index.ts";
import { LOCKED_STRICT_IDS, STRICT_IDS, strictSnapshot } from "./koklo-strict-fixtures.ts";

const byId = (id: string) => kokloStrictProfile.rules.find((r) => r.id === id);

describe("kokloStrictProfile : liste exacte et snapshot figé (vision §17.1 à 17.3)", () => {
  it("identifiant et profil de kind `standard` (D2)", () => {
    expect(KOKLO_STRICT_PROFILE_ID).toBe("koklo-strict");
    expect(kokloStrictProfile.id).toBe("koklo-strict");
    expect(kokloStrictProfile.profile.kind).toBe("standard");
    expect(PROFILE_KINDS).toContain("standard");
    expect(kokloStrictProfile.profile.description.length).toBeGreaterThan(0);
  });

  it("liste exacte des ids, triés, tous préfixés `strict.`", () => {
    expect(kokloStrictProfile.rules.map((r) => r.id)).toEqual(STRICT_IDS);
    expect(STRICT_IDS).toHaveLength(16);
    expect(STRICT_IDS).toEqual([...STRICT_IDS].sort());
    expect(new Set(STRICT_IDS).size).toBe(STRICT_IDS.length);
    for (const id of STRICT_IDS) expect(id).toMatch(/^strict\.[a-z0-9-]+$/);
  });

  it("snapshot : id, sévérité, verrou, agents et enforcement de chaque règle", () => {
    const actual = kokloStrictProfile.rules.map((r) => ({
      id: r.id,
      severity: r.severity,
      protected: r.protected,
      agents: r.agents,
      enforcement: r.enforcement,
    }));
    expect(actual).toEqual(strictSnapshot);
  });

  it.each(strictSnapshot.map((s) => [s.id, s] as const))("%s : règle complète et valide", (id) => {
    const rule = byId(id);
    expect(rule, `${id} absente`).toBeDefined();
    expect(ruleSchema.safeParse(rule).success).toBe(true);
    expect(rule?.profiles).toEqual(["koklo-strict"]);
    expect(rule?.title.length).toBeGreaterThan(0);
    expect(rule?.description.length).toBeGreaterThan(0);
    expect(rule?.agents).toEqual(expect.arrayContaining(["developer", "qa-reviewer", "tech-lead"]));
  });

  it("une règle protégée est bloquante ; les `strict.*` bloquantes sont majoritaires", () => {
    for (const rule of kokloStrictProfile.rules.filter((r) => r.protected)) {
      expect(rule.severity).toBe("blocking");
    }
    expect(kokloStrictProfile.rules.filter((r) => r.severity === "blocking").length).toBe(15);
  });

  it("les verrous du profil (D3) : exactement les 8 règles protégées", () => {
    expect(kokloStrictProfile.lockedRuleIds).toEqual(LOCKED_STRICT_IDS);
    expect(kokloStrictProfile.rules.filter((r) => r.protected).map((r) => r.id)).toEqual(
      LOCKED_STRICT_IDS,
    );
  });

  it("le profil est sérialisable en JSON sans perte", () => {
    expect(JSON.parse(JSON.stringify(kokloStrictProfile))).toEqual(kokloStrictProfile);
  });
});

describe("limites chiffrées §17.2 : enforcement.params typés", () => {
  const limit = (id: string) => {
    const enforcement = byId(id)?.enforcement;
    return enforcement?.params?.max;
  };
  it.each([
    ["strict.fn-lines", 50],
    ["strict.cognitive-complexity", 15],
    ["strict.file-size-source", 300],
    ["strict.file-size-test", 500],
    ["strict.max-params", 4],
  ])("%s : max = %d (nombre, pas du texte)", (id, max) => {
    expect(limit(id)).toBe(max);
    expect(typeof limit(id)).toBe("number");
  });

  it("les gates Biome nomment leur règle Biome en paramètre", () => {
    expect(byId("strict.fn-lines")?.enforcement).toMatchObject({
      kind: "gate",
      adapter: "biome",
      params: { rule: "complexity/noExcessiveLinesPerFunction" },
    });
    expect(byId("strict.cognitive-complexity")?.enforcement).toMatchObject({
      kind: "gate",
      adapter: "biome",
      params: { rule: "complexity/noExcessiveCognitiveComplexity" },
    });
    expect(byId("strict.no-explicit-any")?.enforcement).toMatchObject({
      kind: "gate",
      adapter: "biome",
      params: { rule: "suspicious/noExplicitAny", level: "error" },
    });
  });

  it("les tailles de fichier passent par l'adapter check-size ; max-params est une consigne", () => {
    expect(byId("strict.file-size-source")?.enforcement).toMatchObject({
      kind: "gate",
      adapter: "check-size",
      params: { scope: "source" },
    });
    expect(byId("strict.file-size-test")?.enforcement).toMatchObject({
      adapter: "check-size",
      params: { scope: "test" },
    });
    expect(byId("strict.max-params")?.enforcement.kind).toBe("instruction");
  });

  it("domain-purity et conventional-commits sont des gates sans limite chiffrée", () => {
    expect(byId("strict.domain-purity")?.enforcement).toEqual({
      kind: "gate",
      adapter: "turbo-boundaries",
    });
    expect(byId("strict.conventional-commits")?.enforcement).toEqual({
      kind: "gate",
      adapter: "commitlint",
    });
  });

  it("tous les params sont des scalaires (nombre, texte, booléen)", () => {
    for (const rule of kokloStrictProfile.rules) {
      for (const value of Object.values(rule.enforcement.params ?? {})) {
        expect(["number", "string", "boolean"]).toContain(typeof value);
      }
    }
  });
});
