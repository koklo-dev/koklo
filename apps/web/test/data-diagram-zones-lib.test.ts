import { describe, expect, it } from "vitest";
import {
  crossLinkCount,
  neighborsOf,
  positionsForView,
  usesZoneView,
  type ZoneEntry,
  zoneCardsOf,
  zoneGridPositions,
  zoneNodesOf,
  zoneRelationsOf,
} from "../src/lib/data-diagram-zones.ts";
import type { DiagramCard } from "../src/lib/data-mermaid.ts";

/** TK-110 : zones du diagramme des Données, lues du serveur (`spec.data.zones`, `spec.data.zone`). */
const entry = (name: string, tableCount: number, links: ZoneEntry["links"] = []): ZoneEntry => ({
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  icon: "folder_open",
  tableCount,
  preview: ["Alpha", "Bêta"],
  links,
});
const ENTRIES = [
  entry("Rendez-vous", 9, [
    { to: "paiements", count: 4 },
    { to: "clients", count: 1 },
  ]),
  entry("Paiements", 6, [{ to: "rendez-vous", count: 4 }]),
  entry("Clients", 18, [{ to: "rendez-vous", count: 1 }]),
];
const proposed = (id: string, zone: string | undefined, state: DiagramCard["state"] = "review") =>
  ({ id, name: id.slice(2), fields: [], state, ...(zone ? { zone } : {}) }) satisfies DiagramCard;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("zones du diagramme (serveur)", () => {
  it("zoneNodesOf : une carte 300 × 180 par zone, triée par libellé, icône et aperçu du serveur", () => {
    const nodes = zoneNodesOf(ENTRIES, []);
    expect(nodes.map((node) => node.name)).toEqual(["Clients", "Paiements", "Rendez-vous"]);
    expect(nodes[2]).toMatchObject({ id: "rendez-vous", width: 300, height: 180 });
    expect(nodes[2]?.zone).toMatchObject({
      tableCount: 9,
      icon: "folder_open",
      preview: ["Alpha", "Bêta"],
      pending: 0,
      saved: true,
    });
  });

  it("zoneNodesOf : tables proposées à relire comptées par zone ; zone proposée absente de l'index : carte ajoutée", () => {
    const nodes = zoneNodesOf(ENTRIES, [
      proposed("T-a", "Paiements"),
      proposed("T-b", "Paiements"),
      proposed("T-c", "Paiements", "rejected"),
      proposed("T-d", "Fidélité"),
    ]);
    expect(nodes.find((node) => node.name === "Paiements")?.zone).toMatchObject({
      pending: 2,
      tableCount: 6,
    });
    const added = nodes.find((node) => node.name === "Fidélité");
    expect(added?.zone).toMatchObject({
      saved: false,
      tableCount: 1,
      pending: 1,
      icon: "folder_open",
    });
  });

  it("usesZoneView : plus de 25 tables et au moins deux zones", () => {
    expect(usesZoneView(26, 2)).toBe(true);
    expect(usesZoneView(25, 6)).toBe(false);
    expect(usesZoneView(300, 1)).toBe(false);
  });

  it("zoneRelationsOf : un trait par paire de zones, compté, épaisseur croissante", () => {
    const relations = zoneRelationsOf(ENTRIES);
    expect(relations).toHaveLength(2);
    expect(relations.find((r) => r.id === "paiements>rendez-vous")).toMatchObject({
      label: "4 relations",
    });
    expect(relations.find((r) => r.id === "clients>rendez-vous")?.label).toBe("1 relation");
    const [heavy, light] = [relations[1], relations[0]].sort(
      (a, b) => (b?.weight ?? 0) - (a?.weight ?? 0),
    );
    expect(heavy?.weight).toBeGreaterThan(light?.weight ?? 0);
  });

  it("crossLinkCount : somme des liens sortants (17 liens vers d'autres zones)", () => {
    expect(
      crossLinkCount([
        { zone: "paiements", count: 12 },
        { zone: "clients", count: 5 },
      ]),
    ).toBe(17);
    expect(crossLinkCount([])).toBe(0);
  });

  it("neighborsOf (B480) : une carte par zone liée, nom, tables et relations lus de l'index", () => {
    const nodes = neighborsOf(
      [
        { zone: "paiements", count: 4 },
        { zone: "clients", count: 1 },
      ],
      ENTRIES,
    );
    expect(nodes.map((node) => node.id)).toEqual(["zone:Clients", "zone:Paiements"]);
    expect(nodes[1]?.neighbor).toEqual({ zone: "Paiements", tables: 6, links: 4 });
  });

  it("zoneCardsOf : tables du serveur (clé primaire), puis tables proposées de la zone", () => {
    const cards = zoneCardsOf(
      {
        tables: [
          {
            specId: "T-a",
            name: "Alpha",
            zone: "Paiements",
            fields: [
              { name: "id", type: "uuid", primaryKey: true, personalData: false },
              { name: "nom", type: "texte(80)", primaryKey: false, personalData: true },
            ],
            personalData: true,
          },
        ],
      },
      [proposed("T-a", "Paiements"), proposed("T-n", "Paiements")],
    );
    expect(cards.map((card) => card.id)).toEqual(["T-a", "T-n"]);
    expect(cards[0]).toMatchObject({ name: "Alpha", zone: "Paiements" });
    expect(cards[0]?.fields.map((field) => field.kind)).toEqual(["primary", "plain"]);
    expect(zoneCardsOf(undefined, [proposed("T-n", "Fidélité")]).map((card) => card.id)).toEqual([
      "T-n",
    ]);
  });

  it("positionsForView (B481) : appliquées seulement si chaque table de la vue en a une", () => {
    const saved = { "T-a": { x: 1, y: 2 }, "T-b": { x: 3, y: 4 } };
    expect(positionsForView(saved, ["T-a", "T-b"])).toBe(saved);
    expect(positionsForView(saved, ["T-a", "T-c"])).toEqual({});
    expect(positionsForView(saved, [])).toEqual({});
  });
});

describe("grille de la vue des zones (maquette 11 l.476)", () => {
  it("deux colonnes : x = 40 + (i % 2) × 400, y = 30 + ⌊i / 2⌋ × 270", () => {
    const nodes = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id, width: 300, height: 180 }));
    expect(zoneGridPositions(nodes)).toEqual({
      a: { x: 40, y: 30 },
      b: { x: 440, y: 30 },
      c: { x: 40, y: 300 },
      d: { x: 440, y: 300 },
      e: { x: 40, y: 570 },
    });
  });
});
