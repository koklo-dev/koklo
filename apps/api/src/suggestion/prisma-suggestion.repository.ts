import { Inject, Injectable } from "@nestjs/common";
import { CLIENT_ROLE } from "../auth/roles.ts";
import { NotificationEmitter } from "../notification/notification-emitter.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { conflict, notFound } from "../tracker/api-errors.ts";
import { recordAudit } from "../tracker/audit.ts";
import { nextCounterValue } from "../tracker/counters.ts";
import { keysetAfter, pageOfItems } from "../tracker/cursor.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  CreateSuggestion,
  ListSuggestions,
  SuggestionActor,
  SuggestionPage,
  SuggestionRecord,
  SuggestionRepository,
  SuggestionView,
} from "./suggestion.repository.ts";

/** Plafonds de suggestions ouvertes : par auteur et par projet, puis par projet (TK-55c). */
const OPEN_PER_AUTHOR = 50;
const OPEN_PER_PROJECT = 500;

const SELECT = {
  id: true,
  key: true,
  targetKind: true,
  targetRef: true,
  body: true,
  status: true,
  decisionNote: true,
  authorUserId: true,
  authorRole: true,
  baseSha: true,
  createdAt: true,
  decidedAt: true,
} as const;

/** Les écrans ne sont pas exposés (D2) : seules les cibles feature et projet sont visibles. */
const VISIBLE = { targetKind: { not: "screen" } } as const;

type Row = Omit<SuggestionRecord, "targetKind"> & { targetKind: string };
const recordOf = (row: Row): SuggestionRecord => ({
  ...row,
  targetKind: row.targetKind === "feature" ? "feature" : "project",
});

const audit = (tx: Tx, scope: ProjectScope, action: string, id: string) =>
  recordAudit(tx, scope, { action, targetKind: "suggestion", targetId: id });

/**
 * Suggestions en base. Les notifications passent par `NotificationEmitter`, jamais par la table ;
 * le texte libre (corps, note) n'est ni journalisé ni interpolé, seulement stocké et renvoyé.
 */
