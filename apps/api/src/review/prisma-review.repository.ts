import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { CLIENT_ROLE } from "../auth/roles.ts";
import { isCahierComplete, progressOf } from "../client-space/client-space-progress.ts";
import { NotificationEmitter } from "../notification/notification-emitter.ts";
import { hasLinkedClient } from "../project/client-presence.ts";
import { type Snapshot, SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { conflict, forbidden, notFound } from "../tracker/api-errors.ts";
import { recordAudit } from "../tracker/audit.ts";
import { keysetAfter, pageOfItems } from "../tracker/cursor.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { entityHashesOf } from "./entity-hashes.ts";
import { remindClients } from "./prisma-review-remind.ts";
import type {
  ListReviews,
  RemindedClients,
  ReviewActor,
  ReviewPage,
  ReviewRecord,
  ReviewRepository,
  SubmitReview,
  SubmittedReview,
} from "./review.repository.ts";
import { canReview, clientListFilter } from "./review-policy.ts";
import { readStatusFacts } from "./status-facts.ts";
import { type EntityHash, targetHashOf } from "./target-hash.ts";

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
  version: { select: { contentHash: true } },
} as const;

/** Les écrans ne sont pas exposés (D2) : seules les cibles feature et baseline sont visibles. */
const VISIBLE = { targetKind: { not: "screen" } } as const;

type Row = Omit<ReviewRecord, "targetKind" | "contentHash"> & {
  targetKind: ReviewRecord["targetKind"] | "screen";
  version: { contentHash: string } | null;
};
function recordOf({ version, ...row }: Row): ReviewRecord {
  return {
    ...row,
    targetKind: row.targetKind as ReviewRecord["targetKind"],
    contentHash: version?.contentHash ?? null,
  };
}

const AUDIT_ACTION = {
  approved: "review.approve",
  changes_requested: "review.request_changes",
  withdrawn: "review.withdraw",
} as const;

/** Décision sur le cahier entier : « Valider le cahier » ou « Envoyer mes demandes » (B351). */
const isCahierDecision = (input: SubmitReview): boolean =>
  input.targetKind === "deliverable" &&
  input.targetRef === "functional" &&
  input.status !== "withdrawn";

const staleVersion = () => new ORPCError("STALE_VERSION");
const spaceNotReady = () => new ORPCError("SPACE_NOT_READY");
/** Une baseline se valide tant qu'elle est proposée, et seulement à la version qu'elle propose. */
function assertOpen(baseline: { status: string; proposedSha: string }, headSha: string): void {
  if (baseline.status !== "proposed") throw conflict("baseline_not_open");
  if (baseline.proposedSha !== headSha) throw staleVersion();
}
/**
 * Une baseline taguée est refusée avant le rejeu (une review identique antérieure ne la rouvre pas) ; une baseline ne
 * s'annule pas : son passage à `validated` est définitif (B349).
 */
function assertBaselineAllowsDecision(
  baseline: { status: string } | null,
  input: SubmitReview,
): void {
  if (baseline && (baseline.status === "tagged" || input.status === "withdrawn")) {
    throw conflict("baseline_not_open");
  }
}
const baselineNumber = (ref: string) => Number(ref.slice("baseline-".length));

