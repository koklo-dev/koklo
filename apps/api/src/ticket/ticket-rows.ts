import type {
  Holder,
  LeaseRecord,
  TicketFilter,
  TicketPage,
  TicketRecord,
  TicketStatus,
} from "./ticket.repository.ts";

/** Colonnes lues pour un ticket, avec ses étiquettes, fonctionnalités et la clé de son sprint. */
export const ticketInclude = {
  labels: { select: { label: true }, orderBy: { label: "asc" } },
  features: { select: { featureRef: true }, orderBy: { featureRef: "asc" } },
  sprint: { select: { key: true } },
} as const;

type TicketRow = {
  id: string;
  key: string;
  title: string;
  description: string;
  type: TicketRecord["type"];
  status: TicketStatus;
  priority: TicketRecord["priority"];
  assigneeKind: Holder["kind"] | null;
  assigneeId: string | null;
  pkg: TicketRecord["pkg"];
  sensitivity: TicketRecord["sensitivity"];
  estimateHours: { toNumber(): number } | null;
  branch: string | null;
  pullRequest: string | null;
  attempts: number;
  reviewRounds: number;
  createdAt: Date;
  labels: { label: string }[];
  features: { featureRef: string }[];
  sprint: { key: string } | null;
};

export const toTicketRecord = (row: TicketRow): TicketRecord => ({
  id: row.id,
  key: row.key,
  title: row.title,
  description: row.description,
  type: row.type,
  status: row.status,
  priority: row.priority,
  sprintKey: row.sprint?.key ?? null,
  assignee:
    row.assigneeKind && row.assigneeId ? { kind: row.assigneeKind, id: row.assigneeId } : null,
  pkg: row.pkg,
  labels: row.labels.map((l) => l.label),
  sensitivity: row.sensitivity,
  estimateHours: row.estimateHours?.toNumber() ?? null,
  linkedFeatures: row.features.map((f) => f.featureRef),
  branch: row.branch,
  pullRequest: row.pullRequest,
  attempts: row.attempts,
  reviewRounds: row.reviewRounds,
  createdAt: row.createdAt,
});

export const toLeaseRecord = (row: {
  holderKind: Holder["kind"];
  holderId: string;
  branch: string;
  worktree: string;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
  ttlMs: number;
  releasedAt: Date | null;
}): LeaseRecord => ({
  holder: { kind: row.holderKind, id: row.holderId },
  branch: row.branch,
  worktree: row.worktree,
  acquiredAt: row.acquiredAt,
  heartbeatAt: row.heartbeatAt,
  expiresAt: row.expiresAt,
  ttlMs: row.ttlMs,
  released: row.releasedAt !== null,
});

/** Curseur opaque `(createdAt, id)` : tri stable de `ticket.list` (H7). */
export const encodeCursor = (row: { createdAt: Date; id: string }): string =>
  Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");

/** `null` si le curseur n'est pas un curseur émis par `encodeCursor`. */
export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const date = new Date(createdAt);
    return typeof id === "string" && !Number.isNaN(date.getTime()) ? { createdAt: date, id } : null;
  } catch {
    return null;
  }
}

export const pageOfRows = (rows: TicketRow[], limit: number): TicketPage => {
  const items = rows.slice(0, limit).map(toTicketRecord);
  const last = rows[limit - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
};

/** `kind:id` ou un identifiant seul, comme `ticket.list` le reçoit dans le filtre `assignee`. */
function assigneeFilter(assignee: string) {
  const separator = assignee.indexOf(":");
  if (separator < 0) return { assigneeId: assignee };
  return {
    assigneeKind: assignee.slice(0, separator) as "member" | "runner",
    assigneeId: assignee.slice(separator + 1),
  };
}

/** Filtre de `ticket.list` : projet, non supprimés, critères optionnels, puis reprise après le curseur. */
export function listWhere(projectId: string, filter: TicketFilter, cursor?: string) {
  const after = cursor ? decodeCursor(cursor) : null;
  return {
    projectId,
    deletedAt: null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.sprintKey ? { sprint: { key: filter.sprintKey } } : {}),
    ...(filter.pkg ? { pkg: filter.pkg } : {}),
    ...(filter.assignee ? assigneeFilter(filter.assignee) : {}),
    ...(after
      ? {
          OR: [
            { createdAt: { gt: after.createdAt } },
            { createdAt: after.createdAt, id: { gt: after.id } },
          ],
        }
      : {}),
  };
}