@Injectable()
export class PrismaSuggestionRepository implements SuggestionRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(NotificationEmitter) private readonly notifications: NotificationEmitter,
  ) {}

  create(
    scope: ProjectScope,
    actor: SuggestionActor,
    input: CreateSuggestion,
  ): Promise<SuggestionView> {
    return this.transactions.run(scope, async (tx) => {
      await this.lockAuthor(tx, scope, actor.role);
      if (actor.role === CLIENT_ROLE && (await this.framingIsClosed(tx, scope))) {
        throw conflict("framing_closed");
      }
      const snapshot = await this.snapshot(tx, scope);
      const headSha = snapshot?.commitSha ?? null;
      if (input.targetKind === "feature") {
        await this.assertFeature(tx, snapshot?.id, input.targetRef);
      }
      const same = await this.findOpenTwin(tx, scope, input);
      if (same) return { record: same, headSha };
      await this.assertAuthorQuota(tx, scope);
      // Le compteur verrouille la ligne du projet : le total ouvert est exact jusqu'à la fin.
      const key = `SG-${await nextCounterValue(tx, scope, "suggestion")}`;
      await this.assertProjectQuota(tx, scope);
      const record = await tx.suggestion.create({
        data: {
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          key,
          targetKind: input.targetKind,
          targetRef: input.targetRef ?? null,
          body: input.body,
          authorUserId: scope.userId,
          authorRole: actor.role,
          baseSha: headSha,
        },
        select: SELECT,
      });
      await this.notifications.suggestionCreated(tx, scope, key);
      await audit(tx, scope, "suggestion.create", record.id);
      return { record: recordOf(record), headSha };
    });
  }

  list(scope: ProjectScope, query: ListSuggestions): Promise<SuggestionPage> {
    return this.transactions.run(scope, async (tx) => {
      const rows = await tx.suggestion.findMany({
        where: {
          projectId: scope.projectId,
          ...VISIBLE,
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.targetRef === undefined ? {} : { targetRef: query.targetRef }),
          ...(query.after ? keysetAfter("createdAt", query.after, "desc") : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: SELECT,
      });
      const page = pageOfItems(rows, query.limit, (row) => row.createdAt, recordOf);
      return {
        records: page.items,
        nextCursor: page.nextCursor,
        headSha: await this.headSha(tx, scope),
      };
    });
  }

  withdraw(scope: ProjectScope, actor: SuggestionActor, id: string): Promise<SuggestionView> {
    return this.transactions.run(scope, async (tx) => {
      const { count } = await tx.suggestion.updateMany({
        where: {
          id,
          projectId: scope.projectId,
          authorUserId: scope.userId,
          status: "open",
          ...VISIBLE,
        },
        data: { status: "withdrawn", decidedAt: actor.now },
      });
      if (count > 0) await audit(tx, scope, "suggestion.withdraw", id);
      const record = await tx.suggestion.findFirst({
        where: { id, projectId: scope.projectId, ...VISIBLE },
        select: SELECT,
      });
      // Un non-auteur ne distingue pas « n'existe pas » de « pas la mienne » (404 uniforme).
      if (!record || record.authorUserId !== scope.userId) throw notFound();
      if (record.status !== "withdrawn") throw conflict("suggestion_not_open");
      return { record: recordOf(record), headSha: await this.headSha(tx, scope) };
    });
  }

  decide(
    scope: ProjectScope,
    actor: SuggestionActor,
    id: string,
    decision: { status: "accepted" | "rejected"; note?: string | undefined },
  ): Promise<SuggestionView> {
    return this.transactions.run(scope, async (tx) => {
      const { count } = await tx.suggestion.updateMany({
        where: { id, projectId: scope.projectId, status: "open", ...VISIBLE },
        data: {
          status: decision.status,
          decidedByUserId: scope.userId,
          decidedAt: actor.now,
          decisionNote: decision.note ?? null,
        },
      });
      const record = await tx.suggestion.findFirst({
        where: { id, projectId: scope.projectId, ...VISIBLE },
        select: SELECT,
      });
      if (!record) throw notFound();
      if (record.status !== decision.status) throw conflict("suggestion_not_open");
      if (count > 0) {
        await this.notifications.suggestionDecided(tx, scope, {
          key: record.key,
          authorUserId: record.authorUserId,
          decision: decision.status,
        });
        await audit(
          tx,
          scope,
          `suggestion.${decision.status === "accepted" ? "accept" : "reject"}`,
          id,
        );
      }
      return { record: recordOf(record), headSha: await this.headSha(tx, scope) };
    });
  }

  /**
   * Verrou de ligne sur le membre auteur (un UPDATE sans effet, le client tenant refuse le SQL brut) :
   * deux créations du même auteur se suivent, le doublon et le quota par auteur sont donc exacts.
   * Le filtre sur le rôle relu fait échouer le verrou si le rôle a changé entre-temps.
   */
  private async lockAuthor(tx: Tx, scope: ProjectScope, role: string): Promise<void> {
    const locked = await tx.member.updateMany({
      where: { organizationId: scope.organizationId, userId: scope.userId, role },
      data: { role },
    });
    if (locked.count === 0) throw notFound();
  }

  private async framingIsClosed(tx: Tx, scope: ProjectScope): Promise<boolean> {
    const tagged = await tx.baseline.findFirst({
      where: { projectId: scope.projectId, status: "tagged" },
      select: { id: true },
    });
    return tagged !== null;
  }

  private async assertFeature(tx: Tx, snapshotId: string | undefined, specId = ""): Promise<void> {
    const feature = snapshotId
      ? await tx.specFeature.findFirst({ where: { snapshotId, specId }, select: { id: true } })
      : null;
    if (!feature) throw notFound();
  }

  /** Doublon exact encore ouvert du même auteur : renvoyé tel quel (idempotence du double clic). */
  private async findOpenTwin(
    tx: Tx,
    scope: ProjectScope,
    input: CreateSuggestion,
  ): Promise<SuggestionRecord | null> {
    const row = await tx.suggestion.findFirst({
      where: {
        projectId: scope.projectId,
        authorUserId: scope.userId,
        status: "open",
        targetKind: input.targetKind,
        targetRef: input.targetRef ?? null,
        body: input.body,
      },
      select: SELECT,
    });
    return row && recordOf(row);
  }

  private async assertAuthorQuota(tx: Tx, scope: ProjectScope): Promise<void> {
    const mine = await tx.suggestion.count({
      where: { projectId: scope.projectId, authorUserId: scope.userId, status: "open" },
    });
    if (mine >= OPEN_PER_AUTHOR) throw conflict("suggestion_quota");
  }

  private async assertProjectQuota(tx: Tx, scope: ProjectScope): Promise<void> {
    const open = await tx.suggestion.count({
      where: { projectId: scope.projectId, status: "open" },
    });
    if (open >= OPEN_PER_PROJECT) throw conflict("suggestion_quota");
  }

  /** Instantané lisible de la tête courante, `null` si rien n'est indexé ou si l'index a échoué. */
  private async snapshot(tx: Tx, scope: ProjectScope) {
    const found = await this.resolver.resolve(tx, scope, {});
    return found && found.snapshot.status !== "failed" ? found.snapshot : null;
  }

  private async headSha(tx: Tx, scope: ProjectScope): Promise<string | null> {
    return (await this.snapshot(tx, scope))?.commitSha ?? null;
  }
}
