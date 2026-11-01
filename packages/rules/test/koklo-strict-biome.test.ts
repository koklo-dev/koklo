import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBiomeLimits, kokloStrictProfile } from "../src/index.ts";

const biomePath = resolve(import.meta.dirname, "../../config/biome.json");
const realConfig: unknown = JSON.parse(readFileSync(biomePath, "utf8"));

type Mutable = {
  linter: {
    rules: {
      complexity: {
        noExcessiveLinesPerFunction: { options: { maxLines: number } };
        noExcessiveCognitiveComplexity: { options: { maxAllowedComplexity: number } };
      };
      suspicious: { noExplicitAny?: string };
    };
  };
};
const mutated = (change: (c: Mutable) => void): unknown => {
  const copy = JSON.parse(readFileSync(biomePath, "utf8")) as Mutable;
  change(copy);
  return copy;
};

describe("dérive entre le profil koklo-strict et packages/config/biome.json", () => {
  it("la configuration réelle respecte 50 lignes, complexité 15 et noExplicitAny", () => {
    expect(checkBiomeLimits(realConfig)).toEqual([]);
  });

  it("le fichier réel porte bien les limites du profil (lecture directe)", () => {
    const c = realConfig as Mutable;
    const params = (id: string) =>
      kokloStrictProfile.rules.find((r) => r.id === id)?.enforcement.params;
    expect(c.linter.rules.complexity.noExcessiveLinesPerFunction.options.maxLines).toBe(
      params("strict.fn-lines")?.max,
    );
    expect(
      c.linter.rules.complexity.noExcessiveCognitiveComplexity.options.maxAllowedComplexity,
    ).toBe(params("strict.cognitive-complexity")?.max);
    expect(c.linter.rules.suspicious.noExplicitAny).toBe(params("strict.no-explicit-any")?.level);
  });

  it("détecte maxLines modifié", () => {
    const drift = checkBiomeLimits(
      mutated((c) => {
        c.linter.rules.complexity.noExcessiveLinesPerFunction.options.maxLines = 80;
      }),
    );
    expect(drift).toEqual([
      { ruleId: "strict.fn-lines", setting: "maxLines", expected: 50, actual: 80 },
    ]);
  });
});

describe("dérive Biome : autres réglages et entrées invalides", () => {
  it("détecte la complexité cognitive modifiée", () => {
    const drift = checkBiomeLimits(
      mutated((c) => {
        c.linter.rules.complexity.noExcessiveCognitiveComplexity.options.maxAllowedComplexity = 25;
      }),
    );
    expect(drift).toEqual([
      {
        ruleId: "strict.cognitive-complexity",
        setting: "maxAllowedComplexity",
        expected: 15,
        actual: 25,
      },
    ]);
  });

  it("détecte noExplicitAny affaibli ou retiré", () => {
    const warn = checkBiomeLimits(
      mutated((c) => {
        c.linter.rules.suspicious.noExplicitAny = "warn";
      }),
    );
    expect(warn).toEqual([
      {
        ruleId: "strict.no-explicit-any",
        setting: "noExplicitAny",
        expected: "error",
        actual: "warn",
      },
    ]);
    const removed = checkBiomeLimits(
      mutated((c) => {
        delete c.linter.rules.suspicious.noExplicitAny;
      }),
    );
    expect(removed).toEqual([
      { ruleId: "strict.no-explicit-any", setting: "noExplicitAny", expected: "error" },
    ]);
  });
});

describe("dérive Biome : cumul et entrées invalides", () => {
  it("plusieurs dérives sont toutes signalées, triées par ruleId", () => {
    const drift = checkBiomeLimits(
      mutated((c) => {
        c.linter.rules.complexity.noExcessiveLinesPerFunction.options.maxLines = 70;
        c.linter.rules.suspicious.noExplicitAny = "off";
      }),
    );
    expect(drift.map((d) => d.ruleId)).toEqual(["strict.fn-lines", "strict.no-explicit-any"]);
  });

  it.each([[null], [undefined], [42], ["x"], [[]], [{}], [{ linter: null }]])(
    "une configuration inexploitable (%j) signale les 3 réglages manquants sans lever",
    (config) => {
      const drift = checkBiomeLimits(config);
      expect(drift.map((d) => d.setting).sort()).toEqual([
        "maxAllowedComplexity",
        "maxLines",
        "noExplicitAny",
      ]);
      for (const d of drift) expect(d).not.toHaveProperty("actual");
    },
  );

  it("la sortie est sérialisable et n'altère pas l'entrée", () => {
    const copy = JSON.parse(JSON.stringify(realConfig));
    const drift = checkBiomeLimits(copy);
    expect(copy).toEqual(realConfig);
    expect(JSON.parse(JSON.stringify(drift))).toEqual(drift);
  });
});
