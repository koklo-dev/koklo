import type { CommentCreateInput, CommentOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { COMMENT_DELETE_ANY_ROLES } from "../auth/roles.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { SpecTechnicalService } from "../spec-technical/spec-technical.service.ts";
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
  type RefKind,
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

/** Forme de l'identifiant de chaque genre de cible repérée par `targetRef`, et le message de l'erreur de validation. */
const REF_SHAPES: Record<RefKind, { pattern: RegExp; label: string }> = {
  table: { pattern: /^T-[a-z0-9][a-z0-9-]*$/, label: "de table (T-slug)" },
  component: { pattern: /^C-[a-z0-9][a-z0-9-]*$/, label: "de composant (C-slug)" },
  adr: { pattern: /^ADR-\d{3,}$/, label: "de décision (ADR-nnn)" },
  archflow: { pattern: /^P-[a-z0-9][a-z0-9-]*$/, label: "de flux (P-slug)" },
  stack: { pattern: /^ST-[a-z0-9][a-z0-9-]*$/, label: "de choix technique (ST-slug)" },
  environments: { pattern: /^environments$/, label: "du bloc des environnements (environments)" },
  tech_section: { pattern: /^DOC-[a-z0-9][a-z0-9-]*$/, label: "de section (DOC-slug)" },
  operation: {
    pattern: /^[a-z0-9][A-Za-z0-9_-]*\.[a-z0-9][A-Za-z0-9_-]*$/,
    label: "d'opération (zone.verbe)",
  },
  requirements: { pattern: /^requirements$/, label: "du bloc des exigences (requirements)" },
};
const isRefKind = (kind: string): kind is RefKind => kind in REF_SHAPES;

/**
 * Cible d'un commentaire : un ticket du projet, ou un élément de la tête de spec (`NOT_FOUND` sinon, sans fuite). Le
 * contrat type la cible en chaîne libre : l'API la valide. Une section du cahier technique, lue en Git, est vérifiée par
 * l'appelant avant la transaction (`sections`).
 */
async function requireTarget(
  store: CommentStore,
  input: CommentListInput,
  sections: ReadonlySet<string> = new Set(),
): Promise<CommentTarget> {
  const kind = input.targetKind;
  if (isRefKind(kind)) {
    const ref = input.targetRef;
    const shape = REF_SHAPES[kind];
    if (ref === undefined || !shape.pattern.test(ref)) {
      throw validation("targetRef", `targetRef doit être un identifiant ${shape.label}`);
    }
    const exists = kind === "tech_section" ? sections.has(ref) : await store.refExists(kind, ref);
    orNotFound(exists || null);
    return { kind, ref };
  }
  if (kind !== "ticket") {
    throw validation(
      "targetKind",
      "Seuls les commentaires d'un ticket ou d'un élément de la spec sont pris en charge",
    );
  }
  if (input.targetId === undefined || !isUuid(input.targetId)) {
    throw validation("targetId", "targetId doit être un UUID");
  }
  const ticket: CommentTicket = orNotFound(await store.findTicket(input.targetId));
  return { kind: "ticket", ticketId: ticket.id };
}

/** Les commentaires sur la spec sont les remarques du client à l'équipe : seule l'équipe qui les traite les liste. */
const REF_READ_ROLES = ["owner", "admin", "dev", "designer"];

/** Le client commente en tant que `client`, les autres rôles en tant qu'humains (jamais de l'entrée). */
const ticketOf = (target: CommentTarget) => (target.kind === "ticket" ? target.ticketId : null);

const authorKindOf = (role: string | undefined) => (role === "client" ? "client" : "human");

/** Commentaires de ticket : auteur déduit de la session, suppression logique, audit transactionnel. */
@Injectable()
export class CommentService {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly repository: CommentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SpecTechnicalService) private readonly technical: SpecTechnicalService,
  ) {}

  /** Sections du cahier technique à la tête (lecture git hors transaction), pour la seule cible `tech_section`. */
  private async sectionsFor(scope: ProjectScope, targetKind: string): Promise<Set<string>> {
    if (targetKind !== "tech_section") return new Set();
    const { sections } = await this.technical.sections(scope, { deliverable: "technical" });
    return new Set(sections.map((section) => section.specId));
  }

  async create(scope: ProjectScope, role: string | undefined, input: CommentCreateInput) {
    const sections = await this.sectionsFor(scope, input.targetKind);
    return this.repository.run(scope, async (store) => {
      const target = await requireTarget(store, input, sections);
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

  async list(scope: ProjectScope, role: string | undefined, input: CommentListInput) {
    if (isRefKind(input.targetKind) && !REF_READ_ROLES.some((allowed) => allowed === role)) {
      throw new ORPCError("FORBIDDEN", { message: "Accès refusé" });
    }
    const sections = await this.sectionsFor(scope, input.targetKind);
    return this.repository.run(scope, async (store) => {
      const target = await requireTarget(store, input, sections);
      const page = await store.list(
        target,
        input.limit ?? DEFAULT_PAGE_SIZE,
        positionOf(input.cursor),
      );
      return { items: page.items.map(outputOf), nextCursor: page.nextCursor };
    });
  }

  /** Un commentaire sur un élément de la spec se supprime même si l'élément a quitté la spec ; il doit être de ce projet. */
  private async deletionTarget(
    store: CommentStore,
    scope: ProjectScope,
    comment: CommentRecord,
  ): Promise<CommentTarget> {
    if (comment.targetKind !== "ticket") {
      orNotFound(comment.targetId === scope.projectId || null);
      return { kind: comment.targetKind, ref: comment.targetRef ?? "" };
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
