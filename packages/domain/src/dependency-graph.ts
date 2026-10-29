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

const sameEdge = (a: Dependency, b: Dependency): boolean =>
  a.ticket === b.ticket && a.dependsOn === b.dependsOn && a.type === b.type;

const freezeGraph = (edges: readonly Dependency[]): DependencyGraph =>
  Object.freeze({ edges: Object.freeze(edges) });

const parseEdge = (edge: Dependency): Dependency => {
  parseTicketKey(edge.ticket);
  parseTicketKey(edge.dependsOn);
  if (!isOneOf(DEPENDENCY_TYPES, edge.type)) throw new InvalidDependencyTypeError(edge.type);
  return Object.freeze({ ticket: edge.ticket, dependsOn: edge.dependsOn, type: edge.type });
};

/** Voisins sortants par ticket, toutes arêtes confondues (le DAG porte sur blocks et related). */
const adjacency = (edges: readonly Dependency[]): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const { ticket, dependsOn } of edges) {
    const targets = out.get(ticket);
    if (targets) targets.push(dependsOn);
    else out.set(ticket, [dependsOn]);
  }
  return out;
};

/** Chemin existant de `from` vers `to` (parcours en profondeur itératif), ou null. */
const findPath = (
  out: ReadonlyMap<string, readonly string[]>,
  from: string,
  to: string,
): string[] | null => {
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
    for (const next of out.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      parent.set(next, node);
      stack.push(next);
    }
  }
  return null;
};

const EMPTY_GRAPH = freezeGraph([]);

/** Nouveau graphe avec l'arête, ou le même graphe si elle existe déjà ; refuse tout cycle. */
export const addDependency = (graph: DependencyGraph, edge: Dependency): DependencyGraph => {
  const added = parseEdge(edge);
  if (graph.edges.some((e) => sameEdge(e, added))) return graph;
  const back = findPath(adjacency(graph.edges), added.dependsOn, added.ticket);
  if (back) throw new DependencyCycleError([added.ticket, ...back]);
  return freezeGraph([...graph.edges, added].sort(compareEdges));
};

export const createDependencyGraph = (edges: readonly Dependency[] = []): DependencyGraph =>
  edges.reduce<DependencyGraph>((graph, edge) => addDependency(graph, edge), EMPTY_GRAPH);

export const dependencyEdges = (graph: DependencyGraph): readonly Dependency[] => graph.edges;

export const dependenciesOf = (graph: DependencyGraph, key: string): readonly Dependency[] =>
  Object.freeze(graph.edges.filter((edge) => edge.ticket === key));
