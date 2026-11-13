import { describe, expect, it } from "vitest";
import { proposedTableOf, relationsOf } from "../src/lib/data-diagram.ts";
import { diagramOf, parseModelMermaid, parseModelRelations } from "../src/lib/data-mermaid.ts";

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

describe("parseModelRelations (TK-108)", () => {
  it("lit chaque relation : source, cible et cardinalité entre guillemets", () => {
    const text = `${MODEL}  T_client ||--o{ T_service : "1 → n"\n  T_service }o--o{ T_client : "n ↔ n"\n`;
    expect(parseModelRelations(text)).toEqual([
      { id: "r0", from: "T-reservation", to: "T-client", cardinality: "n → 1" },
      { id: "r1", from: "T-client", to: "T-service", cardinality: "1 → n" },
      { id: "r2", from: "T-service", to: "T-client", cardinality: "n ↔ n" },
    ]);
  });

  it("ignore les entités, les attributs et les commentaires", () => {
    expect(
      parseModelRelations('%% T_a }o--|| T_b : "n → 1"\nerDiagram\n  T_a {\n    uuid id PK\n  }\n'),
    ).toEqual([]);
  });
});

describe("relationsOf (TK-108)", () => {
  const cards = [
    { id: "T-client", name: "Client", fields: [] },
    { id: "T-reservation", name: "Réservation", fields: [] },
    { id: "T-avis", name: "Avis", fields: [], state: "review" as const },
    { id: "T-facture", name: "Facture", fields: [], state: "rejected" as const },
  ];

  it("trait étiqueté de la cardinalité, en pointillés pour n ↔ n, sans extrémité inconnue", () => {
    const links = [
      { id: "r0", from: "T-reservation", to: "T-client", cardinality: "n → 1" },
      { id: "r1", from: "T-client", to: "T-reservation", cardinality: "n ↔ n" },
      { id: "r2", from: "T-client", to: "T-absente", cardinality: "1 → n" },
    ];
    expect(relationsOf(links, cards)).toEqual([
      { id: "r0", from: "T-reservation", to: "T-client", label: "n → 1", dashed: false },
      { id: "r1", from: "T-client", to: "T-reservation", label: "n ↔ n", dashed: true },
    ]);
  });

  it("les relations d'une table proposée s'ajoutent, celles d'une table rejetée sont retirées", () => {
    const withRelations = cards.map((card) =>
      card.id === "T-avis"
        ? { ...card, relations: [{ to: "T-client", cardinality: "n → 1" }] }
        : card.id === "T-facture"
          ? { ...card, relations: [{ to: "T-client", cardinality: "n → 1" }] }
          : card,
    );
    const links = [{ id: "r0", from: "T-client", to: "T-facture", cardinality: "1 → n" }];
    expect(relationsOf(links, withRelations)).toEqual([
      { id: "T-avis>T-client>0", from: "T-avis", to: "T-client", label: "n → 1", dashed: false },
    ]);
  });
});

/** B476, B478 : relations des clés étrangères d'une table proposée, zones des cartes. */
describe("proposedTableOf et diagramOf, clés et zones", () => {
  it("une clé ref(T-…) sans relation déclarée devient une relation n → 1, sans doublon ni boucle", () => {
    const card = proposedTableOf(
      {
        name: "Tache",
        zone: "Tâches",
        fields: [
          { name: "id", type: "uuid", primaryKey: true },
          { name: "client_id", type: "ref(T-client)" },
          { name: "autre_id", type: "ref(T-client)" },
          { name: "parent_id", type: "ref(T-tache)" },
          { name: "service_id", type: "ref(T-service)" },
        ],
        relations: [{ to: "T-service", cardinality: "1 → 1" }],
      },
      "pending",
    );
    expect(card.zone).toBe("Tâches");
    expect(card.relations).toEqual([
      { to: "T-service", cardinality: "1 → 1" },
      { to: "T-client", cardinality: "n → 1" },
    ]);
  });

  it("diagramOf porte la zone lue de la liste des tables", () => {
    const cards = diagramOf(
      parseModelMermaid("erDiagram\n  T_client {\n    uuid id PK\n  }\n"),
      new Map(),
      [],
      new Map([["T-client", "Clients"]]),
    );
    expect(cards[0]?.zone).toBe("Clients");
  });
});
