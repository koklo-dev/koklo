/**
 * Faux `ticket.list` du kanban (contrat 1.0.0) : filtre par `status` et `sprintId`, pagine par `limit` et
 * `cursor` (rang du premier élément de la page, en chaîne) et répond `total` : le nombre de tickets de la
 * colonne, pas celui de la page.
 */
export interface ListedTicket {
  key: string;
  status: string;
  sprint?: string;
}

export interface TicketListInput {
  status?: string;
  sprintId?: string;
  limit?: number;
  cursor?: string;
}

export function listFor<T extends ListedTicket>(board: readonly T[], input: TicketListInput = {}) {
  const matching = board.filter(
    (ticket) =>
      (input.status === undefined || ticket.status === input.status) &&
      (input.sprintId === undefined || (ticket.sprint ?? input.sprintId) === input.sprintId),
  );
  const limit = input.limit ?? 50;
  const start = input.cursor ? Number(input.cursor) : 0;
  const items = matching.slice(start, start + limit).map((ticket) => ({ ...ticket }));
  const end = start + limit;
  return {
    items,
    nextCursor: end < matching.length ? String(end) : null,
    previousCursor: start > 0 ? String(Math.max(0, start - limit)) : null,
    offset: start,
    total: matching.length,
  };
}
