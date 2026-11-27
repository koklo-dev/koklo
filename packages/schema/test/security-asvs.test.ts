import { describe, expect, it } from "vitest";
import {
  ASVS_CHAPTERS,
  AsvsFileSchema,
  asvsCoverage,
  effectiveAsvsLevel,
  recommendedAsvsLevel,
} from "../src/index.ts";

/** TK-117 lot A (cas 4, A6, B797, B798) : niveau ASVS recommandé ou saisi, couverture par chapitre. */
const entry = (categorie: "personnelle" | "contact" | "sensible" | "secret" | "technique") => ({
  categorie,
});

describe("niveau (A6)", () => {
  it("1 sans donnée personnelle, 2 dès une", () => {
    expect(recommendedAsvsLevel([])).toBe(1);
    expect(recommendedAsvsLevel([entry("secret"), entry("technique")])).toBe(1);
    for (const category of ["personnelle", "contact", "sensible"] as const) {
      expect(recommendedAsvsLevel([entry("technique"), entry(category)]), category).toBe(2);
    }
  });

  it("la saisie humaine l'emporte, dans les deux sens", () => {
    expect(effectiveAsvsLevel(undefined, [entry("contact")])).toBe(2);
    expect(effectiveAsvsLevel(AsvsFileSchema.parse({ niveau: 1 }), [entry("contact")])).toBe(1);
    expect(effectiveAsvsLevel(AsvsFileSchema.parse({ niveau: 3 }), [])).toBe(3);
    expect(effectiveAsvsLevel(AsvsFileSchema.parse({}), [])).toBe(1);
  });
});

describe("couverture par chapitre", () => {
  const requirement = (id: string, niveau: number, reponse?: string, chapitre = "sessions") => ({
    id,
    chapitre,
    titre: id,
    niveau,
    reponse,
  });
  const { exigences } = AsvsFileSchema.parse({
    exigences: [
      requirement("V1", 1, "NFR-007"),
      requirement("V2", 2),
      requirement("V3", 3),
      requirement("V4", 1, "NFR-007", "validation"),
      requirement("V5", 2, "Schémas", "validation"),
    ],
  });

  it("neuf chapitres toujours là ; exigences de niveau inférieur ou égal au niveau effectif", () => {
    const report = asvsCoverage(exigences, 2);
    expect(report.chapters.map((c) => c.chapitre)).toEqual([...ASVS_CHAPTERS]);
    expect(report.chapters).toHaveLength(9);
    expect(report.chapters.find((c) => c.chapitre === "sessions")).toEqual({
      chapitre: "sessions",
      answered: 1,
      total: 2,
      where: ["NFR-007"],
      state: "missing",
    });
    expect(report.chapters.find((c) => c.chapitre === "validation")).toMatchObject({
      state: "covered",
      where: ["NFR-007", "Schémas"],
    });
    expect([report.answered, report.total]).toEqual([3, 4]);
  });

  it("aucune exigence listée : « à vérifier », jamais « couvert »", () => {
    const report = asvsCoverage([], 3);
    expect(report.chapters.every((c) => c.state === "to_check" && c.total === 0)).toBe(true);
    expect([report.answered, report.total]).toEqual([0, 0]);
  });
});
