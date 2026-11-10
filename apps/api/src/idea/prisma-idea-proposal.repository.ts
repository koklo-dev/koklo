import { type IdeaPageStatus, ideaPageStatusAfterSave, normalizeIdeaContent } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { notFound, validation, viaDomain } from "../tracker/api-errors.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaPageRecord } from "./idea.repository.ts";
import { applyBlockOperation, IdeaOperationError } from "./idea-markdown-ops.ts";
import type {
  IdeaDecisionActor,
  IdeaProposalOutcome,
  IdeaProposalRepository,
} from "./idea-proposal.repository.ts";
import {
  audit,
  contribute,
  FULL,
  findPage,
  insertPageRow,
  oneRecord,
} from "./prisma-idea-helpers.ts";
import {
  PROPOSAL,
  type ProposalRow,
  proposalRecord,
  staleProposalsOf,
} from "./prisma-idea-proposal-helpers.ts";

/** La page a changé depuis la proposition : lancée dans la transaction (rien n'est écrit), traduite en CONFLICT. */
class StaleProposalError extends Error {
  constructor(readonly currentVersion: number) {
    super("Proposition périmée");
    this.name = "StaleProposalError";
  }
}

const conflict = (currentVersion: number) =>
  new ORPCError("CONFLICT", { data: { currentVersion } });

async function findProposal(tx: Tx, scope: ProjectScope, id: string): Promise<ProposalRow> {
  const row = await tx.ideaProposal.findFirst({
    where: { id, projectId: scope.projectId },
    select: PROPOSAL,
  });
  if (!row) throw notFound();
  return row;
}

const DECIDED = (scope: ProjectScope, now: Date) => ({ decidedBy: scope.userId, decidedAt: now });

/**
 * Décisions sur les propositions de l'agent (TK-90). Appliquer une proposition de contenu est un compare-and-set sur la
 * version de la page, comme `idea.save` ; toute autre proposition en attente de la page devient périmée. Une version
 * dépassée n'écrit rien dans la transaction, puis marque la proposition `stale` dans une seconde.
 */
