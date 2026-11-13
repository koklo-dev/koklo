import { describe, expect, it } from "vitest";
import {
  fixturesProposalSchema,
  jsonSchemaOf,
  PROPOSAL_SCHEMAS,
  relationsProposalSchema,
  tableProposalSchema,
} from "../src/index.ts";

/** TK-107 lot B (B387) : charges des propositions `table`, `relations`, `fixtures` (sortie du modèle = donnée hostile). */
const TABLE = {
  name: "Réservation",
  description: "Une réservation de salle.",
  sources: ["F-001", "R-004"],
  clientSummary: ["Le nom du client", "La date de la réservation"],
  fields: [
    { name: "id", type: "uuid", primaryKey: true },
    { name: "statut", type: "enum", values: ["en_attente", "confirmee"] },
    { name: "salle_id", type: "ref(T-salle)", constraints: "obligatoire" },
    { name: "email", type: "texte(120)", personalData: true, rule: "R-004" },
  ],
};
const RELATIONS = {
  relations: [{ from: "T-reservation", to: "T-salle", cardinality: "n → 1" }],
};
const FIXTURES = {
  title: "Réservations de démonstration",
  table: "T-reservation",
  rows: [{ id: "1", statut: "confirmee", email: "a@exemple.fr" }],
};

describe("tableProposalSchema", () => {
  it("accepte une table complète, chaque type du vocabulaire fermé", () => {
    expect(tableProposalSchema.safeParse(TABLE).success).toBe(true);
    for (const type of [
      "uuid",
      "texte(40)",
      "entier",
      "decimal",
      "booleen",
      "horodatage",
      "date",
      "json",
    ]) {
      const fields = [{ name: "x", type }];
      expect(tableProposalSchema.safeParse({ name: "T", fields }).success, type).toBe(true);
    }
  });

  it("refuse un type hors vocabulaire, un enum sans valeurs, un champ inconnu, aucun champ", () => {
    const bad = (fields: unknown) => tableProposalSchema.safeParse({ name: "T", fields }).success;
    expect(bad([{ name: "x", type: "varchar" }])).toBe(false);
    expect(bad([{ name: "x", type: "enum" }])).toBe(false);
    expect(bad([{ name: "x", type: "entier", extra: 1 }])).toBe(false);
    expect(bad([])).toBe(false);
    expect(tableProposalSchema.safeParse({ ...TABLE, id: "T-x" }).success).toBe(false);
  });

  it("texte brut : lien, balise ou saut de ligne dans un nom refusés", () => {
    expect(tableProposalSchema.safeParse({ ...TABLE, name: "voir https://x.fr" }).success).toBe(
      false,
    );
    expect(tableProposalSchema.safeParse({ ...TABLE, name: "<b>x</b>" }).success).toBe(false);
    expect(tableProposalSchema.safeParse({ ...TABLE, name: "a\nb" }).success).toBe(false);
    expect(tableProposalSchema.safeParse({ ...TABLE, sources: ["X-1"] }).success).toBe(false);
  });
});

describe("tableProposalSchema : clientSummary", () => {
  it("12 phrases simples au plus, sans lien ni balise ni saut de ligne", () => {
    const parse = (clientSummary: string[]) =>
      tableProposalSchema.safeParse({ ...TABLE, clientSummary }).success;
    expect(parse(["Le nom du client"])).toBe(true);
    expect(parse(Array.from({ length: 13 }, (_, i) => `Phrase ${i}`))).toBe(false);
    expect(parse([""])).toBe(false);
    expect(parse(["voir https://x.fr"])).toBe(false);
    expect(parse(["a\nb"])).toBe(false);
  });
});

describe("relationsProposalSchema", () => {
  it("accepte des relations entre identifiants de table avec une cardinalité du vocabulaire", () => {
    expect(relationsProposalSchema.safeParse(RELATIONS).success).toBe(true);
    for (const cardinality of ["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"]) {
      const relations = [{ from: "T-a", to: "T-b", cardinality }];
      expect(relationsProposalSchema.safeParse({ relations }).success, cardinality).toBe(true);
    }
  });

  it("refuse une cardinalité inconnue, un identifiant qui n'est pas une table, une liste vide", () => {
    const parse = (relations: unknown) => relationsProposalSchema.safeParse({ relations }).success;
    expect(parse([{ from: "T-a", to: "T-b", cardinality: "1 - n" }])).toBe(false);
    expect(parse([{ from: "F-001", to: "T-b", cardinality: "1 → n" }])).toBe(false);
    expect(parse([])).toBe(false);
  });
});

describe("fixturesProposalSchema", () => {
  it("accepte un jeu fictif d'une table", () => {
    expect(fixturesProposalSchema.safeParse(FIXTURES).success).toBe(true);
  });

  it("refuse un e-mail hors domaine réservé, plus de 200 lignes, une table qui n'en est pas une", () => {
    const rows = [{ email: "vrai@gmail.com" }];
    expect(fixturesProposalSchema.safeParse({ ...FIXTURES, rows }).success).toBe(false);
    const many = Array.from({ length: 201 }, () => ({ id: "1" }));
    expect(fixturesProposalSchema.safeParse({ ...FIXTURES, rows: many }).success).toBe(false);
    expect(fixturesProposalSchema.safeParse({ ...FIXTURES, table: "F-001" }).success).toBe(false);
    expect(
      fixturesProposalSchema.safeParse({ ...FIXTURES, rows: [{ note: "http://x.fr" }] }).success,
    ).toBe(false);
  });
});

describe("vocabulaire des types de proposition", () => {
  it("PROPOSAL_SCHEMAS porte les trois types, convertibles en schéma JSON strict", () => {
    for (const kind of ["table", "relations", "fixtures"] as const) {
      expect(jsonSchemaOf(PROPOSAL_SCHEMAS[kind])).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });
});
