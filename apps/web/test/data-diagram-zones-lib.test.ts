import { describe, expect, it } from "vitest";
import {
  crossLinkCount,
  NO_ZONE,
  neighborsOf,
  positionsForView,
  usesZoneView,
  zoneRelationsOf,
  zonesOf,
} from "../src/lib/data-diagram-zones.ts";
import type { DiagramCard } from "../src/lib/data-mermaid.ts";

/** B478 : zones du diagramme des Données. */
const card = (id: string, zone?: string, state?: DiagramCard["state"]): DiagramCard => ({
  id,
  name: id.slice(2),
  fields: [],
  ...(zone ? { zone } : {}),
  ...(state ? { state } : {}),
});
const CARDS = [
  card("T-b", "Paiement"),
  card("T-a", "Clients"),
  card("T-c", "Paiement", "review"),
  card("T-d"),
];
const rel = (from: string, to: string) => ({ id: `${from}>${to}`, from, to });

describe("zones du diagramme", () => {
  it("zonesOf : groupe, trie par libellé, compte les tables à relire, « Sans zone » à défaut", () => {
    const zones = zonesOf(CARDS);
    expect(zones.map((zone) => zone.id)).toEqual(["Clients", "Paiement", NO_ZONE]);
    expect(zones[1]).toMatchObject({ tableIds: ["T-b", "T-c"], names: ["b", "c"], pending: 1 });
  });

  it("usesZoneView : plus de 25 tables et au moins deux zones", () => {
    const many = Array.from({ length: 26 }, (_, i) => card(`T-${i}`, i % 2 ? "A" : "B"));
    expect(usesZoneView(many, zonesOf(many))).toBe(true);
    expect(usesZoneView(many.slice(0, 25), zonesOf(many.slice(0, 25)))).toBe(false);
    const one = many.map((entry) => ({ ...entry, zone: "A" }));
    expect(usesZoneView(one, zonesOf(one))).toBe(false);
  });

  it("zoneRelationsOf : une par paire de zones, comptée, épaisseur croissante ; internes ignorées", () => {
    const relations = [rel("T-a", "T-b"), rel("T-c", "T-a"), rel("T-b", "T-c"), rel("T-d", "T-a")];
    const links = zoneRelationsOf(relations, CARDS);
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ from: "Clients", to: "Paiement", label: "2 relations" });
    expect(links[1]).toMatchObject({ from: "Clients", to: NO_ZONE, label: "1 relation" });
    expect(links[0]?.weight).toBeGreaterThan(links[1]?.weight ?? 0);
  });

  it("crossLinkCount : relations d'une zone vers les autres", () => {
    const relations = [rel("T-a", "T-b"), rel("T-c", "T-a"), rel("T-b", "T-c")];
    expect(crossLinkCount("Paiement", relations, CARDS)).toBe(2);
    expect(crossLinkCount(NO_ZONE, relations, CARDS)).toBe(0);
  });

  it("neighborsOf (B480) : une carte par zone reliée, un trait par paire table → zone", () => {
    const relations = [rel("T-a", "T-b"), rel("T-c", "T-a"), rel("T-a", "T-d"), rel("T-b", "T-c")];
    const { nodes, relations: edges } = neighborsOf("Clients", relations, CARDS);
    expect(nodes.map((node) => node.id)).toEqual(["zone:Paiement", `zone:${NO_ZONE}`]);
    expect(nodes[0]?.neighbor).toEqual({ zone: "Paiement", tables: 2, links: 2 });
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      from: "T-a",
      to: "zone:Paiement",
      label: "2 relations",
      dashed: true,
    });
    expect(edges[1]?.label).toBeUndefined();
  });

  it("positionsForView (B481) : appliquées seulement si chaque table de la vue en a une", () => {
    const saved = { "T-a": { x: 1, y: 2 }, "T-b": { x: 3, y: 4 } };
    expect(positionsForView(saved, ["T-a", "T-b"])).toBe(saved);
    expect(positionsForView(saved, ["T-a", "T-c"])).toEqual({});
    expect(positionsForView(saved, [])).toEqual({});
  });
});
