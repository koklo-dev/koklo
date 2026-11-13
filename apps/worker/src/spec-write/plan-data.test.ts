import {
  emitFeatureMarkdown,
  emitFixtureYaml,
  emitRuleMarkdown,
  emitTableYaml,
  parseSpecFiles,
} from "@koklo/schema";
import { describe, expect, it } from "vitest";
import { integrityProblem } from "./paths.ts";
import { planBatch } from "./plan.ts";
import type { BatchOperation } from "./types.ts";

/**
 * TK-107 lot A (B383 à B386) : opérations table.* et fixture.create du plan (pur) : fichiers `data/tables/<slug>.yaml` et
 * `data/fixtures/FX-<slug>.yaml`, `data/model.mmd` régénéré dans le même lot, conflits, droits, références R4.
 */
const MANIFEST = {
  path: "koklo.project.yaml",
  content: "projet: demo\norganisation: acme\nspec_version: 2\n",
};
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
const rule = (id: string) => ({
  path: `domain/rules/${id}-x.md`,
  content: emitRuleMarkdown({
    id,
    titre: "Règle",
    type: "contrainte",
    tables: [],
    endpoints: [],
    enonce: "Un énoncé.",
    exemples: [],
  }),
});
const tableFile = (slug: string, relationsTo?: string) => ({
  path: `data/tables/${slug}.yaml`,
  content: emitTableYaml({
    id: `T-${slug}`,
    nom: slug,
    zone: "Clients",
    source: ["F-001"],
    champs: [{ nom: "id", type: "uuid", cle: "primaire" }],
    ...(relationsTo ? { relations: [{ vers: relationsTo, cardinalite: "n → 1" as const }] } : {}),
  }),
});
const BASE = [MANIFEST, feature("F-001"), rule("R-004"), tableFile("client")];

const op = (kind: string, targetSpecId: string | null, payload = {}): BatchOperation => ({
  position: 1,
  kind,
  targetSpecId,
  payload,
});
const plan = (operations: BatchOperation[], files = BASE, authorRole = "dev") =>
  planBatch({ operations, authorRole }, files);
const changes = (result: ReturnType<typeof plan>) => ("changes" in result ? result.changes : []);
const contentOf = (result: ReturnType<typeof plan>, path: string) => {
  const change = changes(result).find((c) => c.path === path);
  return change && "content" in change ? change.content : undefined;
};
const paths = (result: ReturnType<typeof plan>) =>
  changes(result)
    .map((c) => c.path)
    .sort();

