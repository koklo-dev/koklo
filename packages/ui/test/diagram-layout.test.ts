import { describe, expect, it } from "vitest";
import { type LayoutNode, layoutDiagram } from "../src/lib/diagram-layout.ts";

/** TK-108 lot A : placement dagre déterministe du lecteur de diagramme (B419). */
const NODES: readonly LayoutNode[] = [
  { id: "T-client", width: 230, height: 148 },
  { id: "T-reservation", width: 230, height: 174 },
  { id: "T-service", width: 230, height: 126 },
  { id: "T-creneau", width: 230, height: 152 },
  { id: "T-employe", width: 230, height: 108 },
  { id: "T-rappel", width: 230, height: 130 },
];
const EDGES = [
  { from: "T-client", to: "T-reservation" },
  { from: "T-service", to: "T-reservation" },
  { from: "T-creneau", to: "T-reservation" },
  { from: "T-reservation", to: "T-rappel" },
  { from: "T-employe", to: "T-creneau" },
  { from: "T-employe", to: "T-service" },
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("layoutDiagram", () => {
  it("place chaque table et rend deux fois le même plan", () => {
    const first = layoutDiagram({ nodes: NODES, edges: EDGES });
    const second = layoutDiagram({ nodes: NODES, edges: EDGES });
    expect(Object.keys(first.positions).sort()).toEqual(NODES.map((n) => n.id).sort());
    expect(second).toEqual(first);
  });

  it("ne dépend pas de l'ordre d'entrée", () => {
    const reference = layoutDiagram({ nodes: NODES, edges: EDGES });
    const shuffled = layoutDiagram({
      nodes: [...NODES].reverse(),
      edges: [...EDGES].reverse(),
    });
    expect(shuffled).toEqual(reference);
  });

  it("lit de gauche à droite : la source d'une relation est à gauche de sa cible", () => {
    const { positions } = layoutDiagram({ nodes: NODES, edges: EDGES });
    expect(positions["T-client"]?.x).toBeLessThan(positions["T-reservation"]?.x ?? 0);
    expect(positions["T-reservation"]?.x).toBeLessThan(positions["T-rappel"]?.x ?? 0);
  });

  it("rend des coordonnées entières, positives, coin haut gauche, marge de 20", () => {
    const { positions, width, height } = layoutDiagram({ nodes: NODES, edges: EDGES });
    for (const point of Object.values(positions)) {
      expect(Number.isInteger(point.x)).toBe(true);
      expect(Number.isInteger(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(20);
      expect(point.y).toBeGreaterThanOrEqual(20);
    }
    const right = Math.max(...NODES.map((n) => (positions[n.id]?.x ?? 0) + n.width));
    const bottom = Math.max(...NODES.map((n) => (positions[n.id]?.y ?? 0) + n.height));
    expect(width).toBe(right + 20);
    expect(height).toBe(bottom + 20);
  });

  it("les positions imposées écrasent dagre table par table", () => {
    const base = layoutDiagram({ nodes: NODES, edges: EDGES });
    const forced = layoutDiagram({
      nodes: NODES,
      edges: EDGES,
      positions: { "T-client": { x: 700, y: 900 }, "T-inconnue": { x: 1, y: 1 } },
    });
    expect(forced.positions["T-client"]).toEqual({ x: 700, y: 900 });
    expect(forced.positions["T-service"]).toEqual(base.positions["T-service"]);
    expect(forced.positions["T-inconnue"]).toBeUndefined();
    const right = Math.max(...NODES.map((n) => (forced.positions[n.id]?.x ?? 0) + n.width));
    const bottom = Math.max(...NODES.map((n) => (forced.positions[n.id]?.y ?? 0) + n.height));
    expect(forced.width).toBe(right + 20);
    expect(forced.height).toBe(bottom + 20);
    expect(forced.height).toBeGreaterThanOrEqual(900 + 148 + 20);
  });

  it("ignore une relation vers une table absente et accepte un diagramme vide", () => {
    const partial = layoutDiagram({
      nodes: [NODES[0] as LayoutNode],
      edges: [{ from: "T-client", to: "T-absente" }],
    });
    expect(Object.keys(partial.positions)).toEqual(["T-client"]);
    expect(layoutDiagram({ nodes: [], edges: [] })).toEqual({
      positions: {},
      width: 40,
      height: 40,
    });
  });
});
