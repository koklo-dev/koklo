import {
  IDEA_PAGE_LIMIT,
  IDEA_PRESENCE_TTL_MS,
  IDEA_TRASH_DAYS,
  type IdeaPageStatus,
  ideaPageStatusAfterSave,
  isIdeaReorderComplete,
  isIdeaRestorable,
} from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { carrierFilter } from "../repo/prisma-repo.repository.ts";
import { isUniqueViolation, notFound, validation } from "../tracker/api-errors.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  IdeaActor,
  IdeaListing,
  IdeaPageRecord,
  IdeaPresent,
  IdeaRepository,
  IdeaSnapshot,
} from "./idea.repository.ts";
import { reconcilePublications } from "./idea-publications.ts";
import {
  activeOf,
  applyOrder,
  audit,
  authorsOf,
  contribute,
  FULL,
  findPage,
  insertPageRow,
  oneRecord,
  recordsOf,
  SUMMARY,
} from "./prisma-idea-helpers.ts";
import { PROPOSAL, proposalRecord, staleProposalsOf } from "./prisma-idea-proposal-helpers.ts";

const DAY_MS = 86_400_000;
/** Plus de propositions en attente que l'arborescence n'en montre : le surplus attend sa décision. */
const PENDING_PROPOSALS_MAX = 200;

