import type { ProjectScope } from "../tracker/scope.ts";

export const AUDIT_REPOSITORY = Symbol("AUDIT_REPOSITORY");

export interface AuditFilter {
  ticketKey?: string | undefined;
  actorKind?: "human" | "agent" | "runner" | "system" | undefined;
  action?: string | undefined;
  /** Inclus. */
  from?: Date | undefined;
  /** Exclu. */
  to?: Date | undefined;
}

export interface AuditRecord {
  id: string;
  actorKind: "human" | "agent" | "runner" | "system";
  actorId: string | null;
  tokenId: string | null;
  action: string;
  targetKind: string;
  targetId: string;
  /** Clé lisible du ticket concerné, NULL sans ticket. */
  ticketKey: string | null;
  occurredAt: Date;
}

export interface AuditPage {
  items: AuditRecord[];
  nextCursor: string | null;
}

/** Lecture seule : l'écriture du journal reste `recordAudit`, dans la transaction auditée. */
export interface AuditRepository {
  list(
    scope: ProjectScope,
    filter: AuditFilter,
    limit: number,
    cursor: { sortKey: Date; id: string } | null,
  ): Promise<AuditPage>;
}