const TABLE = {
  name: "Réservation",
  zone: "Rendez-vous",
  description: "Un rendez-vous.",
  sources: ["F-001", "R-004"],
  fields: [
    { name: "id", type: "uuid", primaryKey: true },
    { name: "client_id", type: "ref(T-client)" },
    { name: "email", type: "texte(255)", personalData: true, rule: "R-004" },
    { name: "statut", type: "enum", values: ["confirmée", "annulée"], constraints: "Obligatoire" },
  ],
  relations: [{ to: "T-client", cardinality: "n → 1" }],
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("tables : table.create, table.update, table.delete", () => {
  it("create écrit data/tables/<slug>.yaml relisible ET data/model.mmd dans le même lot", () => {
    const result = plan([op("table.create", "T-reservation", TABLE)]);
    expect(paths(result)).toEqual(["data/model.mmd", "data/tables/reservation.yaml"]);
    const path = "data/tables/reservation.yaml";
    const { spec, issues } = parseSpecFiles([
      MANIFEST,
      { path, content: contentOf(result, path) ?? "" },
    ]);
    expect(issues).toEqual([]);
    expect(spec.tables[0]?.value).toMatchObject({
      id: "T-reservation",
      nom: "Réservation",
      zone: "Rendez-vous",
      description: "Un rendez-vous.",
      source: ["F-001", "R-004"],
      relations: [{ vers: "T-client", cardinalite: "n → 1" }],
    });
    expect(spec.tables[0]?.value.champs).toEqual([
      { nom: "id", type: "uuid", cle: "primaire" },
      { nom: "client_id", type: "ref(T-client)" },
      { nom: "email", type: "texte(255)", regle: "R-004", donnees_personnelles: true },
      {
        nom: "statut",
        type: "enum",
        valeurs: ["confirmée", "annulée"],
        contraintes: "Obligatoire",
      },
    ]);
    const mermaid = contentOf(result, "data/model.mmd") ?? "";
    expect(mermaid).toContain("T_reservation {");
    expect(mermaid).toContain('T_reservation }o--|| T_client : "n → 1"');
    expect(mermaid).toContain("T_client {");
  });

  it("update garde le chemin, ne change que les champs présents et régénère model.mmd", () => {
    const result = plan([
      op("table.update", "T-client", { zone: "Comptes", description: "Les clients." }),
    ]);
    expect(paths(result)).toEqual(["data/model.mmd", "data/tables/client.yaml"]);
    const { spec } = parseSpecFiles([
      MANIFEST,
      {
        path: "data/tables/client.yaml",
        content: contentOf(result, "data/tables/client.yaml") ?? "",
      },
    ]);
    expect(spec.tables[0]?.value).toMatchObject({
      nom: "client",
      zone: "Comptes",
      description: "Les clients.",
      source: ["F-001"],
    });
  });

  it("clientSummary : create l'écrit en resume_client, update le remplace, une liste vide le retire (3.7.0)", () => {
    const summaryOf = (result: ReturnType<typeof plan>, path: string) =>
      (
        parseSpecFiles([MANIFEST, { path, content: contentOf(result, path) ?? "" }]).spec.tables[0]
          ?.value as { resume_client?: string[] } | undefined
      )?.resume_client;
    const created = plan([
      op("table.create", "T-reservation", { ...TABLE, clientSummary: ["Le nom du client"] }),
    ]);
    expect(summaryOf(created, "data/tables/reservation.yaml")).toEqual(["Le nom du client"]);
    const client = "data/tables/client.yaml";
    const update = (payload: Record<string, unknown>) =>
      summaryOf(plan([op("table.update", "T-client", payload)]), client);
    expect(update({ clientSummary: ["Une phrase", "Deux"] })).toEqual(["Une phrase", "Deux"]);
    expect(update({ clientSummary: [] })).toBeUndefined();
    expect(update({ zone: "Comptes" })).toBeUndefined();
  });

  it("update de fields remplace la liste ; une description vide la retire", () => {
    const result = plan([
      op("table.update", "T-client", { fields: [{ name: "id", type: "uuid" }], description: "" }),
    ]);
    const { spec } = parseSpecFiles([
      MANIFEST,
      {
        path: "data/tables/client.yaml",
        content: contentOf(result, "data/tables/client.yaml") ?? "",
      },
    ]);
    expect(spec.tables[0]?.value.champs).toEqual([{ nom: "id", type: "uuid" }]);
    expect(spec.tables[0]?.value.description).toBeUndefined();
  });

  it("delete supprime le fichier et régénère model.mmd", () => {
    const result = plan([op("table.delete", "T-client")]);
    expect(changes(result)).toContainEqual({ path: "data/tables/client.yaml", delete: true });
    expect(contentOf(result, "data/model.mmd")).not.toContain("T_client");
  });

  it("delete d'une table visée par une relation ou un champ ref : SPEC_INVALID, rien n'est écrit", () => {
    const files = [...BASE, tableFile("reservation", "T-client")];
    const result = plan([op("table.delete", "T-client")], files);
    expect(result).toMatchObject({
      outcome: { status: "failed", errorCode: "SPEC_INVALID", report: { ok: false } },
    });
    expect(changes(result)).toEqual([]);
  });

  it("conflits : create d'une table présente, update ou delete d'une table absente", () => {
    for (const operations of [
      [op("table.create", "T-client", { ...TABLE, name: "Client" })],
      [op("table.update", "T-absente", { zone: "x" })],
      [op("table.delete", "T-absente")],
    ]) {
      expect(plan(operations)).toMatchObject({
        outcome: { status: "conflict", errorCode: "write_conflict" },
      });
    }
  });

  it("références : source F-999, regle R-999 et ref(T-absente) refusés SPEC_INVALID", () => {
    for (const patch of [
      { sources: ["F-999"] },
      { fields: [{ name: "id", type: "uuid", rule: "R-999" }] },
      { fields: [{ name: "x_id", type: "ref(T-absente)" }] },
      { relations: [{ to: "T-absente", cardinality: "n → 1" }] },
    ]) {
      const result = plan([op("table.create", "T-reservation", { ...TABLE, ...patch })]);
      expect(result, JSON.stringify(patch)).toMatchObject({
        outcome: { status: "failed", errorCode: "SPEC_INVALID" },
      });
    }
  });

  it("une table et sa voisine du même lot : accepté", () => {
    const result = plan([
      op("table.create", "T-ville", {
        name: "Ville",
        zone: "Clients",
        fields: [{ name: "id", type: "uuid" }],
      }),
      op("table.create", "T-reservation", {
        ...TABLE,
        fields: [{ name: "ville_id", type: "ref(T-ville)" }],
        relations: [{ to: "T-ville", cardinality: "n → 1" }],
      }),
    ]);
    expect(changes(result).some((c) => c.path === "data/tables/ville.yaml")).toBe(true);
    expect(changes(result).filter((c) => c.path === "data/model.mmd")).toHaveLength(1);
  });

  it("un lot hors data/ ne touche pas model.mmd", () => {
    const result = plan([op("feature.create", "F-002", { title: "Nouvelle", priority: "must" })]);
    expect(paths(result).some((path) => path.startsWith("data/"))).toBe(false);
  });

  it("le designer ne touche pas aux tables : FORBIDDEN", () => {
    expect(plan([op("table.create", "T-reservation", TABLE)], BASE, "designer")).toMatchObject({
      outcome: { status: "failed", errorCode: "FORBIDDEN" },
    });
    expect(plan([op("table.delete", "T-client")], BASE, "designer")).toMatchObject({
      outcome: { status: "failed", errorCode: "FORBIDDEN" },
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("jeux d'exemple : fixture.create", () => {
  const FIXTURE = {
    title: "Clients",
    table: "T-client",
    rows: [{ id: "c-1" }, { id: "c-2" }],
  };

  it("écrit data/fixtures/FX-<slug>.yaml relisible, sans toucher model.mmd (contenu inchangé)", () => {
    const result = plan([op("fixture.create", "FX-clients", FIXTURE)]);
    expect(paths(result)).toEqual(["data/fixtures/FX-clients.yaml"]);
    const path = "data/fixtures/FX-clients.yaml";
    const { spec, issues } = parseSpecFiles([
      MANIFEST,
      { path, content: contentOf(result, path) ?? "" },
    ]);
    expect(issues).toEqual([]);
    expect(spec.fixtures[0]?.value).toEqual({
      id: "FX-clients",
      titre: "Clients",
      table: "T-client",
      locale: "fr-FR",
      lignes: [{ id: "c-1" }, { id: "c-2" }],
    });
  });

  it("conflit : un jeu du même nom existe déjà (write_conflict)", () => {
    const files = [
      ...BASE,
      {
        path: "data/fixtures/FX-clients.yaml",
        content: emitFixtureYaml({
          id: "FX-clients",
          titre: "Clients",
          table: "T-client",
          locale: "fr-FR",
          lignes: [],
        }),
      },
    ];
    expect(plan([op("fixture.create", "FX-clients", FIXTURE)], files)).toMatchObject({
      outcome: { status: "conflict", errorCode: "write_conflict" },
    });
  });

  it("table inconnue ou clé hors champs : SPEC_INVALID ; table du même lot : accepté", () => {
    expect(
      plan([op("fixture.create", "FX-clients", { ...FIXTURE, table: "T-absente" })]),
    ).toMatchObject({
      outcome: { status: "failed", errorCode: "SPEC_INVALID" },
    });
    expect(
      plan([op("fixture.create", "FX-clients", { ...FIXTURE, rows: [{ ville: "x" }] })]),
    ).toMatchObject({
      outcome: { status: "failed", errorCode: "SPEC_INVALID" },
    });
    const sameBatch = plan([
      op("table.create", "T-ville", {
        name: "Ville",
        zone: "Clients",
        fields: [{ name: "nom", type: "texte(40)" }],
      }),
      op("fixture.create", "FX-villes", {
        title: "Villes",
        table: "T-ville",
        rows: [{ nom: "Lyon" }],
      }),
    ]);
    expect(sameBatch).toHaveProperty("changes");
  });

  it("e-mail réel refusé : SPEC_INVALID ; e-mail à domaine réservé accepté", () => {
    const withEmail = (email: string) => ({
      ...FIXTURE,
      rows: [{ id: email }],
    });
    expect(plan([op("fixture.create", "FX-clients", withEmail("jean@societe.fr"))])).toMatchObject({
      outcome: { status: "failed", errorCode: "SPEC_INVALID" },
    });
    expect(plan([op("fixture.create", "FX-clients", withEmail("jean@exemple.fr"))])).toHaveProperty(
      "changes",
    );
  });

  it("le designer ne crée pas de jeu : FORBIDDEN", () => {
    expect(plan([op("fixture.create", "FX-clients", FIXTURE)], BASE, "designer")).toMatchObject({
      outcome: { status: "failed", errorCode: "FORBIDDEN" },
    });
  });
});

describe("intégrité des opérations de données", () => {
  const batch = (operations: BatchOperation[]) => ({
    branch: "cadrage",
    repo: { specPath: null },
    operations,
  });
  const check = (operations: BatchOperation[]) =>
    integrityProblem(batch(operations) as unknown as Parameters<typeof integrityProblem>[0]);

  it("les quatre genres sont connus ; l'identifiant visé doit être T-<slug> ou FX-<slug>", () => {
    expect(check([op("table.create", "T-reservation")])).toBeUndefined();
    expect(check([op("table.update", "T-reservation")])).toBeUndefined();
    expect(check([op("table.delete", "T-reservation")])).toBeUndefined();
    expect(check([op("fixture.create", "FX-clients")])).toBeUndefined();
    expect(check([op("table.update", "reservation")])).toBe("specId");
    expect(check([op("table.update", "T-../x")])).toBe("specId");
    expect(check([op("fixture.create", "T-clients")])).toBe("specId");
  });
});
