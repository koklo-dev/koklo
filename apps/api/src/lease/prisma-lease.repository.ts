import { Inject, Injectable } from "@nestjs/common";
import type { LeaseRecord } from "../ticket/ticket.repository.ts";
import { toLeaseRecord } from "../ticket/ticket-rows.ts";
import { recordAudit } from "../tracker/audit.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { LeaseRepository, LeaseStore, LeaseTicket, NewLease } from "./lease.repository.ts";

class PrismaLeaseStore implements LeaseStore {
  constructor(
    private readonly tx: Tx,
    private readonly scope: ProjectScope,
  ) {}

  findTicket(key: string): Promise<LeaseTicket | null> {
    return this.tx.ticket.findFirst({
      where: { projectId: this.scope.projectId, key, deletedAt: null },
      select: { id: true, key: true },
    });
  }

  async activeLease(ticketId: string, now: Date): Promise<LeaseRecord | null> {
    const row = await this.tx.lease.findFirst({
      where: { ticketId, releasedAt: null, expiresAt: { gt: now } },
      orderBy: { acquiredAt: "desc" },
    });
    return row && toLeaseRecord(row);
  }

  async latestLease(ticketId: string): Promise<LeaseRecord | null> {
    const row = await this.tx.lease.findFirst({
      where: { ticketId },
      orderBy: [{ acquiredAt: "desc" }, { id: "desc" }],
    });
    return row && toLeaseRecord(row);
  }

  async releaseExpired(ticketId: string, now: Date): Promise<void> {
    await this.tx.lease.updateMany({
      where: { ticketId, releasedAt: null, expiresAt: { lte: now } },
      data: { releasedAt: now },
    });
  }

  async insert(lease: NewLease): Promise<LeaseRecord> {
    const row = await this.tx.lease.create({
      data: {
        organizationId: this.scope.organizationId,
        ticketId: lease.ticketId,
        holderKind: lease.holder.kind,
        holderId: lease.holder.id,
        branch: lease.branch,
        worktree: lease.worktree,
        acquiredAt: lease.acquiredAt,
        heartbeatAt: lease.heartbeatAt,
        expiresAt: lease.expiresAt,
        ttlMs: lease.ttlMs,
      },
    });
    return toLeaseRecord(row);
  }

  async extend(id: string, heartbeatAt: Date, expiresAt: Date): Promise<boolean> {
    const { count } = await this.tx.lease.updateMany({
      where: { id, releasedAt: null, expiresAt: { gt: heartbeatAt } },
      data: { heartbeatAt, expiresAt },
    });
    return count > 0;
  }

  async markReleased(id: string, releasedAt: Date): Promise<boolean> {
    const { count } = await this.tx.lease.updateMany({
      where: { id, releasedAt: null },
      data: { releasedAt },
    });
    return count > 0;
  }

  audit(action: string, lease: LeaseRecord, ticketId: string): Promise<void> {
    return recordAudit(this.tx, this.scope, {
      action,
      targetKind: "lease",
      targetId: lease.id,
      ticketId,
    });
  }
}

@Injectable()
export class PrismaLeaseRepository implements LeaseRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  run<T>(scope: ProjectScope, work: (store: LeaseStore) => Promise<T>): Promise<T> {
    return this.transactions.run(scope, (tx) => work(new PrismaLeaseStore(tx, scope)));
  }
}
