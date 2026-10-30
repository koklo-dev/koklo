import { type Lease, LeaseAlreadyHeldError } from "@koklo/domain";
import type { LeaseRecord } from "../ticket/ticket.repository.ts";

/** Bail du domaine pour un enregistrement lu en base : le domaine décide, l'API ne duplique rien. */
export const toDomainLease = (ticket: string, record: LeaseRecord): Lease => ({
  ticket,
  holder: record.holder,
  branch: record.branch,
  worktree: record.worktree,
  acquiredAt: record.acquiredAt.toISOString(),
  heartbeatAt: record.heartbeatAt.toISOString(),
  expiresAt: record.expiresAt.toISOString(),
  ttlMs: record.ttlMs,
  released: record.released,
});

/** Erreur du domaine « bail déjà tenu » pour un bail actif lu en base (course perdue sur l'INSERT). */
export const heldError = (ticket: string, record: LeaseRecord): LeaseAlreadyHeldError =>
  new LeaseAlreadyHeldError(toDomainLease(ticket, record));
