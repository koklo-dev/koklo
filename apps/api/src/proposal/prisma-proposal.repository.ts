import type { AgentProposalKind } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { recordAudit } from "../tracker/audit.ts";
import { keysetBy, type ListSource, loadWindow, type Position } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  DecideManyOutcome,
  DecideOutcome,
  Decision,
  ProposalQuery,
  ProposalRecord,
  ProposalRepository,
  ProposalWindow,
  RevisedContent,
} from "./proposal.repository.ts";
import type { GroupCount, GroupFilter } from "./proposal-groups.ts";

interface Row {
  id: string;
  launchId: string;
  deliverable: string;
  kind: string;
  zone: string;
  position: number;
  title: string;
  rationale: string;
  payload: unknown;
  status: string;
  appliedBatchId: string | null;
  createdAt: Date;
}

export const proposalOf = (row: Row): ProposalRecord => ({
  id: row.id,
  launchId: row.launchId,
  deliverable: row.deliverable,
  kind: row.kind as AgentProposalKind,
  zone: row.zone,
  position: row.position,
  title: row.title,
  rationale: row.rationale,
  payload: row.payload as Record<string, unknown>,
  status: row.status as ProposalRecord["status"],
  appliedBatchId: row.appliedBatchId,
  createdAt: row.createdAt,
});

/** Le N attendu n'est plus le N réel : lève dans la transaction pour l'annuler, rendu en `changed` par l'appelant. */
class CountChanged extends Error {
  constructor(readonly actual: number) {
    super("pending count changed");
  }
}

const STATUS_OF: Record<Decision, "pending" | "accepted" | "rejected"> = {
  accept: "accepted",
  reject: "rejected",
  reset: "pending",
};

const groupWhere = (group: GroupFilter) => ({
  ...(group.kind === undefined ? {} : { kind: group.kind }),
  ...(group.zone === undefined ? {} : { zone: group.zone }),
});

/** Liste d'un lancement triée par `(position, id)` : le tri stable du curseur (socle TK-94). */
function sourceOf(tx: Tx, scope: ProjectScope, query: ProposalQuery): ListSource<Row, number> {
  const where = {
    projectId: scope.projectId,
    launchId: query.launchId,
    ...groupWhere(query.group),
    ...(query.pendingOnly ? { status: "pending" } : {}),
  };
  return {
    total: () => tx.agentProposal.count({ where }),
    page: async (direction, from, take, skip) =>
      tx.agentProposal.findMany({
        where: from
          ? { ...where, ...keysetBy("position", from, direction === "after" ? "gt" : "lt") }
          : where,
        orderBy: [
          { position: direction === "after" ? "asc" : "desc" },
          { id: direction === "after" ? "asc" : "desc" },
        ],
        take,
        skip,
      }),
    countBefore: (position: Position<number>) =>
      tx.agentProposal.count({ where: { ...where, ...keysetBy("position", position, "lt") } }),
    locate: async () => null,
    positionOf: (row) => ({ key: row.position, id: row.id }),
    encodeKey: (key) => key,
    decodeKey: (raw) => (typeof raw === "number" && Number.isInteger(raw) ? raw : null),
  };
}

