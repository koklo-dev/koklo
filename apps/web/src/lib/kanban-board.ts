import type { TicketOutput, TicketStatus } from "@koklo/contract";
import { STATUS_ORDER, type TicketPriority } from "./ticket-labels.ts";

const PRIORITY_RANK: Record<TicketPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export type KanbanColumns = Record<TicketStatus, TicketOutput[]>;

function byPriorityThenKey(a: TicketOutput, b: TicketOutput): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.key.localeCompare(b.key, "en", { numeric: true })
  );
}

/** Répartit les tickets par statut ; chaque colonne est triée par priorité décroissante puis par clé. */
export function groupByStatus(tickets: readonly TicketOutput[]): KanbanColumns {
  const columns = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, []]),
  ) as unknown as KanbanColumns;
  for (const ticket of tickets) columns[ticket.status].push(ticket);
  for (const status of STATUS_ORDER) columns[status].sort(byPriorityThenKey);
  return columns;
}
