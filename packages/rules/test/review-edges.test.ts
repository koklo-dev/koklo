import { describe, expect, it } from "vitest";
import {
  type Catalog,
  loadBuiltInCatalog,
  matchesPath,
  resolveEffectiveRules,
  validateEvidence,
  withKokloStrict,
} from "../src/index.ts";
import { input, layer, override, resolveOk } from "./compose-fixtures.ts";
import { strictSnapshot } from "./koklo-strict-fixtures.ts";

describe("withKokloStrict remplace une règle strict.* préexistante plus faible (a)", () => {
  const weakCatalog = (): Catalog => {
    const base = loadBuiltInCatalog();
    const weak = {
      id: "strict.fn-lines",
      title: "faible",
      description: "faible",
      profiles: ["core"],
      agents: ["developer"],
      severity: "advisory",
      protected: false,
      enforcement: { kind: "instruction" },
    } as const;
    return { ...base, rules: [...base.rules, weak] };
  };

  it("la définition koklo-strict l'emporte et reste protégée", () => {
    const merged = withKokloStrict(weakCatalog());
    const rules = merged.rules.filter((r) => r.id === "strict.fn-lines");
    expect(rules).toHaveLength(1);
    const expected = strictSnapshot.find((r) => r.id === "strict.fn-lines");
    expect(rules[0]).toMatchObject({
      severity: expected?.severity,
      protected: true,
      enforcement: expected?.enforcement,
    });
    expect(merged.protectedRuleIds.filter((id) => id === "strict.fn-lines")).toHaveLength(1);
  });

  it("idempotent", () => {
    const once = withKokloStrict(weakCatalog());
    expect(withKokloStrict(once)).toEqual(once);
  });

  it("sans règle préexistante, le résultat reste idempotent et inchangé en forme", () => {
    const once = withKokloStrict(loadBuiltInCatalog());
    expect(withKokloStrict(once)).toEqual(once);
  });
});

describe("les noms hérités d'Object ne sont pas des profils (b)", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "%s : profil inconnu",
    (name) => {
      const result = resolveEffectiveRules(input({ profiles: [name] }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("resolve.unknown-profile");
    },
  );

  it.each(["constructor", "__proto__"])(
    "%s déclaré par une couche : conflit unknown-profile",
    (name) => {
      const r = resolveOk({ layers: [layer("project", { profiles: [name] })] });
      expect(r.conflicts).toContainEqual(
        expect.objectContaining({ ruleId: name, attempted: "profile", reason: "unknown-profile" }),
      );
      expect(r.profiles).not.toContain(name);
    },
  );

  it("paquet : profil hérité refusé", () => {
    const result = resolveEffectiveRules(
      input({ packages: [{ path: "packages/api", profiles: ["toString"] }] }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("matchesPath ne lève jamais sur un chemin très profond (c)", () => {
  const deep = `${"a/".repeat(200_000)}x.ts`;
  it("`**` sur 200 000 segments", () => {
    expect(matchesPath("**/x.ts", deep)).toBe(true);
    expect(matchesPath("**/y.ts", deep)).toBe(false);
    expect(matchesPath("a/**/*.ts", deep)).toBe(true);
  });
});

describe("références invisibles : pas une preuve (d)", () => {
  const res = () => resolveOk();
  it.each([
    ["espace insécable", " "],
    ["largeur nulle", "​"],
    ["BOM", "﻿"],
    ["joiner", "⁠‌‍"],
    ["espace cadratin", "  　"],
    ["remplisseur hangul", "ㅤᅟᅠﾠ"],
    ["braille vide", "⠀"],
    ["contrôle", "\u0000\u0007"],
  ])("%s -> UNVERIFIED", (_name, ref) => {
    const out = validateEvidence(res(), {
      evidence: [{ ruleId: "global.scope", references: [ref] }],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const v = out.value.verdicts.find((x) => x.ruleId === "global.scope");
    expect(v?.verdict).toBe("UNVERIFIED");
    expect(out.value.canPass).toBe(false);
  });

  it("une vraie référence entourée d'invisibles reste une preuve", () => {
    const out = validateEvidence(res(), {
      evidence: [{ ruleId: "global.scope", references: ["​docs/x.md"] }],
    });
    expect(out.ok && out.value.verdicts.find((x) => x.ruleId === "global.scope")?.verdict).toBe(
      "PASS",
    );
  });
});

describe("une surcharge expirée est signalée avec l'effet tenté (e)", () => {
  const expired = "2026-01-15";
  it.each([
    ["disable", { disabled: true }],
    ["severity", { severity: "advisory" }],
    ["enforcement", { enforcement: { kind: "instruction" } }],
    ["agents", { agents: ["developer"] }],
    ["exclude-paths", { excludePaths: ["x"] }],
    ["unlock", { protected: false }],
  ] as const)("%s", (attempted, extra) => {
    const r = resolveOk({
      layers: [
        layer("project", { override: [override("node.esm", { expires: expired, ...extra })] }),
      ],
    });
    expect(r.conflicts).toContainEqual(
      expect.objectContaining({ ruleId: "node.esm", attempted, reason: "expired" }),
    );
  });
});
