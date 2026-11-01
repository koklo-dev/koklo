import type { Tx } from "./project-transactions.ts";

/** Une écriture à journaliser : actions stables `ticket.create`, `sprint.activate`, etc. */
export interface AuditEntry {
  action: string;
  targetKind:
    | "ticket"
    | "sprint"
    | "lease"
    | "project_state"
    | "comment"
    | "organization"
    | "invitation"
    | "member"
    | "project"
    | "repo"
    | "installation"
    | "spec_batch"
    | "llm_credential";
  /** UUID de la ressource, posé par le serveur (jamais lu de l'entrée). */
  targetId: string;
  ticketId?: string;
}

/**
 * Qui journalise et dans quelle organisation : un `ProjectScope` en est une instance, mais une
 * écriture hors projet (organisation, membre, invitation, projet) n'a pas de projet courant.
 */
export interface AuditActor {
  organizationId: string;
  userId: string;
}

/**
 * Ajoute la ligne d'audit dans la transaction de l'écriture : si l'une échoue, l'autre est annulée.
 * L'acteur est l'utilisateur de la session (H10).
 * Doit s'exécuter sous `withOrganization(actor.organizationId)` (audit_log est un modèle multi-tenant).
 */
export async function recordAudit(tx: Tx, actor: AuditActor, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorKind: "human",
      actorId: actor.userId,
      action: entry.action,
      targetKind: entry.targetKind,
      targetId: entry.targetId,
      ticketId: entry.ticketId ?? null,
    },
  });
}
