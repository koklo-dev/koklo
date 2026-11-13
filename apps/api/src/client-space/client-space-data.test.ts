import { describe, expect, it } from "vitest";
import { clientFixtureOf, clientTableOf } from "./client-space-data.ts";

/**
 * TK-109 : lecture client d'une table. Seuls nom, type, clé et donnée personnelle des champs sortent ; contraintes, valeurs,
 * règles, sources brutes, chemin et résumé technique restent côté équipe. Lecture tolérante.
 */
const DATA = {
  id: "T-client",
  nom: "Client",
  zone: "Comptes",
  description: "Une personne qui réserve.",
  resume_client: ["Le nom du client", "Son adresse e-mail"],
  source: ["F-001", "R-004", "F-009"],
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    {
      nom: "email",
      type: "texte(255)",
      contraintes: "Unique",
      valeurs: ["a"],
      regle: "R-004",
      donnees_personnelles: true,
    },
  ],
  relations: [
    { vers: "T-reservation", cardinalite: "1 → n" },
    { vers: "T-fantome", cardinalite: "n → 1" },
  ],
};
const LABELS = new Map([
  ["F-001", "Connexion"],
  ["R-004", "Délai d'annulation"],
]);
const NAMES = new Map([["T-reservation", "Réservation"]]);

describe("clientTableOf", () => {
  it("vocabulaire client : champs réduits, liens libellés, relations nommées, résumé repris", () => {
    expect(clientTableOf({ specId: "T-client", data: DATA }, LABELS, NAMES)).toEqual({
      id: "T-client",
      name: "Client",
      zone: "Comptes",
      description: "Une personne qui réserve.",
      fields: [
        { name: "id", type: "uuid", primaryKey: true, personalData: false },
        { name: "email", type: "texte(255)", primaryKey: false, personalData: true },
      ],
      relations: [
        { to: "T-reservation", toName: "Réservation", cardinality: "1 → n" },
        { to: "T-fantome", toName: "T-fantome", cardinality: "n → 1" },
      ],
      usedBy: [
        { id: "F-001", label: "Connexion" },
        { id: "R-004", label: "Délai d'annulation" },
      ],
      clientSummary: ["Le nom du client", "Son adresse e-mail"],
    });
  });

  it("donnée absente ou d'un autre type : valeurs neutres, jamais d'exception", () => {
    expect(
      clientTableOf({ specId: "T-x", data: { champs: "oui", source: 3 } }, LABELS, NAMES),
    ).toEqual({
      id: "T-x",
      name: "T-x",
      description: "",
      fields: [],
      relations: [],
      usedBy: [],
      clientSummary: [],
    });
    expect(clientTableOf({ specId: "T-y", data: null }, LABELS, NAMES).name).toBe("T-y");
  });
});

describe("clientFixtureOf", () => {
  it("jeu : titre, table, langue et nombre de lignes, sans chemin", () => {
    expect(
      clientFixtureOf({
        specId: "FX-clients",
        path: "data/fixtures/FX-clients.yaml",
        data: { titre: "Clients", table: "T-client", lignes: [{ a: 1 }, { a: 2 }] },
      }),
    ).toEqual({
      specId: "FX-clients",
      title: "Clients",
      table: "T-client",
      locale: "fr-FR",
      rowCount: 2,
    });
  });
});
