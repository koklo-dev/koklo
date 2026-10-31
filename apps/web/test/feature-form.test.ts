import { describe, expect, it } from "vitest";
import {
  checkDesignerScreens,
  diffValues,
  EMPTY_VALUES,
  type FeatureFormValues,
  validateFeatureForm,
  valuesFromDetail,
} from "../src/lib/feature-form.ts";
import { DETAIL_TYPED as DETAIL } from "./support/feature-form.tsx";

/**
 * TK-48 / 48e : valeurs, validation (= contrat `featureFields`, S-feature-form §3.1, §4.3), comparaison et
 * contrôle du designer (§5.4). Fonctions pures, sans DOM.
 */
const valid = (over: Partial<FeatureFormValues> = {}): FeatureFormValues => ({
  ...EMPTY_VALUES,
  title: "Connexion",
  priority: "must",
  ...over,
});
const messages = (values: FeatureFormValues) =>
  validateFeatureForm(values).map((issue) => [issue.field, issue.message]);

describe("EMPTY_VALUES", () => {
  it("priorité sans présélection, statut Brouillon, tout le reste vide", () => {
    expect(EMPTY_VALUES).toEqual({
      title: "",
      priority: "",
      status: "brouillon",
      description: "",
      criteria: [],
      screens: "",
      roles: "",
      rules: "",
      tables: "",
      endpoints: "",
      nfr: "",
    });
  });
});

