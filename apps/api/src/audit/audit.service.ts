import type { AuditEntry } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { DEFAULT_PAGE_SIZE, positionOf } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  AUDIT_REPOSITORY,
  type AuditFilter,
  type AuditRecord,
  type AuditRepository,
} from "./audit.repository.ts";

/** Champs NULL omis, instants en ISO UTC ; jamais le corps d'un commentaire. */
const outputOf = (record: AuditRecord): AuditEntry => ({
  id: record.id,
  actorKind: record.actorKind,
  ...(record.actorId === null ? {} : { actorId: record.actorId }),
  ...(record.tokenId === null ? {} : { tokenId: record.tokenId }),
  action: record.action,
  targetKind: record.targetKind,
  targetId: record.targetId,
  ...(record.ticketKey === null ? {} : { ticketKey: record.ticketKey }),
  occurredAt: record.occurredAt.toISOString(),
});

interface AuditListInput {
  ticketKey?: string | undefined;
  actorKind?: AuditFilter["actorKind"];
  action?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

const dateOf = (instant: string | undefined) => (instant ? new Date(instant) : undefined);

/** Journal d'audit en lecture seule, trié du plus récent au plus ancien. */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly repository: AuditRepository) {}

  async list(scope: ProjectScope, input: AuditListInput) {
    const { limit, cursor, from, to, ...rest } = input;
    const page = await this.repository.list(
      scope,
      { ...rest, from: dateOf(from), to: dateOf(to) },
      limit ?? DEFAULT_PAGE_SIZE,
      positionOf(cursor),
    );
    return { items: page.items.map(outputOf), nextCursor: page.nextCursor };
  }
}