@Injectable()
export class PrismaProposalRepository implements ProposalRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  find(scope: ProjectScope, proposalId: string): Promise<ProposalRecord | null> {
    return this.transactions.run(scope, async (tx) => {
      const row = await tx.agentProposal.findFirst({
        where: { id: proposalId, projectId: scope.projectId },
      });
      return row ? proposalOf(row) : null;
    });
  }

  groupCounts(scope: ProjectScope, launchId: string): Promise<GroupCount[]> {
    return this.transactions.run(scope, async (tx) => {
      const groups = await tx.agentProposal.groupBy({
        by: ["kind", "zone", "status"],
        where: { projectId: scope.projectId, launchId },
        _count: { _all: true },
        _min: { position: true },
      });
      return groups.map((group) => ({
        kind: group.kind as AgentProposalKind,
        zone: group.zone,
        status: group.status as GroupCount["status"],
        n: group._count._all,
        first: group._min.position ?? 0,
      }));
    });
  }

  window(scope: ProjectScope, query: ProposalQuery): Promise<ProposalWindow> {
    return this.transactions.run(scope, async (tx) => {
      const window = await loadWindow(sourceOf(tx, scope, query), {
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      });
      return { ...window, rows: window.rows.map(proposalOf) };
    });
  }

  decide(
    scope: ProjectScope,
    proposalId: string,
    decision: Decision,
    edited: RevisedContent | undefined,
  ): Promise<DecideOutcome> {
    return this.transactions.run(scope, async (tx) => {
      const current = await tx.agentProposal.findFirst({
        where: { id: proposalId, projectId: scope.projectId },
      });
      if (!current) return { kind: "missing" };
      if (current.appliedBatchId !== null) return { kind: "applied" };
      const row = await tx.agentProposal.update({
        where: { id: current.id },
        data: {
          status: STATUS_OF[decision],
          ...(edited === undefined
            ? {}
            : { title: edited.title, payload: edited.payload as object }),
        },
      });
      await tx.agentProposalDecision.create({
        data: {
          organizationId: scope.organizationId,
          proposalId: current.id,
          decision,
          decidedBy: scope.userId,
          edited: edited !== undefined,
        },
      });
      await recordAudit(tx, scope, {
        action: "proposal.decide",
        targetKind: "agent_proposal",
        targetId: current.id,
      });
      return { kind: "decided", proposal: proposalOf(row) };
    });
  }

  async decideMany(
    scope: ProjectScope,
    launchId: string,
    group: GroupFilter,
    expected: number,
  ): Promise<DecideManyOutcome> {
    try {
      return await this.transactions.run(scope, (tx) =>
        this.acceptPending(tx, scope, launchId, group, expected),
      );
    } catch (error) {
      if (error instanceof CountChanged) return { kind: "changed", actual: error.actual };
      throw error;
    }
  }

  /** Lit les `pending` du groupe, compare au N attendu, accepte tout ou rien (la transaction est annulée sinon). */
  private async acceptPending(
    tx: Tx,
    scope: ProjectScope,
    launchId: string,
    group: GroupFilter,
    expected: number,
  ): Promise<DecideManyOutcome> {
    const pending = await tx.agentProposal.findMany({
      where: {
        projectId: scope.projectId,
        launchId,
        status: "pending",
        appliedBatchId: null,
        ...groupWhere(group),
      },
      select: { id: true },
    });
    if (pending.length !== expected) throw new CountChanged(pending.length);
    const ids = pending.map((row) => row.id);
    // Garde de concurrence : un `decide` passé entre la lecture et l'écriture n'est jamais écrasé.
    const updated = await tx.agentProposal.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: { status: "accepted" },
    });
    if (updated.count !== ids.length) throw new CountChanged(updated.count);
    await tx.agentProposalDecision.createMany({
      data: ids.map((proposalId) => ({
        organizationId: scope.organizationId,
        proposalId,
        decision: "accept",
        decidedBy: scope.userId,
        edited: false,
      })),
    });
    await recordAudit(tx, scope, {
      action: "proposal.decideMany",
      targetKind: "agent_launch",
      targetId: launchId,
    });
    return { kind: "decided", decided: ids.length };
  }

  revise(
    scope: ProjectScope,
    proposalId: string,
    content: RevisedContent,
  ): Promise<ProposalRecord | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await tx.agentProposal.updateMany({
        where: { id: proposalId, projectId: scope.projectId, appliedBatchId: null },
        data: { title: content.title, payload: content.payload as object, status: "pending" },
      });
      if (found.count === 0) return null;
      const row = await tx.agentProposal.findFirst({
        where: { id: proposalId, projectId: scope.projectId },
      });
      return row ? proposalOf(row) : null;
    });
  }
}