describe("valuesFromDetail", () => {
  it("reprend les champs de la fiche, les listes de liens à raison d'une valeur par ligne", () => {
    const values = valuesFromDetail({ ...DETAIL, screens: ["S-login", "S-home"], rules: [] });
    expect(values).toMatchObject({
      title: "Connexion par e-mail",
      priority: "must",
      status: "brouillon",
      screens: "S-login\nS-home",
      rules: "",
      roles: "RL-owner",
      tables: "T-user",
      endpoints: "E-login",
      nfr: "NFR-latence",
    });
    expect(values.description).toBe(DETAIL.description);
  });

  it("garde l'identifiant AC-n de chaque critère existant et ses étapes dans l'ordre", () => {
    const { criteria } = valuesFromDetail(DETAIL);
    expect(criteria).toHaveLength(2);
    expect(criteria[0]).toMatchObject({ id: "AC-1", title: "Connexion réussie" });
    expect(criteria[0]?.steps.map((step) => step.type)).toEqual([
      "etant_donne",
      "quand",
      "alors",
      "et",
    ]);
    expect(criteria[1]).toMatchObject({ id: "AC-2", title: "Adresse inconnue", steps: [] });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: tableau de règles, un cas par ligne du tableau §3.1
describe("validateFeatureForm", () => {
  it("une saisie complète et valide ne produit aucune erreur", () => {
    expect(validateFeatureForm(valid())).toEqual([]);
  });

  it("vide : titre puis priorité, dans l'ordre du formulaire", () => {
    expect(messages(EMPTY_VALUES)).toEqual([
      ["title", "Saisissez un titre."],
      ["priority", "Choisissez une priorité."],
    ]);
  });

  it.each(["", " ", "   ", "\t\n "])(
    "titre %j : refusé (le contrat accepte un titre d'espaces, pas nous)",
    (title) => {
      expect(messages(valid({ title }))).toEqual([["title", "Saisissez un titre."]]);
    },
  );

  it("titre de 200 caractères : accepté ; 201 : refusé", () => {
    expect(validateFeatureForm(valid({ title: "a".repeat(200) }))).toEqual([]);
    expect(messages(valid({ title: "a".repeat(201) }))).toEqual([
      ["title", "Le titre ne doit pas dépasser 200 caractères."],
    ]);
  });

  it("la limite de 200 s'applique après suppression des espaces de début et de fin", () => {
    expect(validateFeatureForm(valid({ title: `  ${"a".repeat(200)}  ` }))).toEqual([]);
  });

  it.each(["must", "should", "could", "wont"] as const)("priorité %s : acceptée", (priority) => {
    expect(validateFeatureForm(valid({ priority }))).toEqual([]);
  });

  it("priorité hors énumération : « Choisissez une priorité. »", () => {
    expect(messages({ ...valid(), priority: "urgent" as never })).toEqual([
      ["priority", "Choisissez une priorité."],
    ]);
  });

  it("statut hors énumération : refusé", () => {
    expect(validateFeatureForm({ ...valid(), status: "x" as never })).toHaveLength(1);
  });

  it("description : aucune limite ni règle", () => {
    expect(validateFeatureForm(valid({ description: "x\n".repeat(50_000) }))).toEqual([]);
  });

  it("critère sans titre : « Saisissez le titre du critère 2. » (numéro à partir de 1)", () => {
    const criteria = [
      { title: "Un", steps: [] },
      { title: "  ", steps: [] },
    ];
    expect(messages(valid({ criteria }))).toEqual([
      ["criteria.2.title", "Saisissez le titre du critère 2."],
    ]);
  });

  it("étape sans texte : « Saisissez le texte de l'étape 3 du critère 1. »", () => {
    const steps = [
      { type: "etant_donne" as const, text: "a" },
      { type: "quand" as const, text: "b" },
      { type: "alors" as const, text: " " },
    ];
    expect(messages(valid({ criteria: [{ title: "Un", steps }] }))).toEqual([
      ["criteria.1.steps.3.text", "Saisissez le texte de l'étape 3 du critère 1."],
    ]);
  });

  it("critère sans étape : permis par le contrat (aide non bloquante, pas une erreur)", () => {
    expect(validateFeatureForm(valid({ criteria: [{ title: "Un", steps: [] }] }))).toEqual([]);
  });

  it("type d'étape hors énumération : refusé", () => {
    const steps = [{ type: "puis" as never, text: "a" }];
    expect(validateFeatureForm(valid({ criteria: [{ title: "Un", steps }] }))).toHaveLength(1);
  });

  describe.each([
    [
      "screens",
      "S-inscription",
      ["S-login", "S-a1-b2"],
      ["s-login", "S-", "S-Login", "S--x", "R-001"],
    ],
    ["roles", "RL-admin", ["RL-owner", "RL-a-b"], ["RL-", "rl-x", "S-login"]],
    ["rules", "R-001", ["R-001", "R-1234"], ["R-01", "R-1", "R-abc", "RL-001"]],
    ["tables", "T-utilisateur", ["T-user", "T-a-1"], ["T-", "t-user", "T-User", "E-x"]],
    ["endpoints", "E-connexion", ["E-login", "E-a-b"], ["E-", "e-login", "E-Login", "T-x"]],
    ["nfr", "NFR-performance", ["NFR-latence", "NFR-a-1"], ["NFR-", "nfr-x", "NFR-Perf", "R-001"]],
  ] as const)("liens %s (motif du contrat)", (field, example, good, bad) => {
    it.each(good)("accepte %s", (id) => {
      expect(validateFeatureForm(valid({ [field]: id }))).toEqual([]);
    });

    it.each(bad)("refuse %s avec la ligne et un exemple", (id) => {
      expect(messages(valid({ [field]: `${good[0]}\n${id}` }))).toEqual([
        [field, `La ligne 2 n'est pas un identifiant valide (exemple : ${example}).`],
      ]);
    });
  });

  it("lignes vides ignorées, espaces de début et de fin retirés, CRLF toléré", () => {
    expect(
      validateFeatureForm(valid({ screens: "\n  S-login  \r\n\r\n\tS-home\r\n", rules: "  " })),
    ).toEqual([]);
  });

  it("le numéro de ligne compte les lignes vides (celle que la personne voit)", () => {
    expect(messages(valid({ screens: "S-login\n\nnon" }))).toEqual([
      ["screens", "La ligne 3 n'est pas un identifiant valide (exemple : S-inscription)."],
    ]);
  });

  it("une seule erreur par champ de liens (la première ligne invalide)", () => {
    expect(messages(valid({ rules: "R-1\nR-2\nR-003" }))).toEqual([
      ["rules", "La ligne 1 n'est pas un identifiant valide (exemple : R-001)."],
    ]);
  });

  it("les doublons ne sont pas une erreur côté client (le serveur tranche)", () => {
    expect(validateFeatureForm(valid({ screens: "S-login\nS-login" }))).toEqual([]);
  });

  it("plusieurs erreurs : ordre du formulaire (titre, priorité, critères, liens)", () => {
    const issues = validateFeatureForm({
      ...EMPTY_VALUES,
      criteria: [{ title: "", steps: [] }],
      screens: "x",
      nfr: "y",
    });
    expect(issues.map((issue) => issue.field)).toEqual([
      "title",
      "priority",
      "criteria.1.title",
      "screens",
      "nfr",
    ]);
  });
});

describe("diffValues", () => {
  const baseline = valuesFromDetail(DETAIL);

  it("aucune différence : liste vide", () => {
    expect(diffValues(baseline, { ...baseline })).toEqual([]);
  });

  it.each([
    ["title", { title: "Autre" }],
    ["priority", { priority: "should" as const }],
    ["status", { status: "adoptee" as const }],
    ["description", { description: "Autre texte" }],
    ["screens", { screens: "S-login\nS-home" }],
    ["roles", { roles: "RL-admin" }],
    ["rules", { rules: "R-002" }],
    ["tables", { tables: "T-order" }],
    ["endpoints", { endpoints: "E-logout" }],
    ["nfr", { nfr: "NFR-debit" }],
  ] as const)("%s modifié : seul ce champ est signalé", (field, change) => {
    expect(diffValues(baseline, { ...baseline, ...change })).toEqual([field]);
  });

  it("espaces autour du titre, CRLF et lignes vides ne comptent pas comme une modification", () => {
    const changed = {
      ...baseline,
      title: `  ${baseline.title}  `,
      description: baseline.description.replace(/\n/g, "\r\n"),
      screens: `\n${baseline.screens}\n\n`,
    };
    expect(diffValues(baseline, changed)).toEqual([]);
  });

  it("critères : un titre, une étape, un type ou l'ordre modifié signale « criteria » en bloc", () => {
    const [first, second] = baseline.criteria;
    if (!first || !second) throw new Error("fixture");
    const variants = [
      [{ ...first, title: "Nouveau" }, second],
      [{ ...first, steps: first.steps.slice(1) }, second],
      [{ ...first, steps: [{ type: "et" as const, text: "x" }, ...first.steps.slice(1)] }, second],
      [second, first],
      [first],
      [first, second, { title: "Troisième", steps: [] }],
    ];
    for (const criteria of variants) {
      expect(diffValues(baseline, { ...baseline, criteria })).toEqual(["criteria"]);
    }
  });

  it("plusieurs champs : tous signalés", () => {
    expect(
      diffValues(baseline, { ...baseline, title: "A", description: "B", nfr: "NFR-x" }).sort(),
    ).toEqual(["description", "nfr", "title"]);
  });
});

describe("checkDesignerScreens (S-feature-form §5.4)", () => {
  const message = "Liez au moins un écran pour enregistrer cette fonctionnalité.";
  const withScreens = (screens: string) => valid({ screens });

  it("création sans écran : refusée, sur le champ « screens »", () => {
    expect(checkDesignerScreens("create", null, withScreens(""))).toEqual({
      field: "screens",
      message,
    });
    expect(checkDesignerScreens("create", null, withScreens("  \n "))).toEqual({
      field: "screens",
      message,
    });
  });

  it("création avec un écran : permise", () => {
    expect(checkDesignerScreens("create", null, withScreens("S-login"))).toBeNull();
  });

  it("modification : un écran avant ET après est exigé", () => {
    expect(
      checkDesignerScreens("update", withScreens("S-login"), withScreens("S-home")),
    ).toBeNull();
    expect(checkDesignerScreens("update", withScreens(""), withScreens("S-home"))).toEqual({
      field: "screens",
      message,
    });
    expect(checkDesignerScreens("update", withScreens("S-login"), withScreens(""))).toEqual({
      field: "screens",
      message,
    });
  });
});
