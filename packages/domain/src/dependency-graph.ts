import { DependencyCycleError, InvalidDependencyTypeError } from "./errors.ts";
import { isOneOf } from "./one-of.ts";
import { parseTicketKey } from "./ticket-key.ts";

export const DEPENDENCY_TYPES = ["blocks", "related"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** `ticket` dépend de `dependsOn`. */
export type Dependency = {
  readonly ticket: string;
  readonly dependsOn: string;
  readonly type: DependencyType;
};

export type DependencyGraph = {
  readonly edges: readonly Dependency[];
};

const compareEdges = (a: Dependency, b: Dependency): number =>
  parseTicketKey(a.ticket) - parseTicketKey(b.ticket) ||
  parseTicketKey(a.dependsOn) - parseTicketKey(b.dependsOn) ||
  DEPENDENCY_TYPES.indexOf(a.type) - DEPENDENCY_TYPES.indexOf(b.type);

/**
 * Index partagé en ajout seul : chaque entrée porte la version du graphe qui l'a introduite, et un
 * graphe de version v ne voit que les entrées de version <= v. Une branche (ajout sur un graphe
 * qui n'est plus la tête) reconstruit un index propre, sans jamais muter ce qu'un autre graphe voit.
 */
type SharedIndex = {
  head: number;
  readonly keys: Map<string, number>;
  readonly out: Map<string, { readonly to: string; readonly version: number }[]>;
};
type GraphIndex = { readonly shared: SharedIndex; readonly version: number };

const indexes = new WeakMap<DependencyGraph, GraphIndex>();

const edgeKey = (e: Dependency): string => `${e.ticket}\u0000${e.dependsOn}\u0000${e.type}`;

const record = (shared: SharedIndex, edge: Dependency, version: number): void => {
  shared.keys.set(edgeKey(edge), version);
  const entry = { to: edge.dependsOn, version };
  const targets = shared.out.get(edge.ticket);
  if (targets) targets.push(entry);
  else shared.out.set(edge.ticket, [entry]);
};

const freezeGraph = (edges: readonly Dependency[], index: GraphIndex): DependencyGraph => {
  const graph = Object.freeze({ edges: Object.freeze(edges) });
  indexes.set(graph, index);
  return graph;
};

const indexOf = (graph: DependencyGraph): GraphIndex => {
  const known = indexes.get(graph);
  if (known) return known;
  const shared: SharedIndex = { head: graph.edges.length, keys: new Map(), out: new Map() };
  for (const edge of graph.edges) record(shared, edge, 0);
  const built = { shared, version: shared.head };
  indexes.set(graph, built);
  return built;
};

/** Index du graphe suivant : ajout en place si `index` est la tête, sinon copie d'une branche. */
const extendIndex = (graph: DependencyGraph, index: GraphIndex, edge: Dependency): GraphIndex => {
  let { shared } = index;
  if (index.version !== shared.head) {
    shared = { head: index.version, keys: new Map(), out: new Map() };
    for (const e of graph.edges) record(shared, e, 0);
  }
  shared.head += 1;
  record(shared, edge, shared.head);
  return { shared, version: shared.head };
};

/** Insère `edge` à sa place dans une liste déjà triée (recherche dichotomique). */
const insertSorted = (edges: readonly Dependency[], edge: Dependency): Dependency[] => {
  let low = 0;
  let high = edges.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (compareEdges(edges[mid] as Dependency, edge) <= 0) low = mid + 1;
    else high = mid;
  }
  const next = edges.slice();
  next.splice(low, 0, edge);
  return next;
};

const parseEdge = (edge: Dependency): Dependency => {
  parseTicketKey(edge.ticket);
  parseTicketKey(edge.dependsOn);
  if (!isOneOf(DEPENDENCY_TYPES, edge.type)) throw new InvalidDependencyTypeError(edge.type);
  return Object.freeze({ ticket: edge.ticket, dependsOn: edge.dependsOn, type: edge.type });
};

/** Chemin existant de `from` vers `to` (parcours en profondeur itératif), ou null. */
const findPath = (index: GraphIndex, from: string, to: string): string[] | null => {
  const parent = new Map<string, string>();
  const stack = [from];
  const seen = new Set([from]);
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === to) {
      const path = [node];
      for (let cur = node; cur !== from; ) {
        cur = parent.get(cur) as string;
        path.push(cur);
      }
      return path.reverse();
    }
    for (const { to: next, version } of index.shared.out.get(node) ?? []) {
      if (version > index.version || seen.has(next)) continue;
      seen.add(next);
      parent.set(next, node);
      stack.push(next);
    }
  }
  return null;
};

const EMPTY_GRAPH = freezeGraph([], {
  shared: { head: 0, keys: new Map(), out: new Map() },
  version: 0,
});

/** Nouveau graphe avec l'arête, ou le même graphe si elle existe déjà ; refuse tout cycle. */
export const addDependency = (graph: DependencyGraph, edge: Dependency): DependencyGraph => {
  const added = parseEdge(edge);
  const index = indexOf(graph);
  const known = index.shared.keys.get(edgeKey(added));
  if (known !== undefined && known <= index.version) return graph;
  const back = findPath(index, added.dependsOn, added.ticket);
  if (back) throw new DependencyCycleError([added.ticket, ...back]);
  return freezeGraph(insertSorted(graph.edges, added), extendIndex(graph, index, added));
};

export const createDependencyGraph = (edges: readonly Dependency[] = []): DependencyGraph =>
  edges.reduce<DependencyGraph>((graph, edge) => addDependency(graph, edge), EMPTY_GRAPH);

export const dependencyEdges = (graph: DependencyGraph): readonly Dependency[] => graph.edges;

export const dependenciesOf = (graph: DependencyGraph, key: string): readonly Dependency[] =>
  Object.freeze(graph.edges.filter((edge) => edge.ticket === key));
