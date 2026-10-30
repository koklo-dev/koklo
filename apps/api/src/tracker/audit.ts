import type { Tx } from "./project-transactions.ts";
import type { ProjectScope } from "./scope.ts";

/** Une écriture à journaliser : actions stables `ticket.create`, `sprint.activate`, etc. */
export interface AuditEntry {
  action: string;
  targetKind: "ticket" | "sprint";
  /** UUID de la ressource, posé par le serveur (jamais lu de l'entrée). */
  targetId: string;
  ticketId?: string;
}

/**
 * Ajoute la ligne d'audit dans la transaction de l'écriture : si l'une échoue, l'autre est annulée.
 * L'acteur est l'utilisateur de la session (H10).
 */
export async function recordAudit(tx: Tx, scope: ProjectScope, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: scope.organizationId,
      actorKind: "human",
      actorId: scope.userId,
      action: entry.action,
      targetKind: entry.targetKind,
      targetId: entry.targetId,
      ticketId: entry.ticketId ?? null,
    },
  });
}
