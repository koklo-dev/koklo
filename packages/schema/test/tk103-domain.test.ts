import { describe, expect, it } from "vitest";
import {
  type BusinessRule,
  checkSpec,
  emitFlowYaml,
  emitRolesYaml,
  emitRuleMarkdown,
  type Flow,
  flowProposalSchema,
  isFlowPath,
  kindOf,
  parseRuleMarkdown,
  parseSpecFiles,
  roleProposalSchema,
  ruleProposalSchema,
} from "../src/index.ts";
import { codes, withFiles } from "./helpers.ts";

/** TK-103 lot A : règles enrichies, rôles à restrictions, parcours YAML, références de la règle 4, charges de l'agent. */
const FLOW_PATH = "design/flows/P-inscription.yaml";
const flowYaml = (extra = "") => `id: P-inscription
titre: Inscription
acteur: Visiteur
depart:
  libelle: Ouvrir la page
  ecran: S-register
etapes:
  - libelle: Remplir le formulaire
    ecran: S-register
  - libelle: Voir la confirmation
    ecran: S-register-success
erreurs:
  - etape: 1
    texte: Email déjà utilisé
fonctionnalites: [F-001]
${extra}`;

describe("parcours : chemins et genre", () => {
  it("kindOf reconnaît design/flows/P-*.yaml ; isFlowPath accepte .yaml et .json", () => {
    expect(kindOf(FLOW_PATH)).toBe("flow");
    expect(kindOf("design/flows/P-001.json")).toBeUndefined();
    expect(isFlowPath(FLOW_PATH)).toBe(true);
    expect(isFlowPath("design/flows/P-001.json")).toBe(true);
    expect(isFlowPath("design/flows/_layout.yaml")).toBe(false);
  });
});

