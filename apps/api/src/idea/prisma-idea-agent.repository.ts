import { Inject, Injectable } from "@nestjs/common";
import { isUniqueViolation, notFound } from "../tracker/api-errors.ts";
import { encodeCursor, keysetAfter, positionOf } from "../tracker/cursor.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  IdeaAgentContext,
  IdeaAgentRepository,
  IdeaAuthorKind,
  IdeaExchange,
  IdeaGapItem,
  IdeaGapRunRecord,
  IdeaMessagePage,
  IdeaMode,
  IdeaProposalDraft,
} from "./idea-agent.repository.ts";
import type { IdeaProposalRecord } from "./idea-proposal.repository.ts";
import { authorsOf } from "./prisma-idea-helpers.ts";
import { PROPOSAL, proposalRecord } from "./prisma-idea-proposal-helpers.ts";

/** Derniers messages du fil joints au contexte du modèle. */
const THREAD_KEPT = 12;
const FORMER_MEMBER = "Ancien membre";

/**
 * Colonnes d'une proposition à stocker. Une proposition de page n'a ni page ni version de base ni ancre : elle
 * s'insère après la page de contexte (`afterPageId`) ; `append` n'a pas d'ancre, `insert_after` pas de fin de plage.
 */
function proposalData(
  scope: ProjectScope,
  exchange: IdeaExchange,
  draft: IdeaProposalDraft,
  status: "pending" | "stale",
) {
  const page = draft.op === "create_page";
  return {
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    pageId: page ? null : exchange.pageId,
    afterPageId: page ? exchange.pageId : null,
    baseVersion: page ? null : exchange.baseVersion,
    op: draft.op,
    anchorBlockIndex: draft.op === "append" || page ? null : draft.anchorBlockIndex,
    rangeEnd: draft.op === "replace" ? draft.rangeEnd : null,
    title: page ? draft.title : null,
    contentMd: draft.contentMd,
    rationale: draft.rationale,
    status: page ? ("pending" as const) : status,
  };
}

/**
 * Agent de l'espace Idée en base (TK-90). Les horodatages des messages et des propositions viennent de l'horloge
 * système, à la milliseconde, et strictement croissants dans un échange (humain, agent, propositions) : l'ordre du fil
 * et « depuis la dernière proposition » n'en dépendent pas d'un identifiant. Les décisions d'expiration (verrou,
 * mémoire des manques) viennent de l'horloge de l'application, passée par le service.
 */
