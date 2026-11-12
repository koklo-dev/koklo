import { describe, expect, it } from "vitest";
import {
  EMPTY_FLOW,
  EMPTY_ROLE,
  EMPTY_RULE,
  type FlowValues,
  flowIssues,
  flowOperationOf,
  flowValuesOf,
  parseErrors,
  parsePermissions,
  parseSteps,
  type RoleValues,
  type RuleValues,
  roleIssues,
  roleOperationOf,
  roleValuesOf,
  ruleIssues,
  ruleOperationOf,
  ruleValuesOf,
} from "../src/lib/domain-operations.ts";

/** TK-103 lot B : saisie des formulaires Règle, Rôle et Parcours -> opérations de `specBatch.submit` (11 §3). */
describe("saisies à plat", () => {
  it("parsePermissions : « PM-… (restriction) », une par ligne ou séparée par des retours", () => {
    expect(parsePermissions(["PM-reservation.creer (pour un client)", "PM-agenda.lire"])).toEqual([
      { id: "PM-reservation.creer", restriction: "pour un client" },
      { id: "PM-agenda.lire" },
    ]);
  });

  it("parseSteps : « libellé · écran », l'écran est facultatif et « — » vaut absent", () => {
    expect(parseSteps("Choisir un service · S-services\nConfirmation\nSMS · —")).toEqual([
      { label: "Choisir un service", screen: "S-services" },
      { label: "Confirmation" },
      { label: "SMS" },
    ]);
  });

  it("parseErrors : « Étape n : texte »", () => {
    expect(
      parseErrors("Étape 4 : créneau repris → retour à l'étape 3.\n\nÉtape 2 : refus"),
    ).toEqual([
      { step: 4, text: "créneau repris → retour à l'étape 3." },
      { step: 2, text: "refus" },
    ]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Règle", () => {
  const values: RuleValues = {
    ...EMPTY_RULE,
    title: " Délai d'annulation ",
    type: "workflow",
    statement: "Une réservation ne peut être annulée qu'à plus de 2 h.",
    example: "Rendez-vous à 14 h : jusqu'à 12 h.",
    states: ["Confirmée", "Honorée"],
    features: ["F-002"],
  };

  it("création : titre, type, énoncé obligatoires ; un workflow veut des états", () => {
    expect(ruleIssues(EMPTY_RULE).map((issue) => issue.field)).toEqual(["title", "statement"]);
    expect(ruleIssues({ ...values, states: [] }).map((issue) => issue.field)).toEqual(["states"]);
    expect(ruleIssues(values)).toEqual([]);
  });

  it("rule.create : champs rognés, vides omis", () => {
    expect(ruleOperationOf(values)).toEqual({
      kind: "rule.create",
      title: "Délai d'annulation",
      type: "workflow",
      statement: "Une réservation ne peut être annulée qu'à plus de 2 h.",
      examples: ["Rendez-vous à 14 h : jusqu'à 12 h."],
      states: ["Confirmée", "Honorée"],
      features: ["F-002"],
    });
    expect(ruleOperationOf({ ...EMPTY_RULE, title: "T", statement: "E" })).toEqual({
      kind: "rule.create",
      title: "T",
      type: "contrainte",
      statement: "E",
    });
  });

  it("rule.update : seulement les champs modifiés, null s'il n'y a rien", () => {
    expect(ruleOperationOf(values, { specId: "R-002", baseline: values })).toBeNull();
    expect(
      ruleOperationOf({ ...values, title: "Autre" }, { specId: "R-002", baseline: values }),
    ).toEqual({
      kind: "rule.update",
      specId: "R-002",
      title: "Autre",
    });
  });

  it("ruleValuesOf lit une fiche `spec.item.get`", () => {
    expect(
      ruleValuesOf({
        specId: "R-002",
        title: "T",
        type: "calcul",
        statement: "E",
        examples: ["a", "b"],
        states: [],
        features: ["F-001"],
        tables: [],
        endpoints: [],
        filePath: "domain/rules/R-002-t.md",
        commitSha: "a".repeat(40),
      }),
    ).toMatchObject({ title: "T", type: "calcul", example: "a\nb", features: ["F-001"] });
  });
});

describe("Rôle", () => {
  const values: RoleValues = {
    ...EMPTY_ROLE,
    name: "Stagiaire",
    description: "Voit l'agenda.",
    permissions: ["PM-agenda.lire", "PM-reservation.modifier (les siennes)"],
  };

  it("nom, description et au moins une permission valide sont obligatoires", () => {
    expect(roleIssues(EMPTY_ROLE).map((issue) => issue.field)).toEqual([
      "name",
      "description",
      "permissions",
    ]);
    expect(roleIssues({ ...values, permissions: ["lire l'agenda"] }).map((i) => i.field)).toEqual([
      "permissions",
    ]);
    expect(roleIssues(values)).toEqual([]);
  });

  it("role.create : permissions parsées avec restriction", () => {
    expect(roleOperationOf(values)).toEqual({
      kind: "role.create",
      name: "Stagiaire",
      description: "Voit l'agenda.",
      permissions: [
        { id: "PM-agenda.lire" },
        { id: "PM-reservation.modifier", restriction: "les siennes" },
      ],
    });
  });

  it("role.update ne renvoie que ce qui change", () => {
    expect(
      roleOperationOf(
        { ...values, description: "Autre" },
        { specId: "RL-stagiaire", baseline: values },
      ),
    ).toEqual({ kind: "role.update", specId: "RL-stagiaire", description: "Autre" });
  });

  it("roleValuesOf remet les restrictions entre parenthèses", () => {
    expect(
      roleValuesOf({
        specId: "RL-a",
        name: "A",
        description: "",
        permissions: [
          { specId: "PM-a.lire", restriction: "les siennes" },
          { specId: "PM-a.creer" },
        ],
        filePath: "domain/roles.yaml",
        commitSha: "a".repeat(40),
      }).permissions,
    ).toEqual(["PM-a.lire (les siennes)", "PM-a.creer"]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Parcours", () => {
  const values: FlowValues = {
    ...EMPTY_FLOW,
    title: "Liste d'attente",
    actor: "Client",
    start: "Écran des créneaux complet",
    steps: "S'inscrire · S-liste-attente\nConfirmation · S-confirmation",
    errors: "Étape 2 : créneau repris → retour",
    features: ["F-249"],
  };

  it("titre, acteur, point de départ et une étape sont obligatoires", () => {
    expect(flowIssues(EMPTY_FLOW).map((issue) => issue.field)).toEqual([
      "title",
      "actor",
      "start",
      "steps",
    ]);
    expect(flowIssues(values)).toEqual([]);
  });

  it("une erreur sur une étape inexistante est refusée", () => {
    expect(flowIssues({ ...values, errors: "Étape 9 : x" }).map((issue) => issue.field)).toEqual([
      "errors",
    ]);
    expect(flowIssues({ ...values, errors: "n'importe quoi" }).map((issue) => issue.field)).toEqual(
      ["errors"],
    );
  });

  it("flow.create : le départ porte son écran à la fin (« libellé · écran »)", () => {
    expect(flowOperationOf({ ...values, start: "Lien du SMS · S-sms" })).toEqual({
      kind: "flow.create",
      title: "Liste d'attente",
      actor: "Client",
      start: { label: "Lien du SMS", screen: "S-sms" },
      steps: [
        { label: "S'inscrire", screen: "S-liste-attente" },
        { label: "Confirmation", screen: "S-confirmation" },
      ],
      errors: [{ step: 2, text: "créneau repris → retour" }],
      features: ["F-249"],
    });
  });

  it("flowValuesOf relit une fiche", () => {
    const loaded = flowValuesOf({
      specId: "P-a",
      title: "A",
      actor: "Client",
      start: { label: "Lien", screen: "S-sms" },
      steps: [{ label: "Annuler", screen: "S-annulation" }, { label: "Fin" }],
      errors: [{ step: 2, text: "refus" }],
      features: ["F-002"],
      filePath: "design/flows/P-a.yaml",
      commitSha: "a".repeat(40),
    });
    expect(loaded.start).toBe("Lien · S-sms");
    expect(loaded.steps).toBe("Annuler · S-annulation\nFin");
    expect(loaded.errors).toBe("Étape 2 : refus");
  });
});
