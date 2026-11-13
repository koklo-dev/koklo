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

const NODE_SEP = 40;
const RANK_SEP = 80;
/** Au-delà de 6 tables, un rang dagre se replie en colonnes voisines (B477) : un « hub » ne trace plus une ligne. */
const MAX_PER_COLUMN = 6;
/** Écart entre deux blocs (groupes de tables reliées, tables isolées). */
const BLOCK_GAP = 80;
/** Rapport largeur / hauteur visé pour l'ensemble : celui d'un cadre d'écran (B477). */
const TARGET_RATIO = 1.6;

/** Positions relatives d'un bloc (coin haut gauche à 0, 0) et sa taille. */
interface Block {
  key: string;
  positions: Record<string, DiagramPoint>;
  width: number;
  height: number;
}

/**
 * Placement dagre (B419) : de gauche à droite, `nodesep` 40, `ranksep` 80, `network-simplex`. Les entrées sont triées
 * par identifiant avant d'alimenter dagre : le plan ne dépend pas de l'ordre reçu. Dagre ne sert qu'aux positions
 * (B420) ; les traits sont tracés par le lecteur.
 */
function placeWithDagre(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]) {
  const graph = new Graph();
  graph.setGraph({
    rankdir: "LR",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    ranker: "network-simplex",
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height });
  for (const edge of edges) graph.setEdge(edge.from, edge.to);
  layout(graph);
  return graph;
}

/** Groupes de tables reliées (sans tenir compte du sens), chacun trié, dans l'ordre de leur premier identifiant. */
function componentsOf(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): LayoutNode[][] {
  const parent = new Map(nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(id, root);
    return root;
  };
  for (const edge of edges) parent.set(find(edge.from), find(edge.to));
  const groups = new Map<string, LayoutNode[]>();
  for (const node of nodes) {
    const root = find(node.id);
    groups.set(root, [...(groups.get(root) ?? []), node]);
  }
  return [...groups.values()];
}

/** Colonne empilée dans l'ordre reçu : hauteur totale et décalage de chaque table depuis le haut. */
function stack(column: readonly LayoutNode[]) {
  const tops: number[] = [];
  let height = 0;
  for (const node of column) {
    tops.push(height);
    height += node.height + NODE_SEP;
  }
  return { tops, height: Math.max(0, height - NODE_SEP) };
}

/**
 * Rang dagre trop long (plus de 6 tables) : replié en colonnes voisines, les rangs suivants décalés d'autant. Dès qu'un
 * rang se replie, toutes les colonnes du groupe sont empilées et centrées sur une même ligne (les hauteurs dagre
 * d'origine n'ont plus de sens). Sinon, le placement dagre est gardé tel quel.
 */
function wrapRanks(nodes: readonly LayoutNode[], graph: Graph): Record<string, DiagramPoint> {
  const ranks = new Map<number, LayoutNode[]>();
  for (const node of nodes) {
    const x = Math.round(graph.node(node.id).x);
    ranks.set(x, [...(ranks.get(x) ?? []), node]);
  }
  const result: Record<string, DiagramPoint> = {};
  if ([...ranks.values()].every((rank) => rank.length <= MAX_PER_COLUMN)) {
    for (const node of nodes) {
      const at = graph.node(node.id);
      result[node.id] = { x: at.x - node.width / 2, y: at.y - node.height / 2 };
    }
    return result;
  }
  const columns: { x: number; nodes: LayoutNode[] }[] = [];
  let shift = 0;
  for (const x of [...ranks.keys()].sort((a, b) => a - b)) {
    const rank = (ranks.get(x) ?? []).sort((a, b) => graph.node(a.id).y - graph.node(b.id).y);
    const count = Math.ceil(rank.length / MAX_PER_COLUMN);
    const perColumn = Math.ceil(rank.length / count);
    const width = Math.max(...rank.map((node) => node.width));
    for (let column = 0; column < count; column += 1) {
      columns.push({
        x: x - width / 2 + shift + column * (width + NODE_SEP),
        nodes: rank.slice(column * perColumn, (column + 1) * perColumn),
      });
    }
    shift += (count - 1) * (width + NODE_SEP);
  }
  const stacks = columns.map((column) => stack(column.nodes));
  const middle = Math.max(...stacks.map((entry) => entry.height)) / 2;
  columns.forEach((column, index) => {
    const { tops, height } = stacks[index] ?? { tops: [], height: 0 };
    column.nodes.forEach((node, row) => {
      result[node.id] = { x: column.x, y: middle - height / 2 + (tops[row] ?? 0) };
    });
  });
  return result;
}

