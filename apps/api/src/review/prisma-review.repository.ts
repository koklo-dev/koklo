import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { NotificationEmitter } from "../notification/notification-emitter.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { conflict, notFound } from "../tracker/api-errors.ts";
import { recordAudit } from "../tracker/audit.ts";
import { keysetAfter, pageOfItems } from "../tracker/cursor.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ListReviews,
  ReviewActor,
  ReviewPage,
  ReviewRecord,
  ReviewRepository,
  SubmitReview,
  SubmittedReview,
} from "./review.repository.ts";

const SELECT = {
  id: true,
  targetKind: true,
  targetRef: true,
  sha: true,
  status: true,
  authorUserId: true,
  authorRole: true,
  comment: true,
  createdAt: true,
} as const;

/** Les écrans ne sont pas exposés (D2) : seules les cibles feature et baseline sont visibles. */
const VISIBLE = { targetKind: { not: "screen" } } as const;

type Row = Omit<ReviewRecord, "targetKind"> & { targetKind: string };
const recordOf = (row: Row): ReviewRecord => ({
  ...row,
  targetKind: row.targetKind === "baseline" ? "baseline" : "feature",
});

const staleVersion = () => new ORPCError("STALE_VERSION");
const spaceNotReady = () => new ORPCError("SPACE_NOT_READY");
/** Une baseline se valide tant qu'elle est proposée, et seulement à la version qu'elle propose. */
function assertOpen(baseline: { status: string; proposedSha: string }, headSha: string): void {
  if (baseline.status !== "proposed") throw conflict("baseline_not_open");
  if (baseline.proposedSha !== headSha) throw staleVersion();
}
const baselineNumber = (ref: string) => Number(ref.slice("baseline-".length));

/**
 * Journal `reviews` en base. Seul ce fichier écrit la table, par INSERT uniquement (le journal est
 * append-only, la base refuse aussi UPDATE et DELETE). Le commentaire est stocké et renvoyé tel
 * quel : il n'est ni journalisé, ni interpolé, ni copié dans l'audit ou les notifications.
 */