@Injectable()
export class PrismaIdeaRepository implements IdeaRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  list(scope: ProjectScope, now: Date): Promise<IdeaListing> {
    return this.transactions.run(scope, async (tx) => {
      await reconcilePublications(tx, scope, now);
      const [pages, trash, repo, last] = await Promise.all([
        activeOf(tx, scope),
        tx.ideaPage.findMany({
          where: {
            projectId: scope.projectId,
            deletedAt: { gte: new Date(now.getTime() - IDEA_TRASH_DAYS * DAY_MS) },
          },
          select: SUMMARY,
          orderBy: [{ deletedAt: "desc" }, { slug: "asc" }],
          take: IDEA_PAGE_LIMIT,
        }),
        tx.projectRepo.findFirst({
          where: { projectId: scope.projectId, ...carrierFilter },
          select: { id: true },
        }),
        tx.ideaPublication.findFirst({
          where: { projectId: scope.projectId },
          orderBy: { publishedAt: "desc" },
          select: { commitSha: true, publishedAt: true },
        }),
      ]);
      const records = await recordsOf(tx, scope, [...pages, ...trash]);
      const pending = (
        await tx.ideaProposal.findMany({
          where: { projectId: scope.projectId, status: "pending" },
          select: PROPOSAL,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: PENDING_PROPOSALS_MAX,
        })
      ).map(proposalRecord);
      return {
        pages: records.slice(0, pages.length).map((record) => ({
          ...record,
          pendingProposals: pending.filter((proposal) => proposal.pageId === record.id).length,
        })),
        trash: records.slice(pages.length),
        hasSpecRepo: repo !== null,
        lastPublication: last,
        pendingPageProposals: pending.filter((proposal) => proposal.op === "create_page"),
      };
    });
  }

  get(scope: ProjectScope, pageId: string, now: Date): Promise<IdeaPageRecord> {
    return this.transactions.run(scope, async (tx) => {
      const row = await findPage(tx, scope, pageId, false);
      if (row.deletedAt && !isIdeaRestorable(row.deletedAt, now)) throw notFound();
      const proposals = await tx.ideaProposal.findMany({
        where: { projectId: scope.projectId, pageId, status: "pending" },
        select: PROPOSAL,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return { ...(await oneRecord(tx, scope, row)), proposals: proposals.map(proposalRecord) };
    });
  }

  save(
    scope: ProjectScope,
    actor: IdeaActor,
    pageId: string,
    baseVersion: number,
    contentMd: string,
  ): Promise<IdeaPageRecord> {
    return this.transactions.run(scope, async (tx) => {
      const current = await findPage(tx, scope, pageId, true);
      const conflict = () =>
        new ORPCError("CONFLICT", { data: { currentVersion: current.version } });
      if (current.version !== baseVersion) throw conflict();
      // Compare-and-set : une écriture concurrente qui passe avant nous rend `count` à 0.
      const swapped = await tx.ideaPage.updateMany({
        where: { id: pageId, projectId: scope.projectId, deletedAt: null, version: baseVersion },
        data: {
          contentMd,
          version: { increment: 1 },
          status: ideaPageStatusAfterSave(current.status as IdeaPageStatus, contentMd),
          updatedBy: scope.userId,
        },
      });
      if (swapped.count === 0) {
        const latest = await findPage(tx, scope, pageId, true);
        throw new ORPCError("CONFLICT", { data: { currentVersion: latest.version } });
      }
      await staleProposalsOf(tx, scope.projectId, pageId);
      await contribute(tx, scope, pageId, actor.now);
      await audit(tx, scope, "idea.page.save", pageId);
      return oneRecord(tx, scope, await findPage(tx, scope, pageId, true));
    });
  }

  setStatus(
    scope: ProjectScope,
    _actor: IdeaActor,
    pageId: string,
    status: "draft" | "review" | "stable",
  ): Promise<IdeaPageRecord> {
    return this.transactions.run(scope, async (tx) => {
      const current = await findPage(tx, scope, pageId, true);
      if (status !== "draft" && (current.contentMd ?? "").trim() === "") {
        throw validation("status", "Une page vide ne peut être qu'en brouillon.");
      }
      await tx.ideaPage.update({
        where: { id: pageId },
        data: { status, updatedBy: scope.userId },
      });
      await audit(tx, scope, "idea.page.status", pageId);
      return oneRecord(tx, scope, await findPage(tx, scope, pageId, true));
    });
  }

  async createPage(
    scope: ProjectScope,
    actor: IdeaActor,
    input: { title: string; afterPageId?: string | undefined },
  ): Promise<IdeaPageRecord> {
    // Deux créations simultanées peuvent viser le même slug : l'unicité tranche, on relit et on suffixe.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.insertPage(scope, actor, input);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 3) throw error;
      }
    }
  }

  private insertPage(
    scope: ProjectScope,
    actor: IdeaActor,
    input: { title: string; afterPageId?: string | undefined },
  ): Promise<IdeaPageRecord> {
    return this.transactions.run(scope, async (tx) => {
      const created = await insertPageRow(
        tx,
        scope,
        actor.now,
        { ...input, origin: "user", field: "title" },
        "idea.page.create",
      );
      return oneRecord(tx, scope, await findPage(tx, scope, created.id, true));
    });
  }

  rename(
    scope: ProjectScope,
    actor: IdeaActor,
    pageId: string,
    title: string,
  ): Promise<IdeaPageRecord> {
    return this.transactions.run(scope, async (tx) => {
      await findPage(tx, scope, pageId, true);
      await tx.ideaPage.update({ where: { id: pageId }, data: { title, updatedBy: scope.userId } });
      await contribute(tx, scope, pageId, actor.now);
      await audit(tx, scope, "idea.page.rename", pageId);
      return oneRecord(tx, scope, await findPage(tx, scope, pageId, true));
    });
  }

  reorder(scope: ProjectScope, _actor: IdeaActor, pageIds: string[]): Promise<IdeaPageRecord[]> {
    return this.transactions.run(scope, async (tx) => {
      const active = await activeOf(tx, scope);
      const ids = active.map((row) => row.id);
      if (!isIdeaReorderComplete(ids, pageIds)) {
        throw validation("pageIds", "La liste doit contenir exactement les pages du dossier.");
      }
      const byId = new Map(active.map((row) => [row.id, row]));
      const ordered = pageIds.map((id) => byId.get(id) as (typeof active)[number]);
      await applyOrder(tx, ordered);
      await audit(tx, scope, "idea.page.reorder", scope.projectId, "project");
      return recordsOf(
        tx,
        scope,
        ordered.map((row, position) => ({ ...row, position })),
      );
    });
  }

  remove(scope: ProjectScope, actor: IdeaActor, pageId: string): Promise<IdeaPageRecord> {
    return this.transactions.run(scope, async (tx) => {
      const page = await findPage(tx, scope, pageId, true);
      if (page.required) throw new ORPCError("FORBIDDEN", { data: { reason: "required_page" } });
      await tx.ideaPage.update({
        where: { id: pageId },
        data: { deletedAt: actor.now, updatedBy: scope.userId },
      });
      await applyOrder(
        tx,
        (await activeOf(tx, scope)).filter((row) => row.id !== pageId),
      );
      await staleProposalsOf(tx, scope.projectId, pageId);
      await audit(tx, scope, "idea.page.delete", pageId);
      return oneRecord(tx, scope, await findPage(tx, scope, pageId, false));
    });
  }

  restore(scope: ProjectScope, actor: IdeaActor, pageId: string): Promise<IdeaPageRecord> {
    return this.transactions.run(scope, async (tx) => {
      const page = await findPage(tx, scope, pageId, false);
      if (!page.deletedAt || !isIdeaRestorable(page.deletedAt, actor.now)) throw notFound();
      const active = await activeOf(tx, scope);
      if (active.length >= IDEA_PAGE_LIMIT) {
        throw validation("pageId", `Le dossier compte déjà ${IDEA_PAGE_LIMIT} pages.`);
      }
      await tx.ideaPage.update({
        where: { id: pageId },
        data: { deletedAt: null, position: active.length, updatedBy: scope.userId },
      });
      await audit(tx, scope, "idea.page.restore", pageId);
      return oneRecord(tx, scope, await findPage(tx, scope, pageId, true));
    });
  }

  touchPresence(scope: ProjectScope, pageId: string | null, now: Date): Promise<IdeaPresent[]> {
    return this.transactions.run(scope, async (tx) => {
      if (pageId !== null) {
        const page = await tx.ideaPage.findFirst({
          where: { id: pageId, projectId: scope.projectId },
          select: { id: true },
        });
        if (!page) throw validation("pageId", "Page inconnue.");
      }
      await tx.ideaPresence.upsert({
        where: { projectId_userId: { projectId: scope.projectId, userId: scope.userId } },
        create: {
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          userId: scope.userId,
          pageId,
          seenAt: now,
        },
        update: { pageId, seenAt: now },
      });
      const rows = await tx.ideaPresence.findMany({
        where: {
          projectId: scope.projectId,
          seenAt: { gt: new Date(now.getTime() - IDEA_PRESENCE_TTL_MS) },
        },
        select: { userId: true, pageId: true },
        orderBy: [{ seenAt: "desc" }, { userId: "asc" }],
      });
      const authors = await authorsOf(
        tx,
        scope.organizationId,
        rows.map((row) => row.userId),
      );
      return rows.flatMap((row) => {
        const author = authors.get(row.userId);
        return author ? [{ userId: row.userId, pageId: row.pageId, ...author }] : [];
      });
    });
  }

  snapshot(scope: ProjectScope): Promise<IdeaSnapshot> {
    return this.transactions.run(scope, async (tx) => {
      const rows = await tx.ideaPage.findMany({
        where: { projectId: scope.projectId, deletedAt: null },
        select: FULL,
        orderBy: [{ position: "asc" }, { slug: "asc" }],
      });
      const records = await recordsOf(tx, scope, rows);
      const last = await tx.ideaPublication.findFirst({
        where: { projectId: scope.projectId },
        orderBy: { publishedAt: "desc" },
        select: { pagesVersions: true, publishedAt: true },
      });
      const contributions = await tx.ideaPageContributor.findMany({
        where: { page: { projectId: scope.projectId, deletedAt: null } },
        select: { pageId: true, userId: true, lastAddedAt: true },
      });
      const names = await authorsOf(
        tx,
        scope.organizationId,
        contributions.map((c) => c.userId),
      );
      const published = Object.keys((last?.pagesVersions ?? {}) as Record<string, unknown>);
      const active = new Set(rows.map((row) => row.slug));
      return {
        pages: records.map((record) => ({
          ...record,
          contentMd: record.contentMd ?? "",
          contributorNames: contributions
            .filter((c) => c.pageId === record.id)
            .flatMap((c) => names.get(c.userId)?.name ?? [])
            .sort(),
        })),
        removedSlugs: published.filter((slug) => !active.has(slug)).sort(),
        contributorUserIds: [
          ...new Set(
            contributions
              .filter((c) => !last || c.lastAddedAt > last.publishedAt)
              .map((c) => c.userId),
          ),
        ].sort(),
      };
    });
  }
}
