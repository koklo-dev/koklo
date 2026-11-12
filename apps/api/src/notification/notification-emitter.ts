import { Injectable } from "@nestjs/common";
import { REVIEW_NOTIFIED_ROLES, SUGGESTION_DECIDE_ROLES } from "../auth/roles.ts";
import { isProjectScoped } from "../project/project-access.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";

type Draft = {
  recipientUserId: string;
  type: string;
  subjectKind: "suggestion" | "review" | "baseline";
  subjectRef: string;
  dedupeKey: string;
};

/**
 * Émetteur unique des lignes `notifications` (TK-55c, TK-55d) : écrit dans la transaction de l'événement,
 * sans contenu libre (type, sujet, clé de dédoublonnage), `email_state` à `pending` par défaut. Le
 * projet figure dans la clé de dédoublonnage, la contrainte d'unicité n'en portant pas.
 */
@Injectable()
export class NotificationEmitter {
  /** `suggestion.created` : owner, admin et dev de l'organisation, hors l'auteur. */
  async suggestionCreated(tx: Tx, scope: ProjectScope, key: string): Promise<void> {
    const members = await tx.member.findMany({
      where: {
        organizationId: scope.organizationId,
        role: { in: [...SUGGESTION_DECIDE_ROLES] },
        userId: { not: scope.userId },
      },
      select: { userId: true },
    });
    await this.write(
      tx,
      scope,
      members.map(({ userId }) => ({
        recipientUserId: userId,
        type: "suggestion.created",
        subjectKind: "suggestion",
        subjectRef: key,
        dedupeKey: `suggestion.created:${scope.projectId}:${key}`,
      })),
    );
  }

  /**
   * `suggestion.decided` : l'auteur, s'il est encore membre (et encore lié au projet, s'il est
   * cloisonné) et s'il n'est pas lui-même le décideur. Sinon personne, sans erreur.
   */
  async suggestionDecided(
    tx: Tx,
    scope: ProjectScope,
    suggestion: { key: string; authorUserId: string | null; decision: "accepted" | "rejected" },
  ): Promise<void> {
    const { authorUserId } = suggestion;
    if (authorUserId === null || authorUserId === scope.userId) return;
    const member = await tx.member.findFirst({
      where: { organizationId: scope.organizationId, userId: authorUserId },
      select: { role: true },
    });
    if (!member) return;
    if (isProjectScoped(member.role)) {
      const link = await tx.projectClientAccess.findFirst({
        where: { projectId: scope.projectId, userId: authorUserId },
        select: { id: true },
      });
      if (!link) return;
    }
    await this.write(tx, scope, [
      {
        recipientUserId: authorUserId,
        type: "suggestion.decided",
        subjectKind: "suggestion",
        subjectRef: suggestion.key,
        dedupeKey: `suggestion.decided:${scope.projectId}:${suggestion.key}:${suggestion.decision}`,
      },
    ]);
  }

  /** `review.submitted` : l'équipe qui décide de la suite (jamais le business, un client ni l'auteur). */
  async reviewSubmitted(tx: Tx, scope: ProjectScope, reviewId: string): Promise<void> {
    await this.write(
      tx,
      scope,
      (await this.team(tx, scope)).map((recipientUserId) => ({
        recipientUserId,
        type: "review.submitted",
        subjectKind: "review",
        subjectRef: reviewId,
        dedupeKey: `review.submitted:${scope.projectId}:${reviewId}`,
      })),
    );
  }

  /** `baseline.validated` : la même équipe, quand le client approuve une baseline proposée. */
  async baselineValidated(tx: Tx, scope: ProjectScope, number: number): Promise<void> {
    await this.write(
      tx,
      scope,
      (await this.team(tx, scope)).map((recipientUserId) => ({
        recipientUserId,
        type: "baseline.validated",
        subjectKind: "baseline",
        subjectRef: `baseline-${number}`,
        dedupeKey: `baseline.validated:${scope.projectId}:${number}`,
      })),
    );
  }

  /**
   * `review.reminded` (B352) : une notification par client lié et par jour (la date est dans la clé de dédoublonnage), rien
   * de libre. Rend les liens réellement notifiés par cet appel : un rejeu du même jour n'en rend aucun.
   */
  async reviewReminded<L extends { id: string; userId: string }>(
    tx: Tx,
    scope: ProjectScope,
    links: readonly L[],
    day: string,
  ): Promise<L[]> {
    const drafts = links.map((link) => ({
      link,
      draft: {
        recipientUserId: link.userId,
        type: "review.reminded",
        subjectKind: "review" as const,
        subjectRef: scope.projectId,
        dedupeKey: `review.reminded:${scope.projectId}:${link.userId}:${day}`,
      },
    }));
    const known = await tx.notification.findMany({
      where: {
        organizationId: scope.organizationId,
        dedupeKey: { in: drafts.map(({ draft }) => draft.dedupeKey) },
      },
      select: { dedupeKey: true },
    });
    const seen = new Set(known.map((row) => row.dedupeKey));
    const fresh = drafts.filter(({ draft }) => !seen.has(draft.dedupeKey));
    await this.write(
      tx,
      scope,
      fresh.map(({ draft }) => draft),
    );
    return fresh.map(({ link }) => link);
  }

  private async team(tx: Tx, scope: ProjectScope): Promise<string[]> {
    const members = await tx.member.findMany({
      where: {
        organizationId: scope.organizationId,
        role: { in: [...REVIEW_NOTIFIED_ROLES] },
        userId: { not: scope.userId },
      },
      select: { userId: true },
    });
    return members.map(({ userId }) => userId);
  }

  private async write(tx: Tx, scope: ProjectScope, drafts: Draft[]): Promise<void> {
    if (drafts.length === 0) return;
    await tx.notification.createMany({
      data: drafts.map((draft) => ({
        ...draft,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
      })),
      skipDuplicates: true,
    });
  }
}
