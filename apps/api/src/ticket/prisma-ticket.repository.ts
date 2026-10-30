import type { Dependency } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import { recordAudit } from "../tracker/audit.ts";
import { nextCounterValue } from "../tracker/counters.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  Criterion,
  LeaseRecord,
  NewTicket,
  SprintRef,
  TicketChanges,
  TicketFilter,
  TicketPage,
  TicketRecord,
  TicketRepository,
  TicketStatus,
  TicketStore,
} from "./ticket.repository.ts";
import {
  listWhere,
  pageOfRows,
  ticketInclude,
  toLeaseRecord,
  toTicketRecord,
} from "./ticket-rows.ts";

class PrismaTicketStore implements TicketStore {
  constructor(
    private readonly tx: Tx,
    private readonly scope: ProjectScope,
    private readonly clock: Clock,
  ) {}

  nextNumber(): Promise<number> {
    return nextCounterValue(this.tx, this.scope, "ticket");
  }

  findSprint(key: string): Promise<SprintRef | null> {
    return this.tx.sprint.findFirst({
      where: { projectId: this.scope.projectId, key },
      select: { id: true, key: true, status: true },
    });
  }

  async find(key: string): Promise<TicketRecord | null> {
    const row = await this.tx.ticket.findFirst({
      where: { projectId: this.scope.projectId, key, deletedAt: null },
      include: ticketInclude,
    });
    return row && toTicketRecord(row);
  }

  async list(filter: TicketFilter, limit: number, cursor?: string): Promise<TicketPage> {
    const rows = await this.tx.ticket.findMany({
      where: listWhere(this.scope.projectId, filter, cursor),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
      include: ticketInclude,
    });
    return pageOfRows(rows, limit);
  }

  async insert(ticket: NewTicket): Promise<TicketRecord> {
    const { organizationId, projectId } = this.scope;
    const { id } = await this.tx.ticket.create({
      data: {
        organizationId,
        projectId,
        key: ticket.key,
        title: ticket.title,
        description: ticket.description,
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        sprintId: ticket.sprintId,
        assigneeKind: ticket.assignee?.kind ?? null,
        assigneeId: ticket.assignee?.id ?? null,
        pkg: ticket.pkg,
        sensitivity: ticket.sensitivity,
        estimateHours: ticket.estimateHours,
      },
      select: { id: true },
    });
    await this.replaceChildren(id, ticket);
    await this.insertCriteria(id, ticket.criteria);
    return this.reload(id);
  }

  async update(id: string, changes: TicketChanges): Promise<TicketRecord> {
    const { labels, linkedFeatures, assignee, ...columns } = changes;
    await this.tx.ticket.update({
      where: { id, projectId: this.scope.projectId },
      data: {
        ...columns,
        ...(assignee ? { assigneeKind: assignee.kind, assigneeId: assignee.id } : {}),
      },
    });
    await this.replaceChildren(id, { labels, linkedFeatures });
    return this.reload(id);
  }

