import { Inject, Injectable } from "@nestjs/common";
import { type CursorPosition, keysetAfter, pageOfItems } from "../tracker/cursor.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { AuditFilter, AuditPage, AuditRecord, AuditRepository } from "./audit.repository.ts";

const EMPTY: AuditPage = { items: [], nextCursor: null };

/** Clés lisibles des tickets cités, y compris supprimés logiquement (le journal les garde). */
async function ticketKeys(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const tickets = await tx.ticket.findMany({
    where: { id: { in: ids } },
    select: { id: true, key: true },
  });
  return new Map(tickets.map((ticket) => [ticket.id, ticket.key]));
}

type AuditRow = Awaited<ReturnType<Tx["auditLog"]["findMany"]>>[number];

const toRecord = (row: AuditRow, keys: Map<string, string>): AuditRecord => ({
  id: row.id,
  actorKind: row.actorKind,
  actorId: row.actorId,
  tokenId: row.tokenId,
  action: row.action,
  targetKind: row.targetKind,
  targetId: row.targetId,
  ticketKey: (row.ticketId && keys.get(row.ticketId)) || null,
  occurredAt: row.occurredAt,
});

/** Filtres combinés en ET, organisation d'abord, puis reprise après le curseur (récent vers ancien). */
function auditWhere(
  scope: ProjectScope,
  filter: AuditFilter,
  ticketId: string | undefined,
  cursor: CursorPosition | null,
) {
  const range = {
    ...(filter.from ? { gte: filter.from } : {}),
    ...(filter.to ? { lt: filter.to } : {}),
  };
  return {
    organizationId: scope.organizationId,
    ...(ticketId ? { ticketId } : {}),
    ...(filter.actorKind ? { actorKind: filter.actorKind } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.from || filter.to ? { occurredAt: range } : {}),
    ...(cursor ? keysetAfter("occurredAt", cursor, "desc") : {}),
  };
}

@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  list(
    scope: ProjectScope,
    filter: AuditFilter,
    limit: number,
    cursor: CursorPosition | null,
  ): Promise<AuditPage> {
    return this.transactions.run(scope, async (tx) => {
      const ticketId = filter.ticketKey
        ? await this.resolveTicket(tx, scope, filter.ticketKey)
        : undefined;
      if (ticketId === null) {
        return EMPTY;
      }
      const rows = await tx.auditLog.findMany({
        where: auditWhere(scope, filter, ticketId, cursor),
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const keys = await ticketKeys(
        tx,
        rows.slice(0, limit).flatMap((row) => (row.ticketId ? [row.ticketId] : [])),
      );
      return pageOfItems(
        rows,
        limit,
        (row) => row.occurredAt,
        (row) => toRecord(row, keys),
      );
    });
  }

  /** Id du ticket du projet, supprimé ou non ; `null` si la clé ne désigne rien (page vide). */
  private async resolveTicket(tx: Tx, scope: ProjectScope, key: string): Promise<string | null> {
    const ticket = await tx.ticket.findFirst({
      where: { projectId: scope.projectId, key },
      select: { id: true },
    });
    return ticket?.id ?? null;
  }
}