/** Ramène des positions au coin 0, 0 et mesure le bloc. */
function blockOf(key: string, nodes: readonly LayoutNode[], raw: Record<string, DiagramPoint>) {
  const left = Math.min(...nodes.map((node) => raw[node.id]?.x ?? 0));
  const top = Math.min(...nodes.map((node) => raw[node.id]?.y ?? 0));
  const positions: Record<string, DiagramPoint> = {};
  let width = 0;
  let height = 0;
  for (const node of nodes) {
    const at = raw[node.id] ?? { x: 0, y: 0 };
    const point = { x: Math.round(at.x - left), y: Math.round(at.y - top) };
    positions[node.id] = point;
    width = Math.max(width, point.x + node.width);
    height = Math.max(height, point.y + node.height);
  }
  return { key, positions, width, height };
}

/** Tables isolées : une grille au rapport visé, dans l'ordre des identifiants. */
function gridBlock(nodes: readonly LayoutNode[]): Block {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * TARGET_RATIO * 0.6)));
  const cell = Math.max(...nodes.map((node) => node.width)) + NODE_SEP;
  const raw: Record<string, DiagramPoint> = {};
  const rowHeights: number[] = [];
  nodes.forEach((node, index) => {
    const row = Math.floor(index / columns);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, node.height);
  });
  nodes.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const y = rowHeights.slice(0, row).reduce((sum, h) => sum + h + NODE_SEP, 0);
    raw[node.id] = { x: (index % columns) * cell, y };
  });
  return blockOf("~isolees", nodes, raw);
}

/** Range les blocs en étagères, du plus grand au plus petit, sur une largeur qui vise le rapport d'un écran. */
function packBlocks(blocks: readonly Block[]): Record<string, DiagramPoint> {
  const area = blocks.reduce((sum, b) => sum + (b.width + BLOCK_GAP) * (b.height + BLOCK_GAP), 0);
  const widest = Math.max(0, ...blocks.map((b) => b.width));
  const limit = Math.max(widest, Math.sqrt(area * TARGET_RATIO));
  const ordered = [...blocks].sort(
    (a, b) => b.height * b.width - a.height * a.width || a.key.localeCompare(b.key, "en"),
  );
  const result: Record<string, DiagramPoint> = {};
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const block of ordered) {
    if (x > 0 && x + block.width > limit) {
      x = 0;
      y += shelf + BLOCK_GAP;
      shelf = 0;
    }
    for (const [id, at] of Object.entries(block.positions)) {
      result[id] = { x: DIAGRAM_MARGIN + x + at.x, y: DIAGRAM_MARGIN + y + at.y };
    }
    x += block.width + BLOCK_GAP;
    shelf = Math.max(shelf, block.height);
  }
  return result;
}

/**
 * Plan automatique (B419, B477) : chaque groupe de tables reliées est placé par dagre, ses rangs trop longs repliés ;
 * les tables isolées forment une grille ; les blocs sont rangés en étagères pour remplir un cadre d'écran plutôt
 * qu'une seule ligne ou colonne.
 */
function autoPositions(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]) {
  const known = new Set(nodes.map((node) => node.id));
  const kept = [...edges]
    .filter((edge) => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to)
    .sort((a, b) => a.from.localeCompare(b.from, "en") || a.to.localeCompare(b.to, "en"));
  const blocks: Block[] = [];
  const isolated: LayoutNode[] = [];
  for (const group of componentsOf(nodes, kept)) {
    if (group.length === 1) {
      isolated.push(...group);
      continue;
    }
    const ids = new Set(group.map((node) => node.id));
    const graph = placeWithDagre(
      group,
      kept.filter((edge) => ids.has(edge.from)),
    );
    blocks.push(blockOf(group[0]?.id ?? "", group, wrapRanks(group, graph)));
  }
  if (isolated.length > 0) blocks.push(gridBlock(isolated));
  return packBlocks(blocks);
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
  return overlayPositions(autoPositions(sortedNodes, edges), sortedNodes, positions);
}
