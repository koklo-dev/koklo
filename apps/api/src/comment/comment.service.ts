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
  type CommentTicket,
} from "./comment.repository.ts";

/** Valeur de `authorId` d'un commentaire sans auteur (ligne système : `author_id` NULL). */
export const SYSTEM_AUTHOR_ID = "system";

interface CommentListInput {
  targetKind: string;
  targetId: string;
  limit?: number | undefined;
  cursor?: string | undefined;
}

const outputOf = (comment: CommentRecord): CommentOutput => ({
  id: comment.id,
  targetKind: "ticket",
  targetId: comment.targetId,
  authorKind: comment.authorKind,
  authorId: comment.authorId ?? SYSTEM_AUTHOR_ID,
  body: comment.body,
  createdAt: comment.createdAt.toISOString(),
});

/**
 * Cible d'un commentaire : seul le ticket existe en base, il doit appartenir au projet courant
 * (`NOT_FOUND` sinon, sans fuite). Le contrat type la cible en chaîne libre : l'API la valide.
 */
async function requireTarget(
  store: CommentStore,
  target: { targetKind: string; targetId: string },
): Promise<CommentTicket> {
  if (target.targetKind !== "ticket") {
    throw validation("targetKind", "Seuls les commentaires de ticket sont pris en charge");
  }
  if (!isUuid(target.targetId)) {
    throw validation("targetId", "targetId doit être un UUID");
  }
  return orNotFound(await store.findTicket(target.targetId));
}

/** Le client commente en tant que `client`, les autres rôles en tant qu'humains (jamais de l'entrée). */
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
      const ticket = await requireTarget(store, input);
      const comment = await store.insert({
        ticketId: ticket.id,
        authorKind: authorKindOf(role),
        authorId: scope.userId,
        body: input.body,
      });
      await store.audit("comment.create", comment, ticket.id);
      return outputOf(comment);
    });
  }

  list(scope: ProjectScope, input: CommentListInput) {
    return this.repository.run(scope, async (store) => {
      const ticket = await requireTarget(store, input);
      const page = await store.list(
        ticket.id,
        input.limit ?? DEFAULT_PAGE_SIZE,
        positionOf(input.cursor),
      );
      return { items: page.items.map(outputOf), nextCursor: page.nextCursor };
    });
  }

  /** L'appartenance au projet précède le droit : un commentaire hors projet reste `NOT_FOUND`. */
  delete(scope: ProjectScope, role: string | undefined, id: string) {
    const now = new Date(this.clock.now());
    return this.repository.run(scope, async (store) => {
      const comment = orNotFound(await store.find(id));
      await requireTarget(store, { targetKind: "ticket", targetId: comment.targetId });
      const isAuthor = comment.authorId === scope.userId;
      if (!isAuthor && !COMMENT_DELETE_ANY_ROLES.some((allowed) => allowed === role)) {
        throw new ORPCError("FORBIDDEN", { message: "Accès refusé" });
      }
      orNotFound((await store.markDeleted(id, now)) || null);
      await store.audit("comment.delete", comment, comment.targetId);
      return { id };
    });
  }
}
