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
    | "llm_credential"
    | "project_client"
    | "suggestion"
    | "review"
    | "user"
    | "notification_preference"
    | "idea_page"
    | "agent_launch"
    | "agent_proposal";
  /** UUID de la ressource, posé par le serveur (jamais lu de l'entrée). */
  targetId: string;
  ticketId?: string;
}

/**
 * Qui journalise et dans quelle organisation : un `ProjectScope` en est une instance (il porte le
 * projet de la requête, TK-96), mais une écriture hors projet (organisation, membre, invitation,
 * projet) n'a pas de projet : l'entrée est alors d'organisation (`project_id` NULL).
 */
export interface AuditActor {
  organizationId: string;
  userId: string;
  projectId?: string;
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
      projectId: actor.projectId ?? null,
    },
  });
}
