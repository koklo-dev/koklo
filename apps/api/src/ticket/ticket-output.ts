import type { TicketDetail, TicketOutput } from "@koklo/contract";
import type { Dependency } from "@koklo/domain";
import type { Criterion, LeaseRecord, TicketRecord } from "./ticket.repository.ts";
import { holderLabel } from "./ticket-domain.ts";

export const toTicketOutput = (record: TicketRecord): TicketOutput => ({
  id: record.id,
  key: record.key,
  title: record.title,
  description: record.description,
  type: record.type,
  status: record.status,
  priority: record.priority,
  sprint: record.sprintKey,
  assignee: record.assignee && holderLabel(record.assignee),
  pkg: record.pkg,
  labels: record.labels,
  sensitivity: record.sensitivity,
  estimateHours: record.estimateHours,
  linkedFeatures: record.linkedFeatures,
  branch: record.branch,
  pullRequest: record.pullRequest,
  attempts: record.attempts,
  reviewRounds: record.reviewRounds,
  createdAt: record.createdAt.toISOString(),
});

/**
 * Le chemin du worktree d'un runner est interne à l'infrastructure : seuls les rôles qui écrivent
 * le voient, les autres reçoivent une chaîne vide (le schéma l'impose obligatoire).
 */
const leaseOutput = (key: string, lease: LeaseRecord, canSeeWorktree: boolean) => ({
  ticket: key,
  holder: lease.holder,
  branch: lease.branch,
  worktree: canSeeWorktree ? lease.worktree : "",
  acquiredAt: lease.acquiredAt.toISOString(),
  heartbeatAt: lease.heartbeatAt.toISOString(),
  expiresAt: lease.expiresAt.toISOString(),
  ttlMs: lease.ttlMs,
  released: lease.released,
});

export const toTicketDetail = (
  record: TicketRecord,
  parts: { criteria: Criterion[]; dependencies: readonly Dependency[]; lease: LeaseRecord | null },
  canSeeWorktree: boolean,
): TicketDetail => ({
  ...toTicketOutput(record),
  criteria: parts.criteria,
  dependencies: [...parts.dependencies],
  lease: parts.lease && leaseOutput(record.key, parts.lease, canSeeWorktree),
});