@Injectable()
export class PrismaReviewRepository implements ReviewRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(NotificationEmitter) private readonly notifications: NotificationEmitter,
  ) {}

  submit(scope: ProjectScope, actor: ReviewActor, input: SubmitReview): Promise<SubmittedReview> {
    return this.transactions.run(scope, async (tx) => {
      await this.lockAuthor(tx, scope, actor.role);
      const head = await this.head(tx, scope);
      const headSha = head.snapshot.commitSha;
      if (input.version !== headSha) throw staleVersion();
      const baseline = await this.assertTarget(tx, scope, head.snapshot.id, input);
      if (baseline?.status === "tagged") throw conflict("baseline_not_open");
      const same = await this.findReplay(tx, scope, input, headSha);
      if (same) return { record: same, headSha };
      if (baseline) assertOpen(baseline, headSha);
      const record = await this.insert(tx, scope, actor, head.repo.id, input, headSha);
      const validates = baseline !== null && input.status === "approved";
      if (validates) await this.validateBaseline(tx, baseline.id, headSha, record, actor.now);
      await this.notifications.reviewSubmitted(tx, scope, record.id);
      if (validates) {
        await this.notifications.baselineValidated(tx, scope, baselineNumber(input.targetRef));
      }
      await recordAudit(tx, scope, {
        action: input.status === "approved" ? "review.approve" : "review.request_changes",
        targetKind: "review",
        targetId: record.id,
      });
      return { record, headSha };
    });
  }

  list(scope: ProjectScope, query: ListReviews): Promise<ReviewPage> {
    return this.transactions.run(scope, async (tx) => {
      const rows = await tx.review.findMany({
        where: {
          projectId: scope.projectId,
          ...VISIBLE,
          ...(query.targetKind === undefined ? {} : { targetKind: query.targetKind }),
          ...(query.targetRef === undefined ? {} : { targetRef: query.targetRef }),
          ...(query.after ? keysetAfter("createdAt", query.after, "desc") : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: SELECT,
      });
      const page = pageOfItems(rows, query.limit, (row) => row.createdAt, recordOf);
      const found = await this.resolver.resolve(tx, scope, {});
      return {
        records: page.items,
        nextCursor: page.nextCursor,
        headSha: found && found.snapshot.status !== "failed" ? found.snapshot.commitSha : null,
      };
    });
  }

  /**
   * Verrou de ligne sur le membre auteur (un UPDATE sans effet, le client tenant refuse le SQL brut) :
   * deux validations du même auteur se suivent, le rejeu identique est donc exact. Le filtre sur le
   * rôle relu fait échouer le verrou si le rôle a changé entre-temps.
   */
  private async lockAuthor(tx: Tx, scope: ProjectScope, role: string): Promise<void> {
    const locked = await tx.member.updateMany({
      where: { organizationId: scope.organizationId, userId: scope.userId, role },
      data: { role },
    });
    if (locked.count === 0) throw notFound();
  }

  /** Tête lisible ; rien d'indexé ou indexation en échec : l'espace n'est pas prêt (aucun détail). */
  private async head(tx: Tx, scope: ProjectScope) {
    const found = await this.resolver.resolve(tx, scope, {});
    if (!found || found.snapshot.status === "failed") throw spaceNotReady();
    return found;
  }

  /** La cible doit exister dans ce projet : feature de la tête, ou baseline du projet (404 sinon). */
  private async assertTarget(tx: Tx, scope: ProjectScope, snapshotId: string, input: SubmitReview) {
    if (input.targetKind === "feature") {
      const feature = await tx.specFeature.findFirst({
        where: { snapshotId, specId: input.targetRef },
        select: { id: true },
      });
      if (!feature) throw notFound();
      return null;
    }
    const baseline = await tx.baseline.findFirst({
      where: { projectId: scope.projectId, number: baselineNumber(input.targetRef) },
      select: { id: true, status: true, proposedSha: true },
    });
    if (!baseline) throw notFound();
    return baseline;
  }

  private async insert(
    tx: Tx,
    scope: ProjectScope,
    actor: ReviewActor,
    repoId: string,
    input: SubmitReview,
    sha: string,
  ): Promise<ReviewRecord> {
    const row = await tx.review.create({
      data: {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        repoId,
        targetKind: input.targetKind,
        targetRef: input.targetRef,
        sha,
        status: input.status,
        authorUserId: scope.userId,
        authorRole: actor.role,
        comment: input.comment ?? null,
        createdAt: actor.now,
      },
      select: SELECT,
    });
    return recordOf(row);
  }

  /** Rejeu strictement identique à SA dernière review de la cible : cette ligne, rien d'écrit. */
  private async findReplay(
    tx: Tx,
    scope: ProjectScope,
    input: SubmitReview,
    headSha: string,
  ): Promise<ReviewRecord | null> {
    const last = await tx.review.findFirst({
      where: {
        projectId: scope.projectId,
        authorUserId: scope.userId,
        targetKind: input.targetKind,
        targetRef: input.targetRef,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SELECT,
    });
    const identical =
      last !== null &&
      last.sha === headSha &&
      last.status === input.status &&
      last.comment === (input.comment ?? null);
    return identical ? recordOf(last) : null;
  }

  /** Compare-and-set sur `proposed` : le perdant d'une approbation parallèle annule toute sa transaction. */
  private async validateBaseline(
    tx: Tx,
    baselineId: string,
    headSha: string,
    review: ReviewRecord,
    now: Date,
  ): Promise<void> {
    const { count } = await tx.baseline.updateMany({
      where: { id: baselineId, status: "proposed", proposedSha: headSha },
      data: { status: "validated", reviewId: review.id, validatedAt: now },
    });
    if (count === 0) throw conflict("baseline_not_open");
  }
}
