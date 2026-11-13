import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID } from "./support.ts";

/**
 * TK-107 lot A (contrat 3.5.0, additif, B383 à B391) : opérations `table.*` et `fixture.create` de `specBatch.submit`,
 * lectures `spec.data.*`, `spec.item.get` de type `table`, compteurs `relations` et `fixtures`.
 */
describe("TK-107 A surface", () => {
  it("version 3.6.0", () => {
    expect(CONTRACT_VERSION).toBe("3.6.0");
  });

  it.each([
    ["spec.data.tables.list", "get", "/projects/{projectId}/spec/data/tables"],
    ["spec.data.mermaid", "get", "/projects/{projectId}/spec/data/mermaid"],
    ["spec.data.fixtures.list", "get", "/projects/{projectId}/spec/data/fixtures"],
    ["spec.data.fixtures.rows", "get", "/projects/{projectId}/spec/data/fixtures/{fixtureId}/rows"],
  ])("%s : %s %s", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("lectures : 401, 403 (garde d'équipe), 404, VALIDATION, SPEC_INDEX_FAILED", () => {
    for (const name of [
      "spec.data.tables.list",
      "spec.data.mermaid",
      "spec.data.fixtures.list",
      "spec.data.fixtures.rows",
    ]) {
      expect(Object.keys(errors(name)), name).toEqual(
        expect.arrayContaining([
          "UNAUTHORIZED",
          "FORBIDDEN",
          "NOT_FOUND",
          "VALIDATION",
          "SPEC_INDEX_FAILED",
        ]),
      );
    }
  });
});

const batch = (operations: unknown[]) => ({ projectId: UUID, idempotencyKey: "k-1", operations });
const ok = async (operation: unknown) => isValid(input("specBatch.submit"), batch([operation]));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-107 A specBatch.submit : table.* et fixture.create", () => {
  const table = {
    kind: "table.create",
    name: "Réservation",
    zone: "Rendez-vous",
    fields: [
      { name: "id", type: "uuid", primaryKey: true },
      { name: "statut", type: "enum", values: ["confirmée", "annulée"] },
      { name: "client_id", type: "ref(T-client)", constraints: "Obligatoire" },
      { name: "email", type: "texte(255)", personalData: true, rule: "R-004" },
    ],
    description: "Un rendez-vous.",
    sources: ["F-001", "R-004"],
    relations: [{ to: "T-client", cardinality: "n → 1" }],
  };

  it("table.create : nom, zone et champs suffisent ; zone obligatoire (B385)", async () => {
    expect(await ok(table)).toBe(true);
    expect(
      await ok({
        kind: "table.create",
        name: "T",
        zone: "Z",
        fields: [{ name: "id", type: "uuid" }],
      }),
    ).toBe(true);
    expect(await ok({ ...table, zone: undefined })).toBe(false);
    expect(await ok({ ...table, name: "" })).toBe(false);
    expect(await ok({ ...table, fields: [] })).toBe(false);
  });

  it("champs : nom en snake_case, type du vocabulaire fermé, enum avec valeurs", async () => {
    const withField = (field: unknown) => ({ ...table, fields: [field] });
    expect(await ok(withField({ name: "Nom Client", type: "uuid" }))).toBe(false);
    expect(await ok(withField({ name: "a", type: "varchar" }))).toBe(false);
    expect(await ok(withField({ name: "a", type: "enum" }))).toBe(false);
    expect(await ok(withField({ name: "a", type: "ref(client)" }))).toBe(false);
    expect(await ok(withField({ name: "a", type: "texte(80)" }))).toBe(true);
    expect(await ok(withField({ name: "a", type: "ref(T-client)" }))).toBe(true);
  });

  it("liens : sources F-nnn ou R-nnn, relations vers T-slug, cardinalités fermées", async () => {
    expect(await ok({ ...table, sources: ["X-1"] })).toBe(false);
    expect(await ok({ ...table, relations: [{ to: "client", cardinality: "n → 1" }] })).toBe(false);
    expect(await ok({ ...table, relations: [{ to: "T-client", cardinality: "1-n" }] })).toBe(false);
    for (const cardinality of ["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"]) {
      expect(
        await ok({ ...table, relations: [{ to: "T-client", cardinality }] }),
        cardinality,
      ).toBe(true);
    }
  });

  it("table.update et table.delete : identifiant T-slug, au moins un champ à modifier", async () => {
    expect(await ok({ kind: "table.update", specId: "T-reservation", zone: "Agenda" })).toBe(true);
    expect(await ok({ kind: "table.update", specId: "T-reservation" })).toBe(false);
    expect(await ok({ kind: "table.update", specId: "F-001", zone: "Agenda" })).toBe(false);
    expect(await ok({ kind: "table.delete", specId: "T-reservation" })).toBe(true);
    expect(await ok({ kind: "table.delete", specId: "R-001" })).toBe(false);
  });

  it("fixture.create : titre, table et lignes (200 au plus, valeurs scalaires)", async () => {
    const fixture = {
      kind: "fixture.create",
      title: "Clients",
      table: "T-client",
      locale: "fr-FR",
      rows: [{ nom: "Léa", actif: true, age: 31 }],
    };
    expect(await ok(fixture)).toBe(true);
    expect(await ok({ ...fixture, locale: undefined })).toBe(true);
    expect(await ok({ ...fixture, title: "" })).toBe(false);
    expect(await ok({ ...fixture, table: "client" })).toBe(false);
    expect(await ok({ ...fixture, rows: [{ a: { b: 1 } }] })).toBe(false);
    expect(await ok({ ...fixture, rows: Array.from({ length: 201 }, () => ({ a: 1 })) })).toBe(
      false,
    );
  });

  it("sortie : results[].specId accepte T-slug et FX-slug ; les nouveaux kinds sont rapportés", async () => {
    const result = (kind: string, specId: string | null) => ({
      id: UUID,
      branch: "cadrage",
      status: "committed",
      idempotencyKey: "k",
      baseSha: null,
      commitSha: "a".repeat(40),
      errorCode: null,
      report: null,
      results: [{ position: 1, kind, specId }],
      enqueuedAt: "2026-11-13T10:00:00.000Z",
      committedAt: "2026-11-13T10:00:01.000Z",
    });
    const schema = output("specBatch.submit");
    expect(await isValid(schema, result("table.create", "T-reservation"))).toBe(true);
    expect(await isValid(schema, result("fixture.create", "FX-clients"))).toBe(true);
    expect(await isValid(schema, result("table.delete", "T-reservation"))).toBe(true);
    expect(await isValid(schema, result("table.create", "X-1"))).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-107 A spec.data.*", () => {
  it("tables.list : filtres zone et q, curseur, limit, around T-slug exclusif du curseur", async () => {
    const schema = input("spec.data.tables.list");
    expect(await isValid(schema, { projectId: UUID })).toBe(true);
    expect(
      await isValid(schema, { projectId: UUID, q: "res", zone: "Rendez-vous", limit: "50" }),
    ).toBe(true);
    expect(await isValid(schema, { projectId: UUID, around: "T-table-070" })).toBe(true);
    expect(await isValid(schema, { projectId: UUID, around: "table-070" })).toBe(false);
    expect(await isValid(schema, { projectId: UUID, around: "T-a", cursor: "c" })).toBe(false);
    expect(await isValid(schema, { projectId: UUID, branch: "b", commitSha: "a".repeat(40) })).toBe(
      false,
    );
  });

  it("tables.list : sortie à curseur avec total, lignes de tableau typées", async () => {
    const item = {
      specId: "T-client",
      name: "Client",
      zone: "Clients",
      fieldCount: 5,
      relationCount: 2,
      usedBy: ["F-001", "R-004"],
      personalData: true,
      filePath: "data/tables/client.yaml",
    };
    const page = (items: unknown[]) => ({
      items,
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: items.length,
    });
    const schema = output("spec.data.tables.list");
    expect(await isValid(schema, page([item]))).toBe(true);
    expect(await isValid(schema, page([{ ...item, fieldCount: -1 }]))).toBe(false);
    expect(await isValid(schema, page([{ ...item, usedBy: undefined }]))).toBe(false);
  });

  it("mermaid : texte, indication de génération à la volée et commit", async () => {
    const out = { text: "erDiagram\n", generated: false, commitSha: "a".repeat(40) };
    expect(await isValid(output("spec.data.mermaid"), out)).toBe(true);
    expect(await isValid(output("spec.data.mermaid"), { ...out, text: undefined })).toBe(false);
    expect(await isValid(input("spec.data.mermaid"), { projectId: UUID })).toBe(true);
  });

  it("fixtures.list : jeux avec table, locale et nombre de lignes", async () => {
    const item = {
      specId: "FX-clients",
      title: "Clients",
      table: "T-client",
      locale: "fr-FR",
      rowCount: 3,
      filePath: "data/fixtures/FX-clients.yaml",
    };
    expect(await isValid(output("spec.data.fixtures.list"), { items: [item] })).toBe(true);
    expect(
      await isValid(output("spec.data.fixtures.list"), { items: [{ ...item, rowCount: "3" }] }),
    ).toBe(false);
  });

  it("fixtures.rows : page de 25 (taille du tableau), fixtureId FX-slug", async () => {
    const schema = input("spec.data.fixtures.rows");
    const base = { projectId: UUID, fixtureId: "FX-clients", page: "2", size: "25" };
    expect(await isValid(schema, base)).toBe(true);
    expect(await isValid(schema, { ...base, fixtureId: "clients" })).toBe(false);
    expect(await isValid(schema, { ...base, size: "30" })).toBe(false);
    expect(await isValid(schema, { ...base, page: "0" })).toBe(false);
    const out = { columns: ["nom"], items: [{ nom: "Léa" }], total: 1, totalIsEstimate: false };
    expect(await isValid(output("spec.data.fixtures.rows"), out)).toBe(true);
    expect(await isValid(output("spec.data.fixtures.rows"), { ...out, columns: undefined })).toBe(
      false,
    );
  });
});

describe("TK-107 A spec.item.get table et compteurs", () => {
  it("entrée : type table avec identifiant T-slug ; refusé pour un autre identifiant", async () => {
    const schema = input("spec.item.get");
    expect(await isValid(schema, { projectId: UUID, type: "table", id: "T-client" })).toBe(true);
    expect(await isValid(schema, { projectId: UUID, type: "table", id: "F-001" })).toBe(false);
  });

  it("sortie : valeurs d'une table, validated et referencedBy", async () => {
    const out = {
      type: "table",
      id: "T-client",
      values: {
        specId: "T-client",
        name: "Client",
        description: "",
        zone: "Clients",
        sources: ["F-001"],
        fields: [{ name: "id", type: "uuid", primaryKey: true, personalData: false }],
        relations: [{ to: "T-ville", cardinality: "n → 1" }],
        filePath: "data/tables/client.yaml",
        commitSha: "a".repeat(40),
      },
      validated: false,
      referencedBy: {
        items: [{ kind: "table", specId: "T-resa", title: "Réservation" }],
        total: 1,
      },
    };
    expect(await isValid(output("spec.item.get"), out)).toBe(true);
    expect(await isValid(output("spec.item.get"), { ...out, id: "F-001" })).toBe(false);
  });

  it("spec.head.counts : relations et fixtures", async () => {
    const head = {
      branch: "cadrage",
      commitSha: "a".repeat(40),
      status: "ready",
      errorCode: null,
      indexedAt: "2026-11-13T10:00:00.000Z",
      counts: {
        features: 1,
        tables: 6,
        endpoints: 0,
        rules: 0,
        roles: 0,
        flows: 0,
        relations: 6,
        fixtures: 2,
      },
    };
    expect(await isValid(output("spec.head"), head)).toBe(true);
    const { relations: _r, ...partial } = head.counts;
    expect(await isValid(output("spec.head"), { ...head, counts: partial })).toBe(false);
  });
});

const POSITIONS = { "T-reservation": { x: 40, y: 120 }, "T-client": { x: 0, y: 0 } };
const save = (positions: unknown, over: Record<string, unknown> = {}) => ({
  projectId: UUID,
  idempotencyKey: "k-layout-1",
  positions,
  ...over,
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-108 B (contrat 3.6.0, additif, B417) : diagramme du modèle", () => {
  it.each([
    ["spec.data.layout.get", "get", "/projects/{projectId}/spec/data/layout"],
    ["spec.data.layout.save", "post", "/projects/{projectId}/spec/data/layout"],
    ["spec.data.tables.source", "get", "/projects/{projectId}/spec/data/tables/{tableId}/source"],
  ])("%s : %s %s", async (name, method, path) => {
    expect(proc(name), name).toBeDefined();
    const doc = (await generateOpenApi()) as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("lectures : 401, 403, 404, VALIDATION, SPEC_INDEX_FAILED ; layout.get et tables.source rendent le texte lu", () => {
    for (const name of ["spec.data.layout.get", "spec.data.tables.source"]) {
      expect(Object.keys(errors(name)), name).toEqual(
        expect.arrayContaining([
          "UNAUTHORIZED",
          "FORBIDDEN",
          "NOT_FOUND",
          "VALIDATION",
          "SPEC_INDEX_FAILED",
        ]),
      );
    }
  });

  it("layout.save : erreurs d'écriture d'un lot (403, 404, VALIDATION, conflit, spec invalide, fournisseur)", () => {
    expect(Object.keys(errors("spec.data.layout.save"))).toEqual(
      expect.arrayContaining([
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "VALIDATION",
        "SPEC_BATCH_CONFLICT",
        "SPEC_INVALID",
        "PROVIDER_UNAVAILABLE",
      ]),
    );
  });

  it("layout.save : positions entières 0 à 20000, identifiants T-slug, 500 entrées au plus, clé d'idempotence", async () => {
    const schema = input("spec.data.layout.save");
    expect(await isValid(schema, save(POSITIONS))).toBe(true);
    expect(await isValid(schema, save({}))).toBe(true);
    expect(await isValid(schema, save({ "T-a": { x: -1, y: 0 } }))).toBe(false);
    expect(await isValid(schema, save({ "T-a": { x: 0, y: 20001 } }))).toBe(false);
    expect(await isValid(schema, save({ "T-a": { x: 1.5, y: 0 } }))).toBe(false);
    expect(await isValid(schema, save({ client: { x: 0, y: 0 } }))).toBe(false);
    expect(await isValid(schema, save({ "T-a": { x: 0, y: 0, z: 1 } }))).toBe(false);
    const many = Object.fromEntries(
      Array.from({ length: 501 }, (_, index) => [`T-t${index}`, { x: 0, y: 0 }]),
    );
    expect(await isValid(schema, save(many))).toBe(false);
    expect(
      await isValid(schema, save(Object.fromEntries(Object.entries(many).slice(0, 500)))),
    ).toBe(true);
    expect(await isValid(schema, { projectId: UUID, positions: POSITIONS })).toBe(false);
  });

  it("layout.get et tables.source : révision exclusive ; source : identifiant T-slug dans le chemin", async () => {
    const get = input("spec.data.layout.get");
    expect(await isValid(get, { projectId: UUID })).toBe(true);
    expect(await isValid(get, { projectId: UUID, branch: "cadrage" })).toBe(true);
    expect(await isValid(get, { projectId: UUID, branch: "a", commitSha: "0".repeat(40) })).toBe(
      false,
    );
    const source = input("spec.data.tables.source");
    expect(await isValid(source, { projectId: UUID, tableId: "T-client" })).toBe(true);
    expect(await isValid(source, { projectId: UUID, tableId: "client" })).toBe(false);
  });

  it("sorties : positions + commitSha ; commitSha seul (nul tant que le lot n'est pas commité) ; chemin, texte, généré", async () => {
    const sha = "0".repeat(40);
    expect(
      await isValid(output("spec.data.layout.get"), { positions: POSITIONS, commitSha: sha }),
    ).toBe(true);
    expect(await isValid(output("spec.data.layout.get"), { positions: {}, commitSha: sha })).toBe(
      true,
    );
    expect(await isValid(output("spec.data.layout.save"), { commitSha: sha })).toBe(true);
    expect(await isValid(output("spec.data.layout.save"), { commitSha: null })).toBe(true);
    expect(
      await isValid(output("spec.data.tables.source"), {
        path: "data/tables/client.yaml",
        text: "id: T-client\n",
        commitSha: sha,
        generated: false,
      }),
    ).toBe(true);
    expect(await isValid(output("spec.data.tables.source"), { text: "x" })).toBe(false);
  });

  it("l'opération layout.save est connue de specBatch.get mais n'est pas soumissible par specBatch.submit", async () => {
    const sha = "0".repeat(40);
    const stored = (kind: string) => ({
      id: UUID,
      branch: "cadrage",
      status: "committed",
      idempotencyKey: "k-1",
      baseSha: null,
      commitSha: sha,
      errorCode: null,
      report: null,
      results: [{ position: 0, kind, specId: null }],
      enqueuedAt: "2026-11-13T10:00:00.000Z",
      committedAt: "2026-11-13T10:00:01.000Z",
    });
    expect(await isValid(output("specBatch.get"), stored("layout.save"))).toBe(true);
    expect(
      await isValid(input("specBatch.submit"), {
        projectId: UUID,
        idempotencyKey: "k-1",
        operations: [{ kind: "layout.save", positions: POSITIONS }],
      }),
    ).toBe(false);
  });
});
