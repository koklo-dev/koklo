import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID } from "./support.ts";

/**
 * TK-101 lot A (contrat 2.11.0, additif, B329) : `ai.prefillItem` (texte brut, aucune écriture), `spec.item.get`
 * (valeurs, validation, références entrantes) et `spec.refs.search` (autocomplétion, 20 résultats au plus).
 */
describe("TK-101 A surface : trois routes, chemins et méthodes", () => {
  it.each([
    ["ai.prefillItem", "post", "/projects/{projectId}/ai/item/prefill"],
    ["spec.item.get", "get", "/projects/{projectId}/spec/items/{type}/{id}"],
    ["spec.refs.search", "get", "/projects/{projectId}/spec/refs"],
  ])("%s : %s %s", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });
});

describe("TK-101 A ai.prefillItem", () => {
  const body = { projectId: UUID, type: "feature", description: "Annuler une réservation" };

  it("entrée : type feature seul, description de 1 à 500 caractères non vide (la politique de texte brut est appliquée par le serveur)", async () => {
    const i = input("ai.prefillItem");
    expect(await isValid(i, body)).toBe(true);
    expect(await isValid(i, { ...body, description: "x".repeat(500) })).toBe(true);
    for (const bad of [
      { ...body, type: "rule" },
      { ...body, type: "table" },
      { ...body, description: "" },
      { ...body, description: "x".repeat(501) },
      { projectId: UUID, type: "feature" },
    ]) {
      expect(await isValid(i, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("sortie : type et valeurs facultatives en texte brut (titre, priorité, description, critères, liens)", async () => {
    const o = output("ai.prefillItem");
    const values = {
      title: "Annuler une réservation",
      priority: "must",
      description: "Annuler.",
      criteria: [
        {
          title: "Annulation",
          steps: [
            { type: "etant_donne", text: "une réservation" },
            { type: "quand", text: "j'annule" },
            { type: "alors", text: "elle est annulée" },
          ],
        },
      ],
      links: ["R-001", "S-accueil"],
    };
    expect(await isValid(o, { type: "feature", values })).toBe(true);
    expect(await isValid(o, { type: "feature", values: {} })).toBe(true);
    for (const bad of [
      { type: "rule", values: {} },
      { type: "feature" },
      { type: "feature", values: { priority: "urgent" } },
      { type: "feature", values: { links: "R-001" } },
    ]) {
      expect(await isValid(o, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("erreurs : celles des propositions (403, 404, sortie invalide, quota)", () => {
    expect(Object.keys(errors("ai.prefillItem"))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "LLM_OUTPUT_INVALID"]),
    );
  });
});

describe("TK-101 A spec.item.get", () => {
  const values = {
    specId: "F-003",
    title: "Annuler",
    status: "brouillon",
    priority: "must",
    description: "",
    criteria: [],
    tables: [],
    endpoints: [],
    screens: [],
    roles: [],
    rules: [],
    nfr: [],
    filePath: "features/F-003-annuler.md",
    commitSha: "a".repeat(40),
  };
  const sheet = {
    type: "feature",
    id: "F-003",
    values,
    validated: false,
    referencedBy: { items: [{ kind: "rule", specId: "R-001", title: "Délai" }], total: 1 },
  };

  it("entrée : projectId, type feature, identifiant F-nnn", async () => {
    const i = input("spec.item.get");
    expect(await isValid(i, { projectId: UUID, type: "feature", id: "F-003" })).toBe(true);
    expect(await isValid(i, { projectId: UUID, type: "rule", id: "F-003" })).toBe(false);
    expect(await isValid(i, { projectId: UUID, type: "feature", id: "x" })).toBe(false);
  });

  it("sortie : valeurs de la fiche, validated et references entrantes bornées à 20", async () => {
    const o = output("spec.item.get");
    expect(await isValid(o, sheet)).toBe(true);
    const twenty = Array.from({ length: 20 }, (_, n) => ({
      kind: "flow",
      specId: `P-${n}`,
      title: "Parcours",
    }));
    expect(await isValid(o, { ...sheet, referencedBy: { items: twenty, total: 25 } })).toBe(true);
    expect(
      await isValid(o, {
        ...sheet,
        referencedBy: { items: [...twenty, twenty[0]], total: 21 },
      }),
    ).toBe(false);
    expect(await isValid(o, { ...sheet, validated: "oui" })).toBe(false);
    expect(await isValid(o, { type: "feature", id: "F-003", values })).toBe(false);
  });

  it("erreurs : 401, 403, 404", () => {
    expect(Object.keys(errors("spec.item.get"))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]),
    );
  });
});

describe("TK-101 A spec.refs.search", () => {
  const base = { projectId: UUID, kinds: ["feature", "rule"], q: "annul" };

  it("entrée : de 1 à 6 genres connus, q de 0 à 100 caractères", async () => {
    const i = input("spec.refs.search");
    expect(await isValid(i, base)).toBe(true);
    expect(await isValid(i, { ...base, q: "" })).toBe(true);
    expect(await isValid(i, { ...base, q: "x".repeat(100) })).toBe(true);
    expect(
      await isValid(i, {
        ...base,
        kinds: ["feature", "rule", "flow", "table", "endpoint", "screen"],
      }),
    ).toBe(true);
    for (const bad of [
      { ...base, kinds: [] },
      { ...base, kinds: ["test"] },
      { ...base, kinds: ["feature", "rule", "flow", "table", "endpoint", "screen", "feature"] },
      { ...base, q: "x".repeat(101) },
      { projectId: UUID, kinds: ["feature"] },
    ]) {
      expect(await isValid(i, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("sortie : 20 éléments au plus, sans curseur", async () => {
    const o = output("spec.refs.search");
    const item = { kind: "feature", specId: "F-987", title: "Titre" };
    expect(await isValid(o, { items: [item] })).toBe(true);
    expect(await isValid(o, { items: Array.from({ length: 20 }, () => item) })).toBe(true);
    expect(await isValid(o, { items: Array.from({ length: 21 }, () => item) })).toBe(false);
  });

  it("erreurs : 401, 403, 404", () => {
    expect(Object.keys(errors("spec.refs.search"))).toEqual(
      expect.arrayContaining(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]),
    );
  });
});
