import {
  emitFeatureMarkdown,
  emitFlowYaml,
  emitRolesYaml,
  emitRuleMarkdown,
  type Feature,
  parseFlowFile,
  parseRuleMarkdown,
  parseSpecFiles,
} from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { defaultSubject } from "./message.ts";
import { integrityProblem, slugOf } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation } from "./types.ts";

/** TK-103 lot A : opérations rule.*, role.*, flow.* du plan (pur) : écriture, conflits, droits, références, SPEC_INVALID. */
const feature = (id: string) => ({
  path: `features/${id}-x.md`,
  content: emitFeatureMarkdown({
    id,
    titre: `Feature ${id}`,
    statut: "brouillon",
    priorite: "should",
    tables: [],
    endpoints: [],
    ecrans: [],
    roles: [],
    regles: [],
    nfr: [],
    description: "",
    criteres: [],
  }),
});
const ruleFile = (id: string) => ({
  path: `domain/rules/${id}-delai.md`,
  content: emitRuleMarkdown({
    id,
    titre: "Délai",
    type: "contrainte",
    tables: [],
    endpoints: [],
    enonce: "Un délai.",
    exemples: [],
  }),
});
const rolesFile = (roles: string[]) => ({
  path: "domain/roles.yaml",
  content: emitRolesYaml({
    roles: roles.map((id) => ({
      id: `RL-${id}`,
      nom: id,
      description: `Rôle ${id}`,
      permissions: ["PM-agenda.lire"],
    })),
    permissions: [
      {
        id: "PM-agenda.lire",
        action: "lire",
        ressource: "agenda",
        conditions: [],
        endpoints: [],
      },
    ],
  }),
});
const flowFile = (id: string) => ({
  path: `design/flows/${id}.yaml`,
  content: emitFlowYaml({
    id,
    titre: "Inscription",
    acteur: "Visiteur",
    depart: { libelle: "Ouvrir" },
    etapes: [{ libelle: "Remplir" }],
    erreurs: [],
    fonctionnalites: [],
  }),
});
const op = (kind: string, targetSpecId: string | null, payload = {}): BatchOperation => ({
  position: 1,
  kind,
  targetSpecId,
  payload,
});
const plan = (operations: BatchOperation[], files = [feature("F-001")], authorRole = "dev") =>
  planBatch({ operations, authorRole }, files);
const changes = (result: ReturnType<typeof plan>) => ("changes" in result ? result.changes : []);
const contentOf = (result: ReturnType<typeof plan>, path: string) => {
  const change = changes(result).find((c) => c.path === path);
  return change && "content" in change ? change.content : undefined;
};