@Injectable()
export class PrismaIdeaProposalRepository implements IdeaProposalRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  async decide(
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    proposalId: string,
    decision: "accept" | "reject",
    contentMd: string | undefined,
  ): Promise<IdeaProposalOutcome> {
    return this.withStale(scope, proposalId, (tx) =>
      this.decideIn(tx, scope, actor, proposalId, decision, contentMd),
    );
  }

  async undo(
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    proposalId: string,
  ): Promise<IdeaProposalOutcome> {
    return this.withStale(scope, proposalId, (tx) => this.undoIn(tx, scope, actor, proposalId));
  }

  private async withStale(
    scope: ProjectScope,
    proposalId: string,
    work: (tx: Tx) => Promise<IdeaProposalOutcome>,
  ): Promise<IdeaProposalOutcome> {
    try {
      return await this.transactions.run(scope, work);
    } catch (error) {
      if (!(error instanceof StaleProposalError)) throw error;
      await this.transactions.run(scope, (tx) =>
        tx.ideaProposal.updateMany({
          where: { id: proposalId, projectId: scope.projectId, status: "pending" },
          data: { status: "stale" },
        }),
      );
      throw conflict(error.currentVersion);
    }
  }

  private async decideIn(
    tx: Tx,
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    proposalId: string,
    decision: "accept" | "reject",
    contentMd: string | undefined,
  ): Promise<IdeaProposalOutcome> {
    const row = await findProposal(tx, scope, proposalId);
    // Rejeter une proposition périmée est permis (B253) : l'écran doit pouvoir la retirer. L'accepter reste refusé (B234).
    if (row.status === "stale" && decision === "accept")
      throw new StaleProposalError(await this.versionOf(tx, scope, row));
    if (row.status !== "pending" && !(row.status === "stale" && decision === "reject")) {
      throw validation("proposalId", "Cette proposition n'est plus en attente.");
    }
    if (decision === "reject") return this.reject(tx, scope, actor, row);
    const applied = { ...row, contentMd: contentMd ?? row.contentMd };
    return row.op === "create_page"
      ? this.acceptPage(tx, scope, actor, applied)
      : this.acceptContent(tx, scope, actor, applied);
  }

  private async versionOf(tx: Tx, scope: ProjectScope, row: ProposalRow): Promise<number> {
    if (row.pageId === null) return 1;
    const page = await tx.ideaPage.findFirst({
      where: { id: row.pageId, projectId: scope.projectId },
      select: { version: true },
    });
    return page?.version ?? row.baseVersion ?? 1;
  }

  private async reject(
    tx: Tx,
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    row: ProposalRow,
  ): Promise<IdeaProposalOutcome> {
    const updated = await tx.ideaProposal.update({
      where: { id: row.id },
      data: { status: "rejected", ...DECIDED(scope, actor.now) },
      select: PROPOSAL,
    });
    await this.auditDecision(tx, scope, "idea.proposal.reject", row);
    return { proposal: proposalRecord(updated), page: null };
  }

  private async acceptContent(
    tx: Tx,
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    row: ProposalRow,
  ): Promise<IdeaProposalOutcome> {
    const page = row.pageId === null ? null : await this.activePage(tx, scope, row.pageId);
    if (page === null || row.pageId === null) throw new StaleProposalError(row.baseVersion ?? 1);
    if (page.version !== row.baseVersion) throw new StaleProposalError(page.version);
    const next = viaDomain(() => normalizeIdeaContent(this.applied(page.contentMd, row)));
    await this.compareAndSet(tx, scope, page, page.version, next);
    await staleProposalsOf(tx, scope.projectId, page.id, row.id);
    const updated = await tx.ideaProposal.update({
      where: { id: row.id },
      data: {
        status: "accepted",
        contentMd: row.contentMd,
        previousContentMd: page.contentMd,
        resultVersion: page.version + 1,
        ...DECIDED(scope, actor.now),
      },
      select: PROPOSAL,
    });
    await contribute(tx, scope, page.id, actor.now);
    await this.auditDecision(tx, scope, "idea.proposal.accept", row);
    return { proposal: proposalRecord(updated), page: await this.recordOf(tx, scope, page.id) };
  }

  private async acceptPage(
    tx: Tx,
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    row: ProposalRow,
  ): Promise<IdeaProposalOutcome> {
    const created = await insertPageRow(
      tx,
      scope,
      actor.now,
      {
        title: row.title ?? "Page sans titre",
        afterPageId: row.afterPageId ?? undefined,
        origin: "agent",
        contentMd: row.contentMd,
        field: "proposalId",
      },
      "idea.proposal.accept",
    );
    const updated = await tx.ideaProposal.update({
      where: { id: row.id },
      data: {
        status: "accepted",
        contentMd: row.contentMd,
        createdPageId: created.id,
        resultVersion: created.version,
        ...DECIDED(scope, actor.now),
      },
      select: PROPOSAL,
    });
    return { proposal: proposalRecord(updated), page: await this.recordOf(tx, scope, created.id) };
  }

  private async undoIn(
    tx: Tx,
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    proposalId: string,
  ): Promise<IdeaProposalOutcome> {
    const row = await findProposal(tx, scope, proposalId);
    if (row.status === "rejected") return this.reopen(tx, scope, row);
    const full = await tx.ideaProposal.findFirst({
      where: { id: row.id },
      select: { previousContentMd: true, resultVersion: true },
    });
    if (row.status !== "accepted" || row.op === "create_page" || !full || row.pageId === null) {
      throw validation("proposalId", "Cette décision ne peut pas être annulée.");
    }
    return this.revert(tx, scope, actor, row, full);
  }

  /** Un rejet annulé redevient en attente, ou périmé si la page a changé depuis. */
  private async reopen(
    tx: Tx,
    scope: ProjectScope,
    row: ProposalRow,
  ): Promise<IdeaProposalOutcome> {
    const current = row.pageId === null ? row.baseVersion : await this.versionOf(tx, scope, row);
    const status = current === row.baseVersion ? "pending" : "stale";
    const updated = await tx.ideaProposal.update({
      where: { id: row.id },
      data: { status, decidedBy: null, decidedAt: null },
      select: PROPOSAL,
    });
    await this.auditDecision(tx, scope, "idea.proposal.undo", row);
    return { proposal: proposalRecord(updated), page: null };
  }

  /**
   * Une acceptation annulée remet le contenu d'avant sous une NOUVELLE version (jamais en arrière : une sauvegarde
   * concurrente garde son compare-and-set) ; la proposition, dont le texte est de nouveau celui de sa base, est
   * rebasée sur cette version et redevient en attente.
   */
  private async revert(
    tx: Tx,
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    row: ProposalRow,
    full: { previousContentMd: string | null; resultVersion: number | null },
  ): Promise<IdeaProposalOutcome> {
    const page = await this.activePage(tx, scope, row.pageId as string);
    const resultVersion = full.resultVersion ?? 0;
    if (page === null || page.version !== resultVersion) {
      throw conflict(page?.version ?? resultVersion);
    }
    await this.compareAndSet(tx, scope, page, resultVersion, full.previousContentMd ?? "");
    await staleProposalsOf(tx, scope.projectId, page.id, row.id);
    const updated = await tx.ideaProposal.update({
      where: { id: row.id },
      data: {
        status: "pending",
        baseVersion: resultVersion + 1,
        previousContentMd: null,
        resultVersion: null,
        decidedBy: null,
        decidedAt: null,
      },
      select: PROPOSAL,
    });
    await contribute(tx, scope, page.id, actor.now);
    await this.auditDecision(tx, scope, "idea.proposal.undo", row);
    return { proposal: proposalRecord(updated), page: await this.recordOf(tx, scope, page.id) };
  }

  private applied(contentMd: string, row: ProposalRow): string {
    try {
      return applyBlockOperation(contentMd, {
        op: row.op as "insert_after" | "replace" | "append",
        anchorBlockIndex: row.anchorBlockIndex,
        rangeEnd: row.rangeEnd,
        contentMd: row.contentMd,
      });
    } catch (error) {
      // L'ancre ne vise plus un bloc : le document a changé sans passer par `idea.save`.
      if (error instanceof IdeaOperationError) throw new StaleProposalError(row.baseVersion ?? 1);
      throw error;
    }
  }

  private async compareAndSet(
    tx: Tx,
    scope: ProjectScope,
    page: { id: string; status: string },
    version: number,
    contentMd: string,
  ): Promise<void> {
    const swapped = await tx.ideaPage.updateMany({
      where: { id: page.id, projectId: scope.projectId, deletedAt: null, version },
      data: {
        contentMd,
        version: { increment: 1 },
        status: ideaPageStatusAfterSave(page.status as IdeaPageStatus, contentMd),
        updatedBy: scope.userId,
      },
    });
    if (swapped.count === 0) throw new StaleProposalError(version + 1);
  }

  private activePage(tx: Tx, scope: ProjectScope, pageId: string) {
    return tx.ideaPage.findFirst({
      where: { id: pageId, projectId: scope.projectId, deletedAt: null },
      select: FULL,
    });
  }

  private async recordOf(tx: Tx, scope: ProjectScope, pageId: string): Promise<IdeaPageRecord> {
    return oneRecord(tx, scope, await findPage(tx, scope, pageId, true));
  }

  private auditDecision(tx: Tx, scope: ProjectScope, action: string, row: ProposalRow) {
    return row.pageId === null
      ? audit(tx, scope, action, scope.projectId, "project")
      : audit(tx, scope, action, row.pageId);
  }
}