/**
 * Journal `reviews` en base. Seul ce fichier écrit la table, par INSERT uniquement (le journal est
 * append-only, la base refuse aussi UPDATE et DELETE), avec sa ligne annexe `review_versions` (hachage du contenu validé).
 * Le commentaire est stocké et renvoyé tel quel : il n'est ni journalisé, ni interpolé, ni copié dans l'audit ou les
 * notifications.
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
      await this.assertMayReview(tx, scope, actor.role, input);
      const head = await this.head(tx, scope);
      const headSha = head.snapshot.commitSha;
      if (input.version !== headSha) throw staleVersion();
      const { baseline, hash } = await this.assertTarget(tx, scope, head.snapshot.id, input);
      assertBaselineAllowsDecision(baseline, input);
      const same = await this.findReplay(tx, scope, input, { headSha, hash });
      if (same) return { record: same, headSha, currentHash: hash };
      if (isCahierDecision(input)) await this.assertCahierComplete(tx, scope, head.snapshot, input);
      if (baseline) assertOpen(baseline, headSha);
      const record = await this.insert(tx, scope, actor, head.repo.id, input, {
        sha: headSha,
        hash,
      });
      await this.settle(tx, scope, record, { baseline, now: actor.now, headSha });
      return { record, headSha, currentHash: hash };
    });
  }

  /** Suites de l'écriture : passage de la baseline approuvée à `validated`, puis notifications et audit. */
  private async settle(
    tx: Tx,
    scope: ProjectScope,
    record: ReviewRecord,
    context: { baseline: { id: string } | null; now: Date; headSha: string },
  ): Promise<void> {
    const { baseline } = context;
    const validates = baseline !== null && record.status === "approved";
    if (validates)
      await this.validateBaseline(tx, baseline.id, context.headSha, record, context.now);
    await this.announce(tx, scope, record, validates ? baselineNumber(record.targetRef) : null);
  }

  /**
   * Relance (B352) : une notification par client lié et par jour, un audit par client réellement relancé. Le droit (owner,
   * admin) est vérifié par le garde de route ; sans client invité, `no_client`.
   */
  remind(scope: ProjectScope, now: Date): Promise<RemindedClients> {
    return this.transactions.run(scope, (tx) => remindClients(tx, this.notifications, scope, now));
  }

  list(scope: ProjectScope, query: ListReviews): Promise<ReviewPage> {
    return this.transactions.run(scope, async (tx) => {
      const rows = await tx.review.findMany({
        where: {
          projectId: scope.projectId,
          ...VISIBLE,
          ...(query.clientOnly ? clientListFilter() : {}),
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
      const usable = found && found.snapshot.status !== "failed" ? found : null;
      const entities = usable ? await entityHashesOf(tx, usable.snapshot.id) : [];
      return {
        records: page.items,
        nextCursor: page.nextCursor,
        headSha: usable?.snapshot.commitSha ?? null,
        currentHashes: new Map(
          page.items.map((record) => [
            `${record.targetKind}:${record.targetRef}`,
            targetHashOf(entities, record.targetKind, record.targetRef),
          ]),
        ),
      };
    });
  }

  /**
   * Garde de complétude (B351), après la politique et avant l'écriture : toutes les unités du cahier traitées sur le
   * contenu courant ; `review_incomplete` sinon, sans rien écrire.
   */
  private async assertCahierComplete(
    tx: Tx,
    scope: ProjectScope,
    snapshot: Snapshot,
    input: SubmitReview,
  ): Promise<void> {
    const progress = progressOf(await readStatusFacts(tx, scope, snapshot));
    const decision = input.status === "approved" ? "approved" : "changes_requested";
    if (!isCahierComplete(progress, decision)) throw conflict("review_incomplete");
  }

  /**
   * Politique par cible (D1, B325 d) : décidée ici d'après le lien client du projet, jamais l'entrée. Placée avant toute
   * lecture de la cible : un refus ne dit rien de son existence.
   */
  private async assertMayReview(
    tx: Tx,
    scope: ProjectScope,
    role: string,
    input: SubmitReview,
  ): Promise<void> {
    const hasClient = await hasLinkedClient(tx, scope.projectId);
    if (!canReview(role, input.targetKind, input.targetRef, hasClient)) throw forbidden();
  }

  /**
   * Notifications puis audit, dans la transaction de l'écriture (`validatedNumber` : baseline validée). Seule la validation
   * du client prévient l'équipe ; celle de l'équipe elle-même ne notifie personne. L'audit cible la review : son rôle
   * d'auteur dit si elle a été posée à la place du client.
   */
  private async announce(
    tx: Tx,
    scope: ProjectScope,
    record: ReviewRecord,
    validatedNumber: number | null,
  ): Promise<void> {
    // Annuler une décision (B349) ne prévient personne : la cible redevient seulement à valider.
    if (record.authorRole === CLIENT_ROLE && record.status !== "withdrawn") {
      await this.notifications.reviewSubmitted(tx, scope, record.id);
    }
    if (validatedNumber !== null) {
      await this.notifications.baselineValidated(tx, scope, validatedNumber);
    }
    await recordAudit(tx, scope, {
      action: AUDIT_ACTION[record.status],
      targetKind: "review",
      targetId: record.id,
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

  /**
   * La cible doit exister dans ce projet (404 sinon) : fonctionnalité de la tête, baseline du projet, ou entité indexée
   * (parcours, bloc de règles, rôles, livrable). Rend aussi son hachage courant : `null` pour une baseline et pour une
   * fonctionnalité d'un snapshot d'avant TK-100 (la validation retombe sur le SHA).
   */
  private async assertTarget(tx: Tx, scope: ProjectScope, snapshotId: string, input: SubmitReview) {
    if (input.targetKind === "baseline") {
      const baseline = await tx.baseline.findFirst({
        where: { projectId: scope.projectId, number: baselineNumber(input.targetRef) },
        select: { id: true, status: true, proposedSha: true },
      });
      if (!baseline) throw notFound();
      return { baseline, hash: null };
    }
    const entities = await entityHashesOf(tx, snapshotId);
    const hash = targetHashOf(entities, input.targetKind, input.targetRef);
    if (input.targetKind === "feature") {
      await this.assertFeature(tx, snapshotId, input.targetRef, entities);
    } else if (hash === null) {
      throw notFound();
    }
    return { baseline: null, hash };
  }

  private async assertFeature(
    tx: Tx,
    snapshotId: string,
    specId: string,
    entities: readonly EntityHash[],
  ): Promise<void> {
    if (entities.some((entity) => entity.kind === "feature" && entity.specId === specId)) return;
    const feature = await tx.specFeature.findFirst({
      where: { snapshotId, specId },
      select: { id: true },
    });
    if (!feature) throw notFound();
  }

  private async insert(
    tx: Tx,
    scope: ProjectScope,
    actor: ReviewActor,
    repoId: string,
    input: SubmitReview,
    version: { sha: string; hash: string | null },
  ): Promise<ReviewRecord> {
    const row = await tx.review.create({
      data: {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        repoId,
        targetKind: input.targetKind,
        targetRef: input.targetRef,
        sha: version.sha,
        status: input.status,
        authorUserId: scope.userId,
        authorRole: actor.role,
        comment: input.comment ?? null,
        createdAt: actor.now,
        ...(version.hash === null ? {} : { version: { create: { contentHash: version.hash } } }),
      },
      select: SELECT,
    });
    return recordOf(row);
  }

  /**
   * Rejeu strictement identique à SA dernière review de la cible : cette ligne, rien d'écrit. « Identique » = même
   * contenu (hachage) quand la cible en a un, sinon même tête de spec.
   */
  private async findReplay(
    tx: Tx,
    scope: ProjectScope,
    input: SubmitReview,
    current: { headSha: string; hash: string | null },
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
    if (last === null) return null;
    const sameContent =
      current.hash !== null && last.version !== null
        ? last.version.contentHash === current.hash
        : last.sha === current.headSha;
    const identical =
      sameContent && last.status === input.status && last.comment === (input.comment ?? null);
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