const RULE = { title: "Annulation tardive", type: "contrainte", statement: "Un délai." };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("règles : rule.create, rule.update, rule.delete", () => {
  it("create écrit domain/rules/R-nnn-<slug>.md relisible, avec états et fonctionnalités", () => {
    const result = plan([
      op("rule.create", "R-007", {
        ...RULE,
        type: "workflow",
        states: ["Brouillon", "Validée"],
        features: ["F-001"],
        examples: ["Un exemple."],
      }),
    ]);
    const path = "domain/rules/R-007-annulation-tardive.md";
    const parsed = parseRuleMarkdown(path, contentOf(result, path) ?? "");
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        id: "R-007",
        titre: "Annulation tardive",
        type: "workflow",
        etats: ["Brouillon", "Validée"],
        fonctionnalites: ["F-001"],
        enonce: "Un délai.",
        exemples: ["Un exemple."],
      },
    });
  });

  it("update garde le chemin et ne change que les champs présents ; delete supprime le fichier", () => {
    const files = [feature("F-001"), ruleFile("R-003")];
    const updated = plan([op("rule.update", "R-003", { statement: "Nouveau délai." })], files);
    const path = "domain/rules/R-003-delai.md";
    expect(changes(updated).map((c) => c.path)).toEqual([path]);
    expect(parseRuleMarkdown(path, contentOf(updated, path) ?? "")).toMatchObject({
      value: { titre: "Délai", enonce: "Nouveau délai." },
    });
    expect(plan([op("rule.delete", "R-003")], files)).toMatchObject({
      changes: [{ path, delete: true }],
    });
  });

  it("conflits : create d'une règle présente, update ou delete d'une règle absente", () => {
    const files = [feature("F-001"), ruleFile("R-003")];
    for (const operations of [
      [op("rule.create", "R-003", RULE)],
      [op("rule.update", "R-009", { title: "x" })],
      [op("rule.delete", "R-009")],
    ]) {
      expect(plan(operations, files)).toMatchObject({
        outcome: { status: "conflict", errorCode: "write_conflict" },
      });
    }
  });

  it("références : F-999 refusé SPEC_INVALID, sauf si la fonctionnalité est dans le même lot", () => {
    const refused = plan([op("rule.create", "R-007", { ...RULE, features: ["F-999"] })]);
    expect(refused).toMatchObject({ outcome: { status: "failed", errorCode: "SPEC_INVALID" } });
    const sameBatch = plan([
      op("feature.create", "F-002", { title: "Nouvelle", priority: "must" }),
      op("rule.create", "R-007", { ...RULE, features: ["F-002"] }),
    ]);
    expect(sameBatch).toHaveProperty("changes");
  });

  it("énoncé qui ouvre une section : SPEC_INVALID avec rapport", () => {
    const result = plan([op("rule.create", "R-007", { ...RULE, statement: "a\n## Exemples\nb" })]);
    expect(result).toMatchObject({
      outcome: { status: "failed", errorCode: "SPEC_INVALID", report: { ok: false } },
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("rôles : role.create, role.update, role.delete sur domain/roles.yaml", () => {
  const ROLE = {
    name: "Gestionnaire",
    description: "Gère l'agenda.",
    permissions: [
      { id: "PM-agenda.lire" },
      { id: "PM-agenda.modifier", restriction: "les siennes" },
    ],
  };

  it("create sans fichier : écrit roles.yaml, crée la permission inconnue (ressource et action déduites)", () => {
    const result = plan([op("role.create", "RL-gestionnaire", ROLE)]);
    const { spec, issues } = parseSpecFiles([
      { path: "domain/roles.yaml", content: contentOf(result, "domain/roles.yaml") ?? "" },
    ]);
    expect(issues).toEqual([]);
    const file = spec.roles[0]?.value;
    expect(file?.roles[0]).toMatchObject({
      id: "RL-gestionnaire",
      nom: "Gestionnaire",
      permissions: ["PM-agenda.lire", "PM-agenda.modifier"],
      restrictions: { "PM-agenda.modifier": "les siennes" },
    });
    expect(file?.permissions).toEqual([
      expect.objectContaining({ id: "PM-agenda.lire", ressource: "agenda", action: "lire" }),
      expect.objectContaining({
        id: "PM-agenda.modifier",
        ressource: "agenda",
        action: "modifier",
      }),
    ]);
  });

  it("create sur un fichier existant ne perd ni les rôles ni les permissions déjà présents", () => {
    const result = plan([op("role.create", "RL-gestionnaire", ROLE)], [rolesFile(["admin"])]);
    const file = parseSpecFiles([
      { path: "domain/roles.yaml", content: contentOf(result, "domain/roles.yaml") ?? "" },
    ]).spec.roles[0]?.value;
    expect(file?.roles.map((r) => r.id)).toEqual(["RL-admin", "RL-gestionnaire"]);
    expect(file?.permissions.map((p) => p.id)).toEqual(["PM-agenda.lire", "PM-agenda.modifier"]);
  });

  it("deux lots successifs sur deux rôles (lecture de la tête rejouée) gardent les deux", () => {
    const first = plan(
      [op("role.create", "RL-un", { ...ROLE, name: "Un" })],
      [rolesFile(["admin"])],
    );
    const afterFirst = {
      path: "domain/roles.yaml",
      content: contentOf(first, "domain/roles.yaml") ?? "",
    };
    const second = plan([op("role.create", "RL-deux", { ...ROLE, name: "Deux" })], [afterFirst]);
    const file = parseSpecFiles([
      { path: "domain/roles.yaml", content: contentOf(second, "domain/roles.yaml") ?? "" },
    ]).spec.roles[0]?.value;
    expect(file?.roles.map((r) => r.id)).toEqual(["RL-admin", "RL-un", "RL-deux"]);
  });

  it("conflits : create d'un rôle présent, update ou delete d'un rôle absent", () => {
    for (const operations of [
      [op("role.create", "RL-admin", ROLE)],
      [op("role.update", "RL-absent", { name: "x" })],
      [op("role.delete", "RL-absent")],
    ]) {
      expect(plan(operations, [rolesFile(["admin"])])).toMatchObject({
        outcome: { status: "conflict", errorCode: "write_conflict" },
      });
    }
  });

  it("update remplace les permissions et les restrictions du rôle ; delete le retire", () => {
    const files = [rolesFile(["admin"])];
    const updated = plan(
      [
        op("role.update", "RL-admin", {
          permissions: [{ id: "PM-agenda.lire", restriction: "les siennes" }],
        }),
      ],
      files,
    );
    const file = parseSpecFiles([
      { path: "domain/roles.yaml", content: contentOf(updated, "domain/roles.yaml") ?? "" },
    ]).spec.roles[0]?.value;
    expect(file?.roles[0]).toMatchObject({
      description: "Rôle admin",
      restrictions: { "PM-agenda.lire": "les siennes" },
    });
    const removed = plan([op("role.delete", "RL-admin")], files);
    const after = parseSpecFiles([
      { path: "domain/roles.yaml", content: contentOf(removed, "domain/roles.yaml") ?? "" },
    ]).spec.roles[0]?.value;
    expect(after?.roles).toEqual([]);
  });

  it("une fonctionnalité qui cite le rôle supprimé : SPEC_INVALID", () => {
    const cited = {
      path: "features/F-002-x.md",
      content: emitFeatureMarkdown({
        ...(parseSpecFiles([feature("F-002")]).spec.features[0]?.value as object as Feature),
        roles: ["RL-admin"],
      }),
    };
    const result = plan([op("role.delete", "RL-admin")], [rolesFile(["admin"]), cited]);
    expect(result).toMatchObject({ outcome: { status: "failed", errorCode: "SPEC_INVALID" } });
  });
});

describe("parcours : flow.create, flow.update, flow.delete", () => {
  const FLOW = {
    title: "Inscription",
    actor: "Visiteur",
    start: { label: "Ouvrir la page" },
    steps: [{ label: "Remplir" }, { label: "Confirmer" }],
    errors: [{ step: 1, text: "Échec" }],
    features: ["F-001"],
  };

  it("create écrit design/flows/P-<slug>.yaml relisible", () => {
    const result = plan([op("flow.create", "P-inscription", FLOW)]);
    const path = "design/flows/P-inscription.yaml";
    expect(parseFlowFile(path, contentOf(result, path) ?? "")).toMatchObject({
      ok: true,
      value: {
        id: "P-inscription",
        titre: "Inscription",
        acteur: "Visiteur",
        depart: { libelle: "Ouvrir la page" },
        etapes: [{ libelle: "Remplir" }, { libelle: "Confirmer" }],
        erreurs: [{ etape: 1, texte: "Échec" }],
        fonctionnalites: ["F-001"],
      },
    });
  });

  it("update et delete d'un parcours présent ; conflit si absent ou déjà présent", () => {
    const files = [feature("F-001"), flowFile("P-inscription")];
    const path = "design/flows/P-inscription.yaml";
    const updated = plan([op("flow.update", "P-inscription", { actor: "Client" })], files);
    expect(parseFlowFile(path, contentOf(updated, path) ?? "")).toMatchObject({
      value: { acteur: "Client", titre: "Inscription" },
    });
    expect(plan([op("flow.delete", "P-inscription")], files)).toMatchObject({
      changes: [{ path, delete: true }],
    });
    for (const operations of [
      [op("flow.create", "P-inscription", FLOW)],
      [op("flow.update", "P-autre", { actor: "x" })],
      [op("flow.delete", "P-autre")],
    ]) {
      expect(plan(operations, files)).toMatchObject({
        outcome: { status: "conflict", errorCode: "write_conflict" },
      });
    }
  });

  it("références : un parcours citant S-absent est refusé SPEC_INVALID", () => {
    const result = plan([
      op("flow.create", "P-inscription", { ...FLOW, steps: [{ label: "x", screen: "S-absent" }] }),
    ]);
    expect(result).toMatchObject({ outcome: { status: "failed", errorCode: "SPEC_INVALID" } });
  });
});

describe("droits du designer (B340)", () => {
  it("flow.* accepté ; rule.* et role.* FORBIDDEN", () => {
    const flow = op("flow.create", "P-a", {
      title: "A",
      actor: "B",
      start: { label: "c" },
      steps: [{ label: "d" }],
    });
    expect(plan([flow], [feature("F-001")], "designer")).toHaveProperty("changes");
    for (const forbidden of [
      op("rule.create", "R-007", RULE),
      op("role.create", "RL-a", {
        name: "A",
        description: "B",
        permissions: [{ id: "PM-a.lire" }],
      }),
    ]) {
      expect(plan([forbidden], [feature("F-001")], "designer")).toMatchObject({
        outcome: { status: "failed", errorCode: "FORBIDDEN" },
      });
    }
  });
});

describe("intégrité, chemins et objet du commit", () => {
  const batch = (kind: string, targetSpecId: string | null) => ({
    branch: "cadrage",
    repo: { specPath: null },
    operations: [op(kind, targetSpecId)],
  });
  it("accepte les nouveaux genres avec un identifiant du bon type, refuse le reste", () => {
    for (const [kind, id] of [
      ["rule.create", "R-007"],
      ["role.update", "RL-admin"],
      ["flow.delete", "P-inscription"],
    ] as const) {
      expect(integrityProblem(batch(kind, id) as never), kind).toBeUndefined();
    }
    expect(integrityProblem(batch("rule.create", "F-001") as never)).toBe("specId");
    expect(integrityProblem(batch("role.create", "R-001") as never)).toBe("specId");
    expect(integrityProblem(batch("flow.create", "../etc") as never)).toBe("specId");
  });

  it("slugOf accepte un repli", () => {
    expect(slugOf("", "regle")).toBe("regle");
    expect(slugOf("Annulation tardive")).toBe("annulation-tardive");
  });

  it("l'objet par défaut verbe les nouveaux genres", () => {
    expect(
      defaultSubject([
        op("rule.create", "R-007"),
        op("role.update", "RL-a"),
        op("flow.delete", "P-b"),
      ]),
    ).toBe("spec: créé R-007 ; modifié RL-a ; supprimé P-b");
  });
});