describe("parcours : lecture, émission, références", () => {
  it("un parcours YAML valide est lu dans spec.flows", () => {
    const { spec, issues } = parseSpecFiles([{ path: FLOW_PATH, content: flowYaml() }]);
    expect(issues).toEqual([]);
    expect(spec.flows[0]?.value).toMatchObject({
      id: "P-inscription",
      acteur: "Visiteur",
      depart: { libelle: "Ouvrir la page", ecran: "S-register" },
    });
    expect(spec.flows[0]?.value.etapes).toHaveLength(2);
  });

  it("un parcours invalide est écarté avec un diagnostic, jamais une exception", () => {
    const { spec, issues } = parseSpecFiles([
      { path: FLOW_PATH, content: "id: P-inscription\ntitre: x\n" },
    ]);
    expect(spec.flows).toEqual([]);
    expect(codes(issues)).toContain("STRUCT_SCHEMA_VIOLATION");
  });

  it("emitFlowYaml est relu à l'identique et idempotent", () => {
    const flow = parseSpecFiles([{ path: FLOW_PATH, content: flowYaml() }]).spec.flows[0]
      ?.value as Flow;
    const text = emitFlowYaml(flow);
    const again = parseSpecFiles([{ path: FLOW_PATH, content: text }]).spec.flows[0]?.value;
    expect(again).toEqual(flow);
    expect(emitFlowYaml(again as Flow)).toBe(text);
  });

  it("référence : un parcours citant S-absent ou F-999 est refusé par la règle 4", () => {
    const bad = flowYaml().replace("S-register-success", "S-absent").replace("F-001", "F-999");
    const report = checkSpec(withFiles({ [FLOW_PATH]: bad }));
    expect(codes(report.issues)).toEqual(
      expect.arrayContaining(["R4_UNKNOWN_SCREEN", "R4_UNKNOWN_FEATURE"]),
    );
    expect(report.ok).toBe(false);
  });

  it("un parcours aux références connues ne produit aucune erreur", () => {
    const report = checkSpec(withFiles({ [FLOW_PATH]: flowYaml() }));
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("règles : titre, états, fonctionnalités", () => {
  const rule: BusinessRule = {
    id: "R-010",
    titre: "Annulation tardive",
    type: "workflow",
    tables: [],
    endpoints: [],
    etats: ["Brouillon", "Validée", "Archivée"],
    fonctionnalites: ["F-001"],
    enonce: "Une réservation suit un cycle.",
    exemples: ["Brouillon puis Validée."],
  };

  it("emitRuleMarkdown est relu à l'identique et idempotent", () => {
    const text = emitRuleMarkdown(rule);
    const parsed = parseRuleMarkdown("domain/rules/R-010-annulation-tardive.md", text);
    expect(parsed).toEqual({ ok: true, value: rule });
    expect(emitRuleMarkdown(rule)).toBe(text);
  });

  it("une règle ancienne (sans titre, états ni fonctionnalités) reste valide", () => {
    const { issues } = parseSpecFiles(withFiles({}));
    expect(issues).toEqual([]);
  });

  it("référence : une règle citant F-999 est refusée (R4_UNKNOWN_FEATURE)", () => {
    const path = "domain/rules/R-010-annulation-tardive.md";
    const text = emitRuleMarkdown({ ...rule, fonctionnalites: ["F-999"] });
    const report = checkSpec(withFiles({ [path]: text }));
    expect(codes(report.issues)).toContain("R4_UNKNOWN_FEATURE");
  });

  it("emitRuleMarkdown refuse un énoncé qui ouvre une section", () => {
    expect(() => emitRuleMarkdown({ ...rule, enonce: "a\n## Exemples\nb" })).toThrow();
  });
});

describe("rôles : restrictions, libellé, noms métier", () => {
  const roles = `roles:
  - id: RL-gestionnaire
    nom: Gestionnaire
    description: Gère l'agenda.
    permissions: [PM-agenda.lire, PM-agenda.modifier]
    restrictions:
      PM-agenda.modifier: les siennes
permissions:
  - id: PM-agenda.lire
    libelle: Consulter l'agenda
    ressource: agenda
    action: lire
  - id: PM-agenda.modifier
    ressource: agenda
    action: modifier
`;

  it("lit restrictions, libelle et une ressource ou action métier ; la règle 4 ne vérifie pas T-/E- sans préfixe", () => {
    const files = withFiles({ "domain/roles.yaml": roles });
    const parsed = parseSpecFiles(files);
    expect(parsed.issues).toEqual([]);
    const file = parsed.spec.roles[0]?.value;
    expect(file?.roles[0]?.restrictions).toEqual({ "PM-agenda.modifier": "les siennes" });
    expect(file?.permissions[0]?.libelle).toBe("Consulter l'agenda");
    const own = checkSpec(files).issues.filter(
      (i) => i.path === "domain/roles.yaml" && i.severity === "error",
    );
    expect(own).toEqual([]);
  });

  it("une ressource T-absent reste refusée", () => {
    const bad = roles.replace("ressource: agenda", "ressource: T-absent");
    const report = checkSpec(withFiles({ "domain/roles.yaml": bad }));
    expect(codes(report.issues)).toContain("R4_UNKNOWN_TABLE");
  });

  it("un rôle citant une permission non définie est refusé", () => {
    const bad = roles.replace("PM-agenda.modifier]", "PM-agenda.modifier, PM-absente.lire]");
    const report = checkSpec(withFiles({ "domain/roles.yaml": bad }));
    expect(codes(report.issues)).toContain("R4_UNKNOWN_PERMISSION");
  });

  it("emitRolesYaml est relu à l'identique et idempotent, sans écraser les champs existants", () => {
    const file = parseSpecFiles([{ path: "domain/roles.yaml", content: roles }]).spec.roles[0]
      ?.value;
    if (!file) throw new Error("fixture");
    const text = emitRolesYaml(file);
    const again = parseSpecFiles([{ path: "domain/roles.yaml", content: text }]).spec.roles[0]
      ?.value;
    expect(again).toEqual(file);
    expect(emitRolesYaml(again ?? file)).toBe(text);
  });
});

describe("charges de l'agent enrichies, tout ajout optionnel", () => {
  it("accepte les charges minimales d'avant", () => {
    expect(ruleProposalSchema.safeParse({ title: "T", statement: "E" }).success).toBe(true);
    expect(roleProposalSchema.safeParse({ name: "N", description: "" }).success).toBe(true);
    expect(flowProposalSchema.safeParse({ title: "T", steps: ["a"] }).success).toBe(true);
  });

  it("accepte les champs enrichis et refuse les mauvaises valeurs", () => {
    expect(
      ruleProposalSchema.safeParse({
        title: "T",
        statement: "E",
        type: "workflow",
        example: "Ex",
        states: ["A", "B"],
        features: ["F-001"],
      }).success,
    ).toBe(true);
    expect(ruleProposalSchema.safeParse({ title: "T", statement: "E", type: "x" }).success).toBe(
      false,
    );
    expect(
      roleProposalSchema.safeParse({
        name: "N",
        description: "D",
        permissions: [{ id: "PM-agenda.lire", restriction: "les siennes" }],
      }).success,
    ).toBe(true);
    expect(
      roleProposalSchema.safeParse({ name: "N", description: "D", permissions: [{ id: "agenda" }] })
        .success,
    ).toBe(false);
    expect(
      flowProposalSchema.safeParse({
        title: "T",
        steps: ["a"],
        actor: "Visiteur",
        start: "Ouvrir",
        errors: [{ step: 1, text: "Échec" }],
        features: ["F-001"],
      }).success,
    ).toBe(true);
  });

  it("refuse une URL dans un texte enrichi (texte brut)", () => {
    expect(
      ruleProposalSchema.safeParse({ title: "T", statement: "E", example: "voir https://x.org" })
        .success,
    ).toBe(false);
  });
});
