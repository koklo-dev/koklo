import { Injectable } from "@nestjs/common";
import { SUGGESTION_DECIDE_ROLES } from "../auth/roles.ts";
import { isProjectScoped } from "../project/project-access.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";

type Draft = {
  recipientUserId: string;
  type: string;
  subjectRef: string;
  dedupeKey: string;
};

/**
 * Émetteur unique des lignes `notifications` (TK-55c) : écrit dans la transaction de l'événement,
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
        subjectRef: suggestion.key,
        dedupeKey: `suggestion.decided:${scope.projectId}:${suggestion.key}:${suggestion.decision}`,
      },
    ]);
  }

  private async write(tx: Tx, scope: ProjectScope, drafts: Draft[]): Promise<void> {
    if (drafts.length === 0) return;
    await tx.notification.createMany({
      data: drafts.map((draft) => ({
        ...draft,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        subjectKind: "suggestion",
      })),
      skipDuplicates: true,
    });
  }
}