@Injectable()
export class PrismaIdeaAgentRepository implements IdeaAgentRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  context(scope: ProjectScope, pageId: string | undefined): Promise<IdeaAgentContext> {
    return this.transactions.run(scope, async (tx) => {
      const pages = await tx.ideaPage.findMany({
        where: { projectId: scope.projectId, deletedAt: null },
        select: { id: true, title: true, templateKey: true, contentMd: true, version: true },
        orderBy: [{ position: "asc" }, { slug: "asc" }],
      });
      const focus = pageId === undefined ? undefined : pages.find((page) => page.id === pageId);
      if (pageId !== undefined && focus === undefined) throw notFound();
      return {
        pages,
        focus,
        messages: await this.thread(tx, scope),
        answers: focus === undefined ? 0 : await this.answersSince(tx, scope, focus.id),
      };
    });
  }

  private async thread(tx: Tx, scope: ProjectScope): Promise<IdeaAgentContext["messages"]> {
    const rows = await tx.ideaMessage.findMany({
      where: { projectId: scope.projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: THREAD_KEPT,
      select: { authorUserId: true, text: true },
    });
    const authors = await authorsOf(
      tx,
      scope.organizationId,
      rows.flatMap((row) => (row.authorUserId === null ? [] : [row.authorUserId])),
    );
    return rows.reverse().map((row) => ({
      author: this.kindOf(row.authorUserId, authors.get(row.authorUserId ?? "")?.isClient),
      text: row.text,
    }));
  }

  private kindOf(userId: string | null, isClient: boolean | undefined): IdeaAuthorKind {
    if (userId === null) return "agent";
    return isClient ? "client" : "team";
  }

  private async answersSince(tx: Tx, scope: ProjectScope, pageId: string): Promise<number> {
    const last = await tx.ideaProposal.findFirst({
      where: { projectId: scope.projectId, pageId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return tx.ideaMessage.count({
      where: {
        projectId: scope.projectId,
        pageId,
        author: "human",
        ...(last === null ? {} : { createdAt: { gt: last.createdAt } }),
      },
    });
  }

  async tryLock(scope: ProjectScope, now: Date, ttlMs: number): Promise<Date | null> {
    const expiresAt = new Date(now.getTime() + ttlMs);
    // Reprise d'un verrou expiré : l'écriture conditionnelle est atomique, un seul appel la gagne.
    const taken = await this.transactions.run(scope, (tx) =>
      tx.ideaAiLock.updateMany({
        where: { projectId: scope.projectId, userId: scope.userId, expiresAt: { lt: now } },
        data: { expiresAt },
      }),
    );
    if (taken.count === 1) return expiresAt;
    try {
      await this.transactions.run(scope, (tx) =>
        tx.ideaAiLock.create({
          data: {
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            userId: scope.userId,
            expiresAt,
          },
        }),
      );
      return expiresAt;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async unlock(scope: ProjectScope, token: Date): Promise<void> {
    await this.transactions.run(scope, (tx) =>
      tx.ideaAiLock.deleteMany({
        where: { projectId: scope.projectId, userId: scope.userId, expiresAt: token },
      }),
    );
  }

  recordExchange(
    scope: ProjectScope,
    exchange: IdeaExchange,
  ): Promise<{ messageId: string; proposals: IdeaProposalRecord[] }> {
    return this.transactions.run(scope, async (tx) => {
      const at = Date.now();
      const base = {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        pageId: exchange.pageId,
        mode: exchange.mode,
      };
      await tx.ideaMessage.create({
        data: {
          ...base,
          authorUserId: scope.userId,
          author: "human",
          text: exchange.humanText,
          createdAt: new Date(at),
        },
      });
      const reply = await tx.ideaMessage.create({
        data: { ...base, author: "agent", text: exchange.agentText, createdAt: new Date(at + 1) },
      });
      const status = await this.proposalStatus(tx, scope, exchange);
      const proposals: IdeaProposalRecord[] = [];
      for (const draft of exchange.proposals) {
        const row = await tx.ideaProposal.create({
          data: {
            ...proposalData(scope, exchange, draft, status),
            messageId: reply.id,
            createdAt: new Date(at + 1),
          },
          select: PROPOSAL,
        });
        proposals.push(proposalRecord(row));
      }
      return { messageId: reply.id, proposals };
    });
  }

  /** La page a pu changer pendant l'appel : une proposition faite sur une version dépassée naît périmée. */
  private async proposalStatus(
    tx: Tx,
    scope: ProjectScope,
    exchange: IdeaExchange,
  ): Promise<"pending" | "stale"> {
    if (exchange.pageId === null) return "pending";
    const page = await tx.ideaPage.findFirst({
      where: { id: exchange.pageId, projectId: scope.projectId, deletedAt: null },
      select: { version: true },
    });
    return page?.version === exchange.baseVersion ? "pending" : "stale";
  }

  messages(
    scope: ProjectScope,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<IdeaMessagePage> {
    return this.transactions.run(scope, async (tx) => {
      const position = positionOf(query.cursor);
      const where = { projectId: scope.projectId };
      const remaining = {
        ...where,
        ...(position === null ? {} : keysetAfter("createdAt", position, "desc")),
      };
      const [total, left, rows] = await Promise.all([
        tx.ideaMessage.count({ where }),
        tx.ideaMessage.count({ where: remaining }),
        tx.ideaMessage.findMany({
          where: remaining,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.limit + 1,
        }),
      ]);
      const page = rows.slice(0, query.limit);
      const authors = await authorsOf(
        tx,
        scope.organizationId,
        page.flatMap((row) => (row.authorUserId === null ? [] : [row.authorUserId])),
      );
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id,
          pageId: row.pageId,
          author:
            row.authorUserId === null
              ? null
              : (authors.get(row.authorUserId) ?? { name: FORMER_MEMBER, isClient: false }),
          mode: row.mode as IdeaMode,
          text: row.text,
          createdAt: row.createdAt,
        })),
        nextCursor:
          rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
        total,
        offset: total - left,
      };
    });
  }

  gapRun(scope: ProjectScope): Promise<IdeaGapRunRecord | null> {
    return this.transactions.run(scope, async (tx) => {
      const run = await tx.ideaGapRun.findFirst({ where: { projectId: scope.projectId } });
      return run && { computedAt: run.computedAt, items: run.items as unknown as IdeaGapItem[] };
    });
  }

  async saveGapRun(scope: ProjectScope, run: IdeaGapRunRecord): Promise<void> {
    const data = { computedAt: run.computedAt, items: run.items as unknown as object[] };
    const upsert = () =>
      this.transactions.run(scope, (tx) =>
        tx.ideaGapRun.upsert({
          where: { projectId: scope.projectId },
          create: { organizationId: scope.organizationId, projectId: scope.projectId, ...data },
          update: data,
        }),
      );
    try {
      await upsert();
    } catch (error) {
      // Deux premiers calculs simultanés : le second trouve la ligne du premier.
      if (!isUniqueViolation(error)) throw error;
      await upsert();
    }
  }
}
