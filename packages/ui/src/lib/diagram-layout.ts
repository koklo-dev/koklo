import { Graph, layout } from "@dagrejs/dagre";

/** Marge du plan autour des nœuds (maquette 11 l.376 : les cartes partent à 20). */
export const DIAGRAM_MARGIN = 20;

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface DiagramLayoutInput {
  nodes: readonly LayoutNode[];
  edges: readonly LayoutEdge[];
  /** Positions enregistrées (coin haut gauche) : elles écrasent dagre nœud par nœud. */
  positions?: Readonly<Record<string, DiagramPoint>> | undefined;
}

export interface DiagramLayout {
  /** Coin haut gauche de chaque nœud, en entiers. */
  positions: Record<string, DiagramPoint>;
  /** Taille du plan, marge comprise. */
  width: number;
  height: number;
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en");

/**
 * Placement dagre (B419) : de gauche à droite, `nodesep` 40, `ranksep` 80, `network-simplex`. Les entrées sont triées
 * par identifiant avant d'alimenter dagre : le plan ne dépend pas de l'ordre reçu. Dagre ne sert qu'aux positions
 * (B420) ; les traits sont tracés par le lecteur.
 */
function placeWithDagre(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]) {
  const graph = new Graph();
  graph.setGraph({
    rankdir: "LR",
    nodesep: 40,
    ranksep: 80,
    ranker: "network-simplex",
    marginx: DIAGRAM_MARGIN,
    marginy: DIAGRAM_MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const known = new Set(nodes.map((node) => node.id));
  for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height });
  const sorted = [...edges]
    .filter((edge) => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to)
    .sort((a, b) => a.from.localeCompare(b.from, "en") || a.to.localeCompare(b.to, "en"));
  for (const edge of sorted) graph.setEdge(edge.from, edge.to);
  layout(graph);
  return graph;
}

/** Positions enregistrées par `data/_layout.yaml` : entiers de 0 à 20000 (B418). */
export const MAX_COORDINATE = 20000;

export function clampPoint(point: DiagramPoint): DiagramPoint {
  const clamp = (value: number) => Math.min(MAX_COORDINATE, Math.max(0, Math.round(value)));
  return { x: clamp(point.x), y: clamp(point.y) };
}

/** Pose les positions imposées sur un plan déjà calculé (rapide : pas de nouveau passage dagre) et recalcule sa taille. */
export function overlayPositions(
  base: Readonly<Record<string, DiagramPoint>>,
  nodes: readonly LayoutNode[],
  positions?: Readonly<Record<string, DiagramPoint>>,
): DiagramLayout {
  const placed: Record<string, DiagramPoint> = {};
  let right = DIAGRAM_MARGIN;
  let bottom = DIAGRAM_MARGIN;
  for (const node of [...nodes].sort(byId)) {
    const point = positions?.[node.id] ?? base[node.id];
    if (!point) continue;
    placed[node.id] = { x: point.x, y: point.y };
    right = Math.max(right, point.x + node.width);
    bottom = Math.max(bottom, point.y + node.height);
  }
  return { positions: placed, width: right + DIAGRAM_MARGIN, height: bottom + DIAGRAM_MARGIN };
}

export function layoutDiagram({ nodes, edges, positions }: DiagramLayoutInput): DiagramLayout {
  const sortedNodes = [...nodes].sort(byId);
  const graph = placeWithDagre(sortedNodes, edges);
  const base: Record<string, DiagramPoint> = {};
  for (const node of sortedNodes) {
    const computed = graph.node(node.id);
    base[node.id] = {
      x: Math.round(computed.x - node.width / 2),
      y: Math.round(computed.y - node.height / 2),
    };
  }
  return overlayPositions(base, sortedNodes, positions);
}
