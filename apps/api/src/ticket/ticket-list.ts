import type { Prisma } from "@koklo/db";
import { countsOf, type ListSource, type Position } from "../tracker/long-list.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { TicketFilter } from "./ticket.repository.ts";
import { type TicketRow, ticketInclude } from "./ticket-rows.ts";

/**
 * Lecture des tickets d'un projet en liste longue : filtres, recherche et ordre par défaut (B42) :
 * priorité décroissante (`priority_rank` croissant), puis numéro de la clé, puis id. Pas de paramètre
 * `sort` : c'est l'ordre du kanban comme celui de la liste, calculé par le serveur sur toutes les
 * lignes, jamais sur les seules cartes chargées.
 */
type TicketWhere = Prisma.TicketWhereInput;

/** `kind:id` ou un identifiant seul, comme `ticket.list` le reçoit dans le filtre `assignee`. */
function assigneeFilter(assignee: string) {
  const separator = assignee.indexOf(":");
  if (separator < 0) return { assigneeId: assignee };
  return {
    assigneeKind: assignee.slice(0, separator) as "member" | "runner",
    assigneeId: assignee.slice(separator + 1),
  };
}

/**
 * Tickets non supprimés du projet qui passent les filtres. `ids` : résultat de la recherche plein
 * texte (`null` sans recherche) ; une liste vide ne laisse rien passer.
 */
export function ticketWhere(
  projectId: string,
  filter: TicketFilter,
  ids: readonly string[] | null,
): TicketWhere {
  return {
    projectId,
    deletedAt: null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.sprintKey ? { sprint: { key: filter.sprintKey } } : {}),
    ...(filter.pkg ? { pkg: filter.pkg } : {}),
    ...(filter.assignee ? assigneeFilter(filter.assignee) : {}),
    ...(ids ? { id: { in: [...ids] } } : {}),
  };
}

/** Clé de tri d'un ticket : rang de priorité (0 = critique) et numéro de la clé. */
interface Rank {
  priority: number;
  number: number;
}

/** Filtre « strictement après / avant » la position dans l'ordre `(rang, numéro, id)`. */
function beyond({ key, id }: Position<Rank>, op: "gt" | "lt"): TicketWhere {
  return {
    OR: [
      { priorityRank: { [op]: key.priority } },
      { priorityRank: key.priority, keyNumber: { [op]: key.number } },
      { priorityRank: key.priority, keyNumber: key.number, id: { [op]: id } },
    ],
  };
}

const rankOf = (row: { priorityRank?: number | null; keyNumber?: number | null }): Rank => ({
  priority: row.priorityRank ?? 3,
  number: row.keyNumber ?? 0,
});

export function ticketSource(
  tx: Tx,
  projectId: string,
  where: TicketWhere,
): ListSource<TicketRow, Rank> {
  return {
    total: () => tx.ticket.count({ where }),
    page: (direction, from, take, skip) => {
      const order = direction === "after" ? "asc" : "desc";
      const window = from && beyond(from, direction === "after" ? "gt" : "lt");
      return tx.ticket.findMany({
        where: window ? { AND: [where, window] } : where,
        orderBy: [{ priorityRank: order }, { keyNumber: order }, { id: order }],
        take,
        skip,
        include: ticketInclude,
      });
    },
    countBefore: (position) => tx.ticket.count({ where: { AND: [where, beyond(position, "lt")] } }),
    locate: async (key) => {
      const row = await tx.ticket.findFirst({
        where: { projectId, key, deletedAt: null },
        select: { id: true, priorityRank: true, keyNumber: true },
      });
      if (!row) return null;
      const listed = (await tx.ticket.count({ where: { AND: [where, { id: row.id }] } })) > 0;
      return { position: { key: rankOf(row), id: row.id }, listed };
    },
    positionOf: (row) => ({ key: rankOf(row), id: row.id }),
    encodeKey: (key) => `${key.priority}:${key.number}`,
    decodeKey: (raw) => {
      const match = typeof raw === "string" ? /^(\d+):(\d+)$/.exec(raw) : null;
      return match ? { priority: Number(match[1]), number: Number(match[2]) } : null;
    },
  };
}

/** Comptes par statut et par paquet ; chaque dimension ignore son propre filtre. */
export async function ticketFacets(
  tx: Tx,
  projectId: string,
  filter: TicketFilter,
  ids: readonly string[] | null,
) {
  const byStatus = await tx.ticket.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: ticketWhere(projectId, { ...filter, status: undefined }, ids),
  });
  const byPackage = await tx.ticket.groupBy({
    by: ["pkg"],
    _count: { _all: true },
    where: ticketWhere(projectId, { ...filter, pkg: undefined }, ids),
  });
  return { status: countsOf(byStatus, "status"), pkg: countsOf(byPackage, "pkg") };
}
