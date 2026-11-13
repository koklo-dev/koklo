import { describe, expect, it } from "vitest";
import {
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