  async setStatus(id: string, status: TicketStatus): Promise<TicketRecord> {
    await this.tx.ticket.update({
      where: { id, projectId: this.scope.projectId },
      data: { status },
    });
    return this.reload(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.tx.ticket.update({
      where: { id, projectId: this.scope.projectId },
      data: { deletedAt: new Date() },
    });
  }

  async hasActiveLease(id: string): Promise<boolean> {
    await this.assertOwned(id);
    return (await this.tx.lease.count({ where: this.activeWhere(id) })) > 0;
  }

  async activeLease(id: string): Promise<LeaseRecord | null> {
    await this.assertOwned(id);
    const row = await this.tx.lease.findFirst({
      where: this.activeWhere(id),
      orderBy: { acquiredAt: "desc" },
    });
    return row && toLeaseRecord(row);
  }

  async criteria(id: string): Promise<Criterion[]> {
    await this.assertOwned(id);
    const rows = await this.tx.acceptanceCriterion.findMany({
      where: { ticketId: id },
      orderBy: { position: "asc" },
      select: { statement: true, specRef: true },
    });
    return rows;
  }

  async dependenciesOf(id: string) {
    await this.assertOwned(id);
    const rows = await this.tx.ticketDependency.findMany({
      where: { ticketId: id, dependsOn: { projectId: this.scope.projectId, deletedAt: null } },
      select: { type: true, dependsOn: { include: ticketInclude } },
    });
    const source = await this.tx.ticket.findUniqueOrThrow({ where: { id }, select: { key: true } });
    return {
      edges: rows.map(
        (row): Dependency => ({ ticket: source.key, dependsOn: row.dependsOn.key, type: row.type }),
      ),
      targets: rows.map((row) => toTicketRecord(row.dependsOn)),
    };
  }

  async projectEdges(): Promise<Dependency[]> {
    const { projectId } = this.scope;
    const rows = await this.tx.ticketDependency.findMany({
      where: {
        ticket: { projectId, deletedAt: null },
        dependsOn: { projectId, deletedAt: null },
      },
      select: {
        type: true,
        ticket: { select: { key: true } },
        dependsOn: { select: { key: true } },
      },
    });
    return rows.map((row) => ({
      ticket: row.ticket.key,
      dependsOn: row.dependsOn.key,
      type: row.type,
    }));
  }

  async addEdge(ticketId: string, dependsOnId: string, type: Dependency["type"]): Promise<void> {
    await this.assertOwned(ticketId);
    await this.assertOwned(dependsOnId);
    await this.tx.ticketDependency.createMany({
      data: [{ organizationId: this.scope.organizationId, ticketId, dependsOnId, type }],
      skipDuplicates: true,
    });
  }

  async removeEdge(
    ticketId: string,
    dependsOnId: string,
    type: Dependency["type"],
  ): Promise<boolean> {
    await this.assertOwned(ticketId);
    const { count } = await this.tx.ticketDependency.deleteMany({
      where: { ticketId, dependsOnId, type },
    });
    return count > 0;
  }

  audit(action: string, ticketId: string): Promise<void> {
    return recordAudit(this.tx, this.scope, {
      action,
      targetKind: "ticket",
      targetId: ticketId,
      ticketId,
    });
  }

  /** Bail actif = non libéré ET non expiré à l'instant de l'horloge injectée (jamais `now()` SQL). */
  private activeWhere(ticketId: string) {
    return { ticketId, releasedAt: null, expiresAt: { gt: new Date(this.clock.now()) } };
  }

  private reload(id: string): Promise<TicketRecord> {
    return this.tx.ticket
      .findFirstOrThrow({ where: { id, projectId: this.scope.projectId }, include: ticketInclude })
      .then(toTicketRecord);
  }

  /**
   * Défense en profondeur (pas de clé étrangère composite, TK-28) : avant d'écrire une ligne enfant
   * ou une arête, le ticket doit appartenir à l'organisation (extension) ET au projet courant.
   */
  private async assertOwned(ticketId: string): Promise<void> {
    const owned = await this.tx.ticket.count({
      where: { id: ticketId, projectId: this.scope.projectId },
    });
    if (owned === 0) {
      throw new Error("ticket hors du projet courant");
    }
  }

  /** Remplace les listes fournies (sémantique PUT par champ) ; une liste omise reste inchangée. */
  private async replaceChildren(
    ticketId: string,
    lists: { labels?: string[]; linkedFeatures?: string[] },
  ): Promise<void> {
    const { organizationId } = this.scope;
    if (lists.labels) {
      await this.assertOwned(ticketId);
      await this.tx.ticketLabel.deleteMany({ where: { ticketId } });
      await this.tx.ticketLabel.createMany({
        data: lists.labels.map((label) => ({ organizationId, ticketId, label })),
        skipDuplicates: true,
      });
    }
    if (lists.linkedFeatures) {
      await this.assertOwned(ticketId);
      await this.tx.ticketFeature.deleteMany({ where: { ticketId } });
      await this.tx.ticketFeature.createMany({
        data: lists.linkedFeatures.map((featureRef) => ({ organizationId, ticketId, featureRef })),
        skipDuplicates: true,
      });
    }
  }

  private async insertCriteria(ticketId: string, criteria: Criterion[]): Promise<void> {
    if (criteria.length === 0) return;
    await this.assertOwned(ticketId);
    await this.tx.acceptanceCriterion.createMany({
      data: criteria.map((criterion, position) => ({
        organizationId: this.scope.organizationId,
        ticketId,
        position: position + 1, // les positions commencent à 1 (CHECK en base)
        statement: criterion.statement,
        specRef: criterion.specRef,
      })),
    });
  }
}

@Injectable()
export class PrismaTicketRepository implements TicketRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  run<T>(scope: ProjectScope, work: (store: TicketStore) => Promise<T>): Promise<T> {
    return this.transactions.run(scope, (tx) => work(new PrismaTicketStore(tx, scope, this.clock)));
  }
}
