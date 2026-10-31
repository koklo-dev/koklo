import { describe, expect, it } from "vitest";
import { EMPTY_VALUES, type FeatureFormValues } from "../src/lib/feature-form.ts";
import { describeCurrentValue, rebase } from "../src/lib/feature-rebase.ts";

/** TK-48 / 48e : comparaison à trois du conflit de version (S-feature-form §5.8). */
const baseline: FeatureFormValues = {
  ...EMPTY_VALUES,
  title: "Connexion",
  priority: "must",
  description: "Texte d'origine",
  screens: "S-login",
};
const v = (over: Partial<FeatureFormValues>): FeatureFormValues => ({ ...baseline, ...over });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: un cas par cellule de la comparaison à trois
describe("rebase", () => {
  it("rien n'a changé nulle part : saisie identique, aucun conflit", () => {
    const result = rebase(baseline, baseline, baseline);
    expect(result.values).toEqual(baseline);
    expect(result.conflicts).toEqual([]);
  });

  it("champ modifié par vous seul : votre valeur est gardée, pas un conflit", () => {
    const result = rebase(baseline, v({ title: "Mon titre" }), baseline);
    expect(result.values.title).toBe("Mon titre");
    expect(result.conflicts).toEqual([]);
  });

  it("champ non modifié par vous, modifié dans la spec : la version actuelle est reprise", () => {
    const result = rebase(baseline, baseline, v({ description: "Texte de la spec" }));
    expect(result.values.description).toBe("Texte de la spec");
    expect(result.conflicts).toEqual([]);
  });

  it("modifié des deux côtés avec des valeurs différentes : votre valeur, signalé en conflit", () => {
    const result = rebase(
      baseline,
      v({ title: "Mon titre", priority: "should" }),
      v({ title: "Titre de la spec", priority: "could" }),
    );
    expect(result.values).toMatchObject({ title: "Mon titre", priority: "should" });
    expect([...result.conflicts].sort()).toEqual(["priority", "title"]);
  });

  it("modifié des deux côtés vers la même valeur : pas un conflit", () => {
    const result = rebase(baseline, v({ title: "Même" }), v({ title: "Même" }));
    expect(result.values.title).toBe("Même");
    expect(result.conflicts).toEqual([]);
  });

  it("mélange : mes champs, ceux de la spec, et un conflit", () => {
    const result = rebase(
      baseline,
      v({ title: "Mon titre", screens: "S-login\nS-home" }),
      v({ description: "Autre texte", screens: "S-login\nS-admin" }),
    );
    expect(result.values).toMatchObject({
      title: "Mon titre",
      description: "Autre texte",
      screens: "S-login\nS-home",
    });
    expect(result.conflicts).toEqual(["screens"]);
  });

  it("la nouvelle référence est la version actuelle", () => {
    const current = v({ description: "Autre" });
    expect(rebase(baseline, baseline, current).baseline).toEqual(current);
  });

  it("critères comparés en bloc (un changement d'étape des deux côtés est un conflit)", () => {
    const one = [{ id: "AC-1", title: "A", steps: [{ type: "quand" as const, text: "x" }] }];
    const result = rebase(
      v({ criteria: one }),
      v({ criteria: [{ ...one[0], title: "A", steps: [{ type: "quand", text: "y" }] }] as never }),
      v({ criteria: [{ ...one[0], title: "A", steps: [{ type: "quand", text: "z" }] }] as never }),
    );
    expect(result.conflicts).toEqual(["criteria"]);
  });

  it("espaces autour du titre : pas une modification de votre part", () => {
    const result = rebase(baseline, v({ title: "  Connexion " }), v({ title: "Nouveau" }));
    expect(result.values.title).toBe("Nouveau");
    expect(result.conflicts).toEqual([]);
  });
});

describe("describeCurrentValue", () => {
  it("texte brut : la valeur ; priorité et statut en mots", () => {
    expect(describeCurrentValue("title", v({ title: "Connexion" }))).toBe("Connexion");
    expect(describeCurrentValue("priority", v({ priority: "should" }))).toBe("Importante");
    expect(describeCurrentValue("status", v({ status: "adoptee" }))).toBe("Adoptée");
  });

  it("extrait de 120 caractères au plus, jamais la valeur entière d'un long texte", () => {
    const long = "mot ".repeat(200);
    const excerpt = describeCurrentValue("description", v({ description: long }));
    expect(excerpt.length).toBeLessThanOrEqual(120);
    expect(excerpt.length).toBeGreaterThan(20);
  });

  it("liens : identifiants séparés par des virgules ; valeur vide : texte lisible non vide", () => {
    expect(describeCurrentValue("screens", v({ screens: "S-a\nS-b" }))).toBe("S-a, S-b");
    expect(describeCurrentValue("rules", v({ rules: "" })).length).toBeGreaterThan(0);
  });

  it("critères : un décompte lisible, au singulier et au pluriel", () => {
    const two = [
      { title: "a", steps: [] },
      { title: "b", steps: [] },
    ];
    expect(describeCurrentValue("criteria", v({ criteria: two }))).toBe("2 critères");
    expect(describeCurrentValue("criteria", v({ criteria: two.slice(0, 1) }))).toBe("1 critère");
  });
});
