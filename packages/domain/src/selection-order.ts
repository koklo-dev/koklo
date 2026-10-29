import type { DependencyGraph } from "./dependency-graph.ts";
import { areDependenciesSatisfied, isEligible } from "./eligibility.ts";
import { TICKET_PRIORITIES, type Ticket, type TicketPriority } from "./ticket.ts";
import { parseTicketKey } from "./ticket-key.ts";

export type SelectionContext = { readonly activeSprint: string | null };

export const priorityRank = (priority: TicketPriority): number =>
  TICKET_PRIORITIES.indexOf(priority);

const byKeyMap = (tickets: readonly Ticket[]): ReadonlyMap<string, Ticket> =>
  new Map(tickets.map((ticket) => [ticket.key, ticket]));

const isActive = (ticket: Ticket, context: SelectionContext): boolean =>
  context.activeSprint !== null && ticket.sprint === context.activeSprint;

/** Classement complet : sprint actif, priorité, dépendances satisfaites, ancienneté, numéro de clé. */
export const rankTickets = (
  tickets: readonly Ticket[],
  graph: DependencyGraph,
  context: SelectionContext,
): Ticket[] => {
  const ticketsByKey = byKeyMap(tickets);
  const decorated = tickets.map((ticket) => ({
    ticket,
    active: isActive(ticket, context) ? 0 : 1,
    satisfied: areDependenciesSatisfied(ticket, graph, ticketsByKey) ? 0 : 1,
    created: Date.parse(ticket.createdAt),
    number: parseTicketKey(ticket.key),
  }));
  decorated.sort(
    (a, b) =>
      a.active - b.active ||
      priorityRank(b.ticket.priority) - priorityRank(a.ticket.priority) ||
      a.satisfied - b.satisfied ||
      a.created - b.created ||
      a.number - b.number,
  );
  return decorated.map((entry) => entry.ticket);
};

export const selectionOrder = (
  tickets: readonly Ticket[],
  graph: DependencyGraph,
  context: SelectionContext,
): Ticket[] => {
  const ticketsByKey = byKeyMap(tickets);
  return rankTickets(tickets, graph, context).filter((ticket) =>
    isEligible(ticket, graph, ticketsByKey),
  );
};

/** Premier ticket éligible du sprint actif ; null sans sprint actif (CDC §7.3). */
export const nextTicket = (
  tickets: readonly Ticket[],
  graph: DependencyGraph,
  context: SelectionContext,
): Ticket | null =>
  selectionOrder(tickets, graph, context).find((ticket) => isActive(ticket, context)) ?? null;
