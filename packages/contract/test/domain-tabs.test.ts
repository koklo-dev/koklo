import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID } from "./support.ts";

/**
 * TK-103 lot A (contrat 3.1.0, additif, B339 à B342) : opérations `rule.*`, `role.*`, `flow.*` de `specBatch.submit`,
 * lectures `spec.functional.list` et `spec.roles.matrix`, `spec.item.get` étendu, compteurs `rules`, `roles`, `flows`.
 */
describe("TK-103 A surface", () => {
  it("version 3.1.0", () => {
    expect(CONTRACT_VERSION).toBe("3.1.0");
  });

  it.each([
    ["spec.functional.list", "get", "/projects/{projectId}/spec/functional"],
    ["spec.roles.matrix", "get", "/projects/{projectId}/spec/roles/matrix"],
  ])("%s : %s %s", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("lectures : erreurs de spec.listFeatures (401, 404, VALIDATION, SPEC_INDEX_FAILED) ; le 403 vient de la garde", () => {
    for (const name of ["spec.functional.list", "spec.roles.matrix"]) {
      expect(Object.keys(errors(name)), name).toEqual(
        expect.arrayContaining(["UNAUTHORIZED", "NOT_FOUND", "VALIDATION", "SPEC_INDEX_FAILED"]),
      );
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-103 A specBatch.submit : opérations de règle, de rôle et de parcours", () => {
  const batch = (operations: unknown[]) => ({
    projectId: UUID,
    idempotencyKey: "k-1",
    operations,
  });
  const ok = async (operation: unknown) => isValid(input("specBatch.submit"), batch([operation]));

  it("rule.create : titre, type et énoncé suffisent ; états, exemples et liens facultatifs", async () => {
    const rule = {
      kind: "rule.create",
      title: "Délai",
      type: "contrainte",
      statement: "Un délai.",
    };
    expect(await ok(rule)).toBe(true);
    expect(
      await ok({
        ...rule,
        type: "workflow",
        states: ["Brouillon", "Validée"],
        examples: ["Brouillon puis Validée."],
        features: ["F-001"],
      }),
    ).toBe(true);
    expect(await ok({ ...rule, type: "workflow" })).toBe(false);
    expect(await ok({ ...rule, type: "workflow", states: [] })).toBe(false);
    for (const bad of [
      { ...rule, title: "" },
      { ...rule, type: "constraint" },
      { ...rule, statement: undefined },
      { ...rule, features: ["X-1"] },
    ]) {
      expect(await ok(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("rule.update et rule.delete : identifiant R-nnn, au moins un champ à modifier", async () => {
    expect(await ok({ kind: "rule.update", specId: "R-003", statement: "Nouveau." })).toBe(true);
    expect(await ok({ kind: "rule.update", specId: "R-003" })).toBe(false);
    expect(await ok({ kind: "rule.update", specId: "F-003", title: "x" })).toBe(false);
    expect(await ok({ kind: "rule.delete", specId: "R-003" })).toBe(true);
    expect(await ok({ kind: "rule.delete", specId: "RL-admin" })).toBe(false);
  });

  it("role.create : nom, description et au moins une permission PM-… avec restriction facultative", async () => {
    const role = {
      kind: "role.create",
      name: "Gestionnaire",
      description: "Gère l'agenda.",
      permissions: [
        { id: "PM-agenda.lire" },
        { id: "PM-agenda.modifier", restriction: "les siennes" },
      ],
    };
    expect(await ok(role)).toBe(true);
    expect(await ok({ ...role, permissions: [] })).toBe(false);
    expect(await ok({ ...role, permissions: [{ id: "agenda" }] })).toBe(false);
    expect(await ok({ ...role, name: "" })).toBe(false);
  });

  it("role.update et role.delete : identifiant RL-slug", async () => {
    expect(await ok({ kind: "role.update", specId: "RL-gestionnaire", name: "Chef" })).toBe(true);
    expect(await ok({ kind: "role.update", specId: "R-001", name: "Chef" })).toBe(false);
    expect(await ok({ kind: "role.delete", specId: "RL-gestionnaire" })).toBe(true);
  });

  it("flow.create : titre, acteur, départ, au moins une étape ; erreurs et fonctionnalités facultatives", async () => {
    const flow = {
      kind: "flow.create",
      title: "Inscription",
      actor: "Visiteur",
      start: { label: "Ouvrir la page", screen: "S-register" },
      steps: [{ label: "Remplir" }, { label: "Confirmer", screen: "S-ok" }],
      errors: [{ step: 2, text: "Email déjà utilisé" }],
      features: ["F-001"],
    };
    expect(await ok(flow)).toBe(true);
    expect(await ok({ ...flow, steps: [] })).toBe(false);
    expect(await ok({ ...flow, start: { screen: "S-x" } })).toBe(false);
    expect(await ok({ ...flow, errors: [{ step: 0, text: "x" }] })).toBe(false);
    expect(await ok({ ...flow, steps: [{ label: "a", screen: "ecran" }] })).toBe(false);
  });

  it("flow.update et flow.delete : identifiant P-slug", async () => {
    expect(await ok({ kind: "flow.update", specId: "P-inscription", actor: "Client" })).toBe(true);
    expect(await ok({ kind: "flow.delete", specId: "P-inscription" })).toBe(true);
    expect(await ok({ kind: "flow.delete", specId: "F-001" })).toBe(false);
  });

  it("un lot mêle features, règles, rôles et parcours (200 opérations au plus)", async () => {
    const ops = [
      { kind: "feature.create", title: "F", priority: "must" },
      { kind: "rule.create", title: "R", type: "calcul", statement: "x" },
      { kind: "flow.delete", specId: "P-a" },
    ];
    expect(await isValid(input("specBatch.submit"), batch(ops))).toBe(true);
  });

  it("sortie : results[].specId accepte F-, R-, RL- et P- ; les nouveaux kinds sont rapportés", async () => {
    const result = (kind: string, specId: string | null) => ({
      id: UUID,
      branch: "cadrage",
      status: "committed",
      idempotencyKey: "k",
      baseSha: null,
      commitSha: "a".repeat(40),
      errorCode: null,
      report: null,
      results: [{ position: 0, kind, specId }],
      enqueuedAt: "2026-11-04T10:00:00.000Z",
      committedAt: "2026-11-04T10:00:01.000Z",
    });
    const o = output("specBatch.submit");
    for (const [kind, id] of [
      ["rule.create", "R-007"],
      ["role.update", "RL-gestionnaire"],
      ["flow.delete", "P-inscription"],
    ] as const) {
      expect(await isValid(o, result(kind, id)), kind).toBe(true);
    }
    expect(await isValid(o, result("rule.create", "X-1"))).toBe(false);
  });
});

describe("TK-103 A spec.functional.list", () => {
  const base = { projectId: UUID, tab: "rules" };

  it("entrée : onglet rules ou flows, filtre de type, recherche, curseur, around R-nnn ou P-slug", async () => {
    const i = input("spec.functional.list");
    expect(await isValid(i, base)).toBe(true);
    expect(await isValid(i, { ...base, tab: "flows", limit: "6" })).toBe(true);
    expect(await isValid(i, { ...base, type: "workflow", q: "annul", around: "R-250" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, tab: "flows", around: "P-inscription" })).toBe(true);
    for (const bad of [
      { projectId: UUID },
      { ...base, tab: "roles" },
      { ...base, type: "constraint" },
      { ...base, around: "F-001" },
      { ...base, around: "R-250", cursor: "abc" },
      { ...base, limit: 101 },
    ]) {
      expect(await isValid(i, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  const page = (items: unknown[]) => ({
    items,
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: items.length,
    facets: { type: { contrainte: 1, workflow: 1 } },
  });
  const rule = {
    kind: "rule",
    specId: "R-001",
    title: "Délai",
    type: "workflow",
    statement: "Un cycle.",
    states: ["Brouillon", "Validée"],
    features: ["F-001"],
    filePath: "domain/rules/R-001-delai.md",
  };
  const flow = {
    kind: "flow",
    specId: "P-inscription",
    title: "Inscription",
    actor: "Visiteur",
    start: { label: "Ouvrir", screen: "S-register" },
    steps: [{ label: "Remplir" }],
    errors: [{ step: 1, text: "Échec" }],
    features: ["F-001"],
    filePath: "design/flows/P-inscription.yaml",
  };

  it("sortie : page de règles ou de parcours, avec total et facette type", async () => {
    const o = output("spec.functional.list");
    expect(await isValid(o, page([rule, { ...rule, specId: "R-002", example: "Ex." }]))).toBe(true);
    expect(await isValid(o, page([flow]))).toBe(true);
    expect(await isValid(o, page([{ ...rule, type: "constraint" }]))).toBe(false);
    expect(await isValid(o, page([{ ...flow, steps: [{}] }]))).toBe(false);
    expect(await isValid(o, page([{ ...rule, kind: "role" }]))).toBe(false);
  });
});

describe("TK-103 A spec.roles.matrix", () => {
  it("entrée : projectId, group et q facultatifs", async () => {
    const i = input("spec.roles.matrix");
    expect(await isValid(i, { projectId: UUID })).toBe(true);
    expect(await isValid(i, { projectId: UUID, group: "agenda", q: "lire" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, group: "" })).toBe(false);
    expect(await isValid(i, {})).toBe(false);
  });

  it("sortie : rôles, groupes de ressources avec leur compte, actions avec l'accès de chaque rôle", async () => {
    const o = output("spec.roles.matrix");
    const matrix = {
      roles: [
        {
          specId: "RL-gestionnaire",
          name: "Gestionnaire",
          description: "Gère.",
          permissionCount: 2,
        },
      ],
      groups: [{ resource: "agenda", count: 2, open: true }],
      actions: [
        {
          specId: "PM-agenda.lire",
          label: "Consulter l'agenda",
          resource: "agenda",
          access: [{ roleId: "RL-gestionnaire", level: "allowed" }],
        },
        {
          specId: "PM-agenda.modifier",
          label: "Modifier l'agenda",
          resource: "agenda",
          access: [{ roleId: "RL-gestionnaire", level: "restricted", restriction: "les siennes" }],
        },
      ],
      total: 2,
    };
    expect(await isValid(o, matrix)).toBe(true);
    expect(await isValid(o, { ...matrix, total: -1 })).toBe(false);
    const bad = structuredClone(matrix);
    (bad.actions[0]?.access[0] as { level: string }).level = "maybe";
    expect(await isValid(o, bad)).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-103 A spec.item.get étendu et compteurs de tête", () => {
  const refs = { items: [], total: 0 };
  const sha = "a".repeat(40);

  it("entrée : type feature, rule, role ou flow, identifiant du type", async () => {
    const i = input("spec.item.get");
    for (const [type, id] of [
      ["feature", "F-003"],
      ["rule", "R-003"],
      ["role", "RL-admin"],
      ["flow", "P-inscription"],
    ]) {
      expect(await isValid(i, { projectId: UUID, type, id }), type).toBe(true);
    }
    expect(await isValid(i, { projectId: UUID, type: "rule", id: "F-003" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, type: "table", id: "T-user" })).toBe(false);
  });

  it("sortie : valeurs de règle, de rôle et de parcours", async () => {
    const o = output("spec.item.get");
    const rule = {
      type: "rule",
      id: "R-003",
      values: {
        specId: "R-003",
        title: "Délai",
        type: "contrainte",
        statement: "Un délai.",
        examples: [],
        states: [],
        features: [],
        tables: [],
        endpoints: [],
        filePath: "domain/rules/R-003-delai.md",
        commitSha: sha,
      },
      validated: false,
      referencedBy: refs,
    };
    const role = {
      type: "role",
      id: "RL-admin",
      values: {
        specId: "RL-admin",
        name: "Admin",
        description: "Tout.",
        permissions: [{ specId: "PM-agenda.lire", restriction: "les siennes" }],
        filePath: "domain/roles.yaml",
        commitSha: sha,
      },
      validated: true,
      referencedBy: refs,
    };
    const flow = {
      type: "flow",
      id: "P-inscription",
      values: {
        specId: "P-inscription",
        title: "Inscription",
        actor: "Visiteur",
        start: { label: "Ouvrir" },
        steps: [{ label: "Remplir", screen: "S-register" }],
        errors: [],
        features: [],
        filePath: "design/flows/P-inscription.yaml",
        commitSha: sha,
      },
      validated: false,
      referencedBy: refs,
    };
    for (const sheet of [rule, role, flow]) {
      expect(await isValid(o, sheet), sheet.type).toBe(true);
    }
    expect(await isValid(o, { ...rule, values: role.values })).toBe(false);
  });

  it("spec.head : counts porte rules, roles et flows", async () => {
    const o = output("spec.head");
    const head = {
      branch: "cadrage",
      commitSha: "b".repeat(40),
      status: "ready",
      errorCode: null,
      indexedAt: "2026-11-04T10:00:00.000Z",
      counts: { features: 1, tables: 2, endpoints: 3, rules: 4, roles: 3, flows: 5 },
    };
    expect(await isValid(o, head)).toBe(true);
    expect(await isValid(o, { ...head, counts: { features: 1, tables: 2, endpoints: 3 } })).toBe(
      false,
    );
  });
});
