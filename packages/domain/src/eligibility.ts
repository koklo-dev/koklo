import { type DependencyGraph, dependenciesOf } from "./dependency-graph.ts";
import type { Ticket } from "./ticket.ts";

/** Toutes les dépendances `blocks` pointent vers un ticket `done` (cible absente : faux). */
export const areDependenciesSatisfied = (
  ticket: Ticket,
  graph: DependencyGraph,
  ticketsByKey: ReadonlyMap<string, Ticket>,
): boolean =>
  dependenciesOf(graph, ticket.key).every(
    (edge) => edge.type !== "blocks" || ticketsByKey.get(edge.dependsOn)?.status === "done",
  );

export const isEligible = (
  ticket: Ticket,
  graph: DependencyGraph,
  ticketsByKey: ReadonlyMap<string, Ticket>,
): boolean => ticket.status === "todo" && areDependenciesSatisfied(ticket, graph, ticketsByKey);
