import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  checkSpec,
  emitFixtureYaml,
  FixtureSchema,
  fixtureId,
  jsonSchemas,
  kindOf,
  parseSpecFiles,
  TableV2Schema,
} from "../src/index.ts";
import { codes } from "./helpers.ts";

/**
 * TK-107 lot A (B383) : schéma des jeux d'exemple `data/fixtures/FX-<slug>.yaml` et des tables v2
 * (types, énumérations, cardinalités, identifiant `T-<slug>`).
 */
const FIXTURE = {
  id: "FX-clients",
  titre: "Clients",
  table: "T-client",
  lignes: [{ nom: "Léa Martin", email: "lea.martin@exemple.fr" }],
};

describe("FixtureSchema", () => {
  it("accepte un jeu valide ; la locale vaut fr-FR par défaut", () => {
    const parsed = FixtureSchema.parse(FIXTURE);
    expect(parsed.locale).toBe("fr-FR");
    expect(parsed.lignes).toHaveLength(1);
  });

  it("l'identifiant est FX-<slug>", () => {
    expect(fixtureId.safeParse("FX-clients").success).toBe(true);
    expect(fixtureId.safeParse("FX-Clients").success).toBe(false);
    expect(fixtureId.safeParse("clients").success).toBe(false);
  });

  it.each(["lea@exemple.fr", "x@exemple.com", "x@example.com", "x@example.org", "x@example.net"])(
    "e-mail à domaine réservé accepté : %s",
    (email) => {
      expect(FixtureSchema.safeParse({ ...FIXTURE, lignes: [{ email }] }).success).toBe(true);
    },
  );

  it.each(["lea@gmail.com", "contact : jean@societe.fr", "x@exemple.fr.evil.com"])(
    "e-mail hors domaine réservé refusé : %s",
    (email) => {
      const result = FixtureSchema.safeParse({ ...FIXTURE, lignes: [{ champ: email }] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(["lignes", 0, "champ"]);
        expect(result.error.issues[0]?.message).toContain("domaine réservé");
      }
    },
  );

  it("une clé de ligne n'est pas un nom de champ : refusée", () => {
    expect(FixtureSchema.safeParse({ ...FIXTURE, lignes: [{ "Nom Client": "x" }] }).success).toBe(
      false,
    );
  });

  it("valeurs scalaires seulement (texte, nombre, booléen)", () => {
    expect(
      FixtureSchema.safeParse({ ...FIXTURE, lignes: [{ a: "x", b: 1, c: true }] }).success,
    ).toBe(true);
    expect(FixtureSchema.safeParse({ ...FIXTURE, lignes: [{ a: { b: 1 } }] }).success).toBe(false);
    expect(FixtureSchema.safeParse({ ...FIXTURE, lignes: [{ a: [1] }] }).success).toBe(false);
  });

  it("200 lignes au plus", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ n: i }));
    expect(FixtureSchema.safeParse({ ...FIXTURE, lignes: rows(200) }).success).toBe(true);
    expect(FixtureSchema.safeParse({ ...FIXTURE, lignes: rows(201) }).success).toBe(false);
  });

  it("objet fermé : champ inconnu refusé", () => {
    expect(FixtureSchema.safeParse({ ...FIXTURE, extra: 1 }).success).toBe(false);
  });

  it("JSON Schema `fixture` exposé, $id stable", () => {
    const schema = jsonSchemas.fixture as { $id?: string; additionalProperties?: unknown };
    expect(schema.$id).toBe("https://koklo.dev/schemas/spec/v1/fixture.schema.json");
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("fichier de jeu d'exemple", () => {
  const yaml = (id: string) =>
    `id: ${id}\ntitre: Clients\ntable: T-client\nlignes:\n  - { nom: Léa }\n`;

  it("kindOf reconnaît data/fixtures/FX-<slug>.yaml", () => {
    expect(kindOf("data/fixtures/FX-clients.yaml")).toBe("fixture");
    expect(kindOf("data/fixtures/clients.yaml")).toBeUndefined();
  });

  it("parseSpecFiles range le jeu dans spec.fixtures", () => {
    const { spec, issues } = parseSpecFiles([
      { path: "data/fixtures/FX-clients.yaml", content: yaml("FX-clients") },
    ]);
    expect(issues).toEqual([]);
    expect(spec.fixtures.map((f) => f.value.id)).toEqual(["FX-clients"]);
  });

  it("identifiant en désaccord avec le nom : STRUCT_ID_MISMATCH", () => {
    const { issues } = parseSpecFiles([
      { path: "data/fixtures/FX-clients.yaml", content: yaml("FX-autre") },
    ]);
    expect(codes(issues)).toEqual(["STRUCT_ID_MISMATCH"]);
  });

  it("e-mail hors domaine réservé : STRUCT_SCHEMA_VIOLATION", () => {
    const content = `id: FX-clients\ntitre: C\ntable: T-client\nlignes:\n  - { email: a@gmail.com }\n`;
    const { issues } = parseSpecFiles([{ path: "data/fixtures/FX-clients.yaml", content }]);
    expect(codes(issues)).toEqual(["STRUCT_SCHEMA_VIOLATION"]);
  });
});

describe("TableV2Schema", () => {
  const table = (champs: unknown[], extra: Record<string, unknown> = {}) => ({
    id: "T-reservation",
    nom: "Réservation",
    champs,
    ...extra,
  });

  it.each([
    "uuid",
    "texte(120)",
    "entier",
    "decimal",
    "booleen",
    "horodatage",
    "date",
    "json",
    "ref(T-client)",
  ])("type %s valide", (type) => {
    expect(TableV2Schema.safeParse(table([{ nom: "c", type }])).success).toBe(true);
  });

  it("enum exige `valeurs`", () => {
    expect(TableV2Schema.safeParse(table([{ nom: "s", type: "enum" }])).success).toBe(false);
    expect(
      TableV2Schema.safeParse(table([{ nom: "s", type: "enum", valeurs: ["a", "b"] }])).success,
    ).toBe(true);
  });

  it("type inconnu refusé", () => {
    expect(TableV2Schema.safeParse(table([{ nom: "c", type: "varchar" }])).success).toBe(false);
  });

  it.each(["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"])("cardinalité %s", (cardinalite) => {
    const relations = [{ vers: "T-client", cardinalite }];
    expect(TableV2Schema.safeParse(table([], { relations })).success).toBe(true);
  });

  it("cardinalité inconnue refusée", () => {
    const relations = [{ vers: "T-client", cardinalite: "1-n" }];
    expect(TableV2Schema.safeParse(table([], { relations })).success).toBe(false);
  });

  it("T-<slug> dans <slug>.yaml ; un fichier hors format est signalé", () => {
    const content = "id: T-reservation\nnom: R\nchamps: []\n";
    const manifest = {
      path: "koklo.project.yaml",
      content: "projet: p\norganisation: o\nspec_version: 2\n",
    };
    const ok = parseSpecFiles([manifest, { path: "data/tables/reservation.yaml", content }]);
    expect(ok.spec.tables.map((t) => t.value.id)).toEqual(["T-reservation"]);
    const bad = parseSpecFiles([{ path: "data/tables/Reservation Finale.yaml", content }]);
    expect(codes(bad.issues)).toEqual(["STRUCT_UNKNOWN_TABLE_FILE"]);
  });
});

/** TK-110 lot A (B485) : bloc facultatif `generation`, lignes stockées d'abord, générées ensuite. */
describe("FixtureSchema, bloc generation", () => {
  const GENERATION = {
    graine: 1240,
    total: 1240,
    regles: {
      id: { type: "sequence", prefixe: "RDV-", debut: 1 },
      statut: { type: "choix", valeurs: ["a", "b"] },
      age: { type: "entier", min: 18, max: 90 },
      jour: { type: "date", debut: "2026-01-01", jours: 365 },
      nom: { type: "nom" },
      email: { type: "email" },
    },
  };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ n: i }));

  it("accepte un jeu généré ; les six règles fermées sont reconnues", () => {
    const parsed = FixtureSchema.safeParse({ ...FIXTURE, lignes: rows(3), generation: GENERATION });
    expect(parsed.success).toBe(true);
  });

  it("generation facultatif : un jeu sans bloc reste valide", () => {
    expect(FixtureSchema.parse(FIXTURE).generation).toBeUndefined();
  });

  it("avec generation, 50 lignes stockées au plus ; sans, 200", () => {
    expect(
      FixtureSchema.safeParse({ ...FIXTURE, lignes: rows(50), generation: GENERATION }).success,
    ).toBe(true);
    const tooMany = FixtureSchema.safeParse({
      ...FIXTURE,
      lignes: rows(51),
      generation: GENERATION,
    });
    expect(tooMany.success).toBe(false);
    if (!tooMany.success) expect(tooMany.error.issues[0]?.path).toEqual(["lignes"]);
  });

  it.each([0, 100001, 1.5])("total hors bornes refusé : %s", (total) => {
    expect(
      FixtureSchema.safeParse({ ...FIXTURE, generation: { ...GENERATION, total } }).success,
    ).toBe(false);
  });

  it("total 1 et 100 000 acceptés", () => {
    for (const total of [1, 100000]) {
      expect(
        FixtureSchema.safeParse({ ...FIXTURE, lignes: [], generation: { ...GENERATION, total } })
          .success,
      ).toBe(true);
    }
  });

  it("le total ne peut pas être inférieur aux lignes stockées", () => {
    const result = FixtureSchema.safeParse({
      ...FIXTURE,
      lignes: rows(5),
      generation: { ...GENERATION, total: 4 },
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["règle inconnue", { x: { type: "uuid" } }],
    ["choix vide", { x: { type: "choix", valeurs: [] } }],
    ["choix de 51 valeurs", { x: { type: "choix", valeurs: Array.from({ length: 51 }, String) } }],
    ["entier sans max", { x: { type: "entier", min: 1 } }],
    ["date mal formée", { x: { type: "date", debut: "01/01/2026", jours: 3 } }],
    ["clé en trop", { x: { type: "nom", extra: 1 } }],
    ["nom de champ invalide", { "Nom Client": { type: "nom" } }],
  ])("règle refusée : %s", (_label, regles) => {
    expect(
      FixtureSchema.safeParse({ ...FIXTURE, generation: { ...GENERATION, regles } }).success,
    ).toBe(false);
  });

  it("graine négative ou décimale refusée", () => {
    for (const graine of [-1, 1.5]) {
      expect(
        FixtureSchema.safeParse({ ...FIXTURE, generation: { ...GENERATION, graine } }).success,
      ).toBe(false);
    }
  });

  it("R4 : une clé de regles hors table est refusée avec son chemin", () => {
    const table = `id: T-client\nchamps:\n  - { nom: nom, type: text, nullable: false, unique: false }\n`;
    const fixture = `id: FX-clients\ntitre: C\ntable: T-client\nlignes: []\ngeneration:\n  graine: 1\n  total: 10\n  regles:\n    inconnu: { type: nom }\n`;
    const { issues } = checkSpec([
      { path: "data/tables/T-client.yaml", content: table },
      { path: "data/fixtures/FX-clients.yaml", content: fixture },
    ]);
    expect(issues.map((issue) => [issue.code, issue.pointer])).toContainEqual([
      "R4_UNKNOWN_FIELD",
      "/generation/regles/inconnu",
    ]);
  });

  it("emitFixtureYaml écrit generation après lignes et relit le même jeu", () => {
    const fixture = FixtureSchema.parse({ ...FIXTURE, generation: GENERATION });
    const text = emitFixtureYaml(fixture);
    expect(text.indexOf("lignes:")).toBeLessThan(text.indexOf("generation:"));
    expect(text).toContain("graine: 1240");
    expect(FixtureSchema.parse(parse(text))).toEqual(fixture);
  });

  it("le JSON Schema expose generation", () => {
    const schema = jsonSchemas.fixture as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {})).toContain("generation");
  });
});
