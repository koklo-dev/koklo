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

/** B477 : un modèle large reste lisible, ni une seule colonne ni une seule ligne. */
describe("layoutDiagram, grands modèles", () => {
  const card = (id: string): LayoutNode => ({ id, width: 230, height: 120 });
  const ratio = (plan: { width: number; height: number }) => plan.width / plan.height;

  it("tables isolées : une grille au format d'un écran", () => {
    const nodes = Array.from({ length: 40 }, (_, i) => card(`T-t${String(i).padStart(2, "0")}`));
    const plan = layoutDiagram({ nodes, edges: [] });
    expect(ratio(plan)).toBeGreaterThan(0.8);
    expect(ratio(plan)).toBeLessThan(3);
  });

  it("une table référencée par 30 autres : son rang se replie en colonnes de 4 au plus", () => {
    const children = Array.from({ length: 30 }, (_, i) => card(`T-c${String(i).padStart(2, "0")}`));
    const nodes = [card("T-hub"), ...children];
    const edges = children.map((child) => ({ from: child.id, to: "T-hub" }));
    const { positions } = layoutDiagram({ nodes, edges });
    const columns = new Map<number, number>();
    for (const child of children) {
      const x = positions[child.id]?.x ?? -1;
      columns.set(x, (columns.get(x) ?? 0) + 1);
    }
    expect(columns.size).toBe(8);
    expect(Math.max(...columns.values())).toBeLessThanOrEqual(4);
    const hubX = positions["T-hub"]?.x ?? 0;
    expect(Math.max(...columns.keys())).toBeLessThan(hubX);
  });

  it("aucun chevauchement entre deux cartes", () => {
    const nodes = Array.from({ length: 25 }, (_, i) => card(`T-n${String(i).padStart(2, "0")}`));
    const edges = nodes.slice(1, 12).map((n, i) => ({ from: n.id, to: nodes[i]?.id ?? "" }));
    const { positions } = layoutDiagram({ nodes, edges });
    const boxes = nodes.map((n) => ({
      ...(positions[n.id] ?? { x: 0, y: 0 }),
      w: n.width,
      h: n.height,
    }));
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("une étoile de 6 tables : deux colonnes de 3, pas une colonne de 6", () => {
    const leaves = Array.from({ length: 6 }, (_, i) => card(`T-f${i}`));
    const { positions } = layoutDiagram({
      nodes: [card("T-centre"), ...leaves],
      edges: leaves.map((leaf) => ({ from: leaf.id, to: "T-centre" })),
    });
    expect(new Set(leaves.map((leaf) => positions[leaf.id]?.x)).size).toBe(2);
  });
});
