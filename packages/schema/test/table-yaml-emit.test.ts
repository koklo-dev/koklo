import { describe, expect, it } from "vitest";
import {
  EmitFixtureError,
  EmitTableError,
  emitFixtureYaml,
  emitTableYaml,
  type Fixture,
  parseSpecFiles,
  type TableV2,
} from "../src/index.ts";

/** TK-107 lot A : émission YAML canonique des tables et des jeux (aller-retour, ordre des clés fixe, refus à l'émission). */
const table: TableV2 = {
  id: "T-reservation",
  nom: "Réservation",
  description: "Un rendez-vous pris par un client.",
  source: ["F-001", "R-004"],
  zone: "Rendez-vous",
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    { nom: "statut", type: "enum", valeurs: ["confirmée", "annulée"], contraintes: "Obligatoire" },
    { nom: "email", type: "texte(255)", donnees_personnelles: true, regle: "R-004" },
    { nom: "client_id", type: "ref(T-client)" },
  ],
  relations: [{ vers: "T-client", cardinalite: "n → 1" }],
};
const fixture: Fixture = {
  id: "FX-clients",
  titre: "Clients",
  table: "T-client",
  locale: "fr-FR",
  lignes: [{ nom: "Léa", actif: true, age: 31 }],
};

describe("emitTableYaml", () => {
  it("aller-retour : parseSpecFiles(emit(t)) rend t", () => {
    const content = emitTableYaml(table);
    const { spec, issues } = parseSpecFiles([
      { path: "koklo.project.yaml", content: "projet: p\norganisation: o\nspec_version: 2\n" },
      { path: "data/tables/reservation.yaml", content },
    ]);
    expect(issues).toEqual([]);
    expect(spec.tables[0]?.value).toEqual(table);
  });

  it("idempotent et clés dans un ordre fixe", () => {
    const content = emitTableYaml(table);
    expect(emitTableYaml(table)).toBe(content);
    const order = ["id:", "nom:", "description:", "source:", "zone:", "champs:", "relations:"];
    const positions = order.map((key) => content.indexOf(`\n${key}`) + (key === "id:" ? 1 : 0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("table invalide : EmitTableError avec pointeur", () => {
    const bad = { ...table, champs: [{ nom: "s", type: "enum" }] } as unknown as TableV2;
    expect(() => emitTableYaml(bad)).toThrow(EmitTableError);
    try {
      emitTableYaml(bad);
    } catch (error) {
      expect((error as EmitTableError).path).toBe("/champs/0/valeurs");
    }
  });
});

describe("emitFixtureYaml", () => {
  it("aller-retour", () => {
    const content = emitFixtureYaml(fixture);
    const { spec, issues } = parseSpecFiles([{ path: "data/fixtures/FX-clients.yaml", content }]);
    expect(issues).toEqual([]);
    expect(spec.fixtures[0]?.value).toEqual(fixture);
    expect(emitFixtureYaml(fixture)).toBe(content);
  });

  it("e-mail réel refusé à l'émission : EmitFixtureError", () => {
    const bad: Fixture = { ...fixture, lignes: [{ email: "a@gmail.com" }] };
    expect(() => emitFixtureYaml(bad)).toThrow(EmitFixtureError);
  });
});

describe("parseTableFile", () => {
  it("lit une table v2 émise ; un contenu invalide rend des issues sans lever", async () => {
    const { parseTableFile } = await import("../src/index.ts");
    const ok = parseTableFile("data/tables/reservation.yaml", emitTableYaml(table));
    expect(ok).toEqual({ ok: true, value: table });
    const bad = parseTableFile("data/tables/x.yaml", "id: T-x\nchamps: 3\n");
    expect(bad.ok).toBe(false);
  });
});
