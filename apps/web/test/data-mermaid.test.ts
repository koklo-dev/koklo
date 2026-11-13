import { describe, expect, it } from "vitest";
import { proposedTableOf } from "../src/lib/data-diagram.ts";
import { diagramOf, parseModelMermaid } from "../src/lib/data-mermaid.ts";

/** TK-107 lot C : lecture du `data/model.mmd` (B384) et cartes du diagramme minimal. */
const MODEL = `%% Généré par koklo depuis data/tables : ne pas modifier à la main.
erDiagram
  T_client {
    uuid id PK
    string nom
    int points
  }
  T_reservation {
    uuid id PK
    uuid client_id FK
    timestamp debut
    enum statut
  }
  T_reservation }o--|| T_client : "n → 1"
`;

describe("parseModelMermaid", () => {
  it("rend une table par entité, l'identifiant T-<slug> et ses champs", () => {
    const tables = parseModelMermaid(MODEL);
    expect(tables.map((t) => t.id)).toEqual(["T-client", "T-reservation"]);
    expect(tables[1]?.fields).toEqual([
      { name: "id", type: "uuid", kind: "primary" },
      { name: "client_id", type: "uuid", kind: "reference" },
      { name: "debut", type: "horodatage", kind: "plain" },
      { name: "statut", type: "enum", kind: "plain" },
    ]);
  });

  it("remet les types Mermaid dans le vocabulaire de la spec", () => {
    const [client] = parseModelMermaid(MODEL);
    expect(client?.fields.map((f) => f.type)).toEqual(["uuid", "texte", "entier"]);
  });

  it("ignore les relations, les commentaires et un texte vide", () => {
    expect(parseModelMermaid("")).toEqual([]);
    expect(parseModelMermaid("erDiagram\n")).toEqual([]);
  });

  it("un identifiant à tirets est rétabli (T_liste_attente -> T-liste-attente)", () => {
    expect(parseModelMermaid("erDiagram\n  T_liste_attente {\n    uuid id PK\n  }\n")[0]?.id).toBe(
      "T-liste-attente",
    );
  });
});

describe("diagramOf", () => {
  const names = new Map([["T-client", "Client"]]);

  it("nomme les cartes d'après la liste des tables, sinon d'après l'identifiant", () => {
    const cards = diagramOf(parseModelMermaid(MODEL), names, []);
    expect(cards.map((c) => c.name)).toEqual(["Client", "reservation"]);
    expect(cards.every((c) => c.state === undefined)).toBe(true);
  });

  it("ajoute les tables proposées (à relire en pointillés, rejetées estompées, acceptées pleines), sans doublon avec le modèle", () => {
    const proposed = [
      proposedTableOf(
        { name: "Avis", fields: [{ name: "id", type: "uuid", primaryKey: true }] },
        "pending",
      ),
      proposedTableOf({ name: "Client", fields: [{ name: "id", type: "uuid" }] }, "pending"),
      proposedTableOf({ name: "Facture", fields: [{ name: "id", type: "uuid" }] }, "rejected"),
      proposedTableOf({ name: "Option", fields: [{ name: "id", type: "uuid" }] }, "accepted"),
    ];
    const cards = diagramOf(parseModelMermaid(MODEL), names, proposed);
    expect(cards.map((c) => [c.id, c.state])).toEqual([
      ["T-client", undefined],
      ["T-reservation", undefined],
      ["T-avis", "review"],
      ["T-facture", "rejected"],
      ["T-option", undefined],
    ]);
  });

  it("une proposition garde ses types, clés et données personnelles", () => {
    const card = proposedTableOf(
      {
        name: "Avis",
        fields: [
          { name: "id", type: "uuid", primaryKey: true },
          { name: "client_id", type: "ref(T-client)" },
          { name: "email", type: "texte(120)", personalData: true },
          { name: "note", type: "entier" },
        ],
      },
      "pending",
    );
    expect(card.fields.map((f) => f.kind)).toEqual(["primary", "reference", "personal", "plain"]);
    expect(card.fields[1]?.type).toBe("ref(T-client)");
  });
});
