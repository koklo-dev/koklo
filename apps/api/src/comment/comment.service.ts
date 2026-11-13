import type { CommentCreateInput, CommentOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { COMMENT_DELETE_ANY_ROLES } from "../auth/roles.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { orNotFound, validation } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE, positionOf } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { isUuid } from "../tracker/uuid.ts";
import {
  COMMENT_REPOSITORY,
  type CommentRecord,
  type CommentRepository,
  type CommentStore,
  type CommentTarget,
  type CommentTicket,
} from "./comment.repository.ts";

/** Valeur de `authorId` d'un commentaire sans auteur (ligne système : `author_id` NULL). */
export const SYSTEM_AUTHOR_ID = "system";

interface CommentListInput {
  targetKind: string;
  targetId?: string | undefined;
  targetRef?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

const outputOf = (comment: CommentRecord): CommentOutput => ({
  id: comment.id,
  targetKind: comment.targetKind,
  targetId: comment.targetId,
  ...(comment.targetRef === null ? {} : { targetRef: comment.targetRef }),
  authorKind: comment.authorKind,
  authorId: comment.authorId ?? SYSTEM_AUTHOR_ID,
  body: comment.body,
  createdAt: comment.createdAt.toISOString(),
});

const TABLE_REF = /^T-[a-z0-9][a-z0-9-]*$/;

/**
 * Cible d'un commentaire : un ticket du projet courant, ou une table de la tête de spec (`NOT_FOUND` sinon, sans fuite). Le
 * contrat type la cible en chaîne libre : l'API la valide.
 */
async function requireTarget(store: CommentStore, input: CommentListInput): Promise<CommentTarget> {
  if (input.targetKind === "table") {
    const ref = input.targetRef;
    if (ref === undefined || !TABLE_REF.test(ref)) {
      throw validation("targetRef", "targetRef doit être un identifiant de table (T-slug)");
    }
    orNotFound((await store.tableExists(ref)) || null);
    return { kind: "table", ref };
  }
  if (input.targetKind !== "ticket") {
    throw validation(
      "targetKind",
      "Seuls les commentaires de ticket et de table sont pris en charge",
    );
  }
  if (input.targetId === undefined || !isUuid(input.targetId)) {
    throw validation("targetId", "targetId doit être un UUID");
  }
  const ticket: CommentTicket = orNotFound(await store.findTicket(input.targetId));
  return { kind: "ticket", ticketId: ticket.id };
}

/** Les commentaires de table sont les remarques du client à l'équipe : seule l'équipe qui les traite les liste. */
const TABLE_READ_ROLES = ["owner", "admin", "dev", "designer"];

/** Le client commente en tant que `client`, les autres rôles en tant qu'humains (jamais de l'entrée). */
const ticketOf = (target: CommentTarget) => (target.kind === "ticket" ? target.ticketId : null);

const authorKindOf = (role: string | undefined) => (role === "client" ? "client" : "human");

/** Commentaires de ticket : auteur déduit de la session, suppression logique, audit transactionnel. */
@Injectable()
export class CommentService {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly repository: CommentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  create(scope: ProjectScope, role: string | undefined, input: CommentCreateInput) {
    return this.repository.run(scope, async (store) => {
      const target = await requireTarget(store, input);
      const comment = await store.insert({
        target,
        authorKind: authorKindOf(role),
        authorId: scope.userId,
        body: input.body,
      });
      await store.audit("comment.create", comment, ticketOf(target));
      return outputOf(comment);
    });
  }

  list(scope: ProjectScope, role: string | undefined, input: CommentListInput) {
    if (input.targetKind === "table" && !TABLE_READ_ROLES.some((allowed) => allowed === role)) {
      throw new ORPCError("FORBIDDEN", { message: "Accès refusé" });
    }
    return this.repository.run(scope, async (store) => {
      const target = await requireTarget(store, input);
      const page = await store.list(
        target,
        input.limit ?? DEFAULT_PAGE_SIZE,
        positionOf(input.cursor),
      );
      return { items: page.items.map(outputOf), nextCursor: page.nextCursor };
    });
  }

  /** Un commentaire de table se supprime même si la table a quitté le modèle ; il doit être de ce projet. */
  private async deletionTarget(
    store: CommentStore,
    scope: ProjectScope,
    comment: CommentRecord,
  ): Promise<CommentTarget> {
    if (comment.targetKind === "table") {
      orNotFound(comment.targetId === scope.projectId || null);
      return { kind: "table", ref: comment.targetRef ?? "" };
    }
    return requireTarget(store, { targetKind: "ticket", targetId: comment.targetId });
  }

  /** L'appartenance au projet précède le droit : un commentaire hors projet reste `NOT_FOUND`. */
  delete(scope: ProjectScope, role: string | undefined, id: string) {
    const now = new Date(this.clock.now());
    return this.repository.run(scope, async (store) => {
      const comment = orNotFound(await store.find(id));
      const target = await this.deletionTarget(store, scope, comment);
      const isAuthor = comment.authorId === scope.userId;
      if (!isAuthor && !COMMENT_DELETE_ANY_ROLES.some((allowed) => allowed === role)) {
        throw new ORPCError("FORBIDDEN", { message: "Accès refusé" });
      }
      orNotFound((await store.markDeleted(id, now)) || null);
      await store.audit("comment.delete", comment, ticketOf(target));
      return { id };
    });
  }
}
