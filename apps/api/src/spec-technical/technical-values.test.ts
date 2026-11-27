import { describe, expect, it } from "vitest";
import {
  environmentsContent,
  stackSource,
  stackSummary,
  technicalCounts,
} from "./technical-values.ts";

/**
 * TK-115 lot B : lecture tolérante de l'index d'entités du cahier technique (formes du worker, en français) vers le
 * contrat (en anglais). Rien n'est supposé : un champ absent reprend sa valeur neutre ; aucune valeur de variable ne sort.
 */
describe("stackSummary", () => {
  it("traduit couche et statut, écarte les références mal formées", () => {
    const summary = stackSummary("ST-db", "tech/stack/db.yaml", {
      id: "ST-db",
      couche: "donnees",
      icone: "database",
      role: "Base",
      statut: "choisi",
      choix: "PostgreSQL",
      composants: ["C-db", "n'importe quoi"],
      options: ["PostgreSQL", "MySQL"],
      criteres: [{ nom: "Gérée", valeurs: ["Oui", "Oui"] }],
      pourquoi: "Fiable.",
      exigences: ["NFR-001", "x"],
      decisions: ["ADR-001", 3],
    });
    expect(summary).toEqual({
      specId: "ST-db",
      role: "Base",
      layer: "data",
      icon: "database",
      status: "chosen",
      choice: "PostgreSQL",
      components: ["C-db"],
      options: ["PostgreSQL", "MySQL"],
      criteria: [{ label: "Gérée", values: ["Oui", "Oui"] }],
      why: "Fiable.",
      requirements: ["NFR-001"],
      decisions: ["ADR-001"],
      filePath: "tech/stack/db.yaml",
    });
  });

  it("données vides : valeurs neutres", () => {
    expect(stackSummary("ST-x", "p", null)).toMatchObject({
      role: "ST-x",
      layer: "operations",
      status: "open",
      options: [],
      criteria: [],
      why: "",
    });
  });
});

describe("environmentsContent", () => {
  it("ignore une entrée sans identifiant d'environnement et toute clé de valeur", () => {
    const content = environmentsContent({
      environnements: [{ id: "ENV-a", nom: "A", donnees: "reelles" }, { nom: "sans id" }],
      variables: [{ nom: "A", usage: "u", valeur: "jamais" }],
      integrations: [{ service: "S", usage: "u", statut: "connecte" }],
    });
    expect(content.environments).toEqual([
      {
        specId: "ENV-a",
        name: "A",
        address: "",
        hosting: "",
        database: "",
        data: "real",
        extras: [],
      },
    ]);
    expect(content.variables).toEqual([{ name: "A", usage: "u" }]);
    expect(content.integrations).toEqual([{ service: "S", usage: "u", status: "connected" }]);
  });
});

describe("stackSource et technicalCounts", () => {
  it("YAML généré sans la clé d'index « titre »", () => {
    const text = stackSource({
      id: "ST-a",
      titre: "A : à trancher",
      couche: "services",
      role: "A",
      statut: "a_trancher",
      options: ["x", "y"],
      pourquoi: "p",
    });
    expect(text).toContain("id: ST-a");
    expect(text).not.toContain("titre");
    expect(stackSource({ nom: "illisible" })).toBe("");
  });

  it("compte les environnements du fichier et les opérations, au moins les endpoints REST", () => {
    expect(
      technicalCounts({
        stack: 3,
        endpoint: 2,
        nfr: 1,
        restEndpoints: 5,
        environments: { environnements: [{}, {}] },
      }),
    ).toEqual({ stack: 3, endpoints: 5, nfr: 1, environments: 2 });
  });
});
