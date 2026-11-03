import type { suggestionListOutputSchema, suggestionSchema } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { CLOCK, type Clock } from "../clock.ts";
import { isProjectScoped } from "../project/project-access.ts";
import { DEFAULT_PAGE_SIZE, positionOf } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  type CreateSuggestion,
  SUGGESTION_REPOSITORY,
  type SuggestionRecord,
  type SuggestionRepository,
  type SuggestionStatus,
  type SuggestionView,
} from "./suggestion.repository.ts";

type Suggestion = z.output<typeof suggestionSchema>;
type SuggestionList = z.output<typeof suggestionListOutputSchema>;

/** Qui regarde : l'équipe voit le rôle de l'auteur, le client (ou un rôle inconnu) jamais. */
export interface Viewer {
  role: string | undefined;
}

/**
 * Sortie d'une suggestion : ni SHA, ni identité d'auteur. `outdated` compare le SHA de base à la
 * tête courante (faux sans l'un ou l'autre) ; `mine` dit seulement si l'appelant en est l'auteur.
 */
function outputOf({ record, headSha }: SuggestionView, userId: string, viewer: Viewer): Suggestion {
  return {
    id: record.id,
    key: record.key,
    targetKind: record.targetKind,
    targetRef: record.targetRef,
    body: record.body,
    status: record.status,
    decisionNote: record.decisionNote,
    createdAt: record.createdAt.toISOString(),
    decidedAt: record.decidedAt?.toISOString() ?? null,
    mine: record.authorUserId === userId,
    outdated: record.baseSha !== null && headSha !== null && record.baseSha !== headSha,
    ...teamOnly(record, viewer),
  };
}

const teamOnly = (record: SuggestionRecord, viewer: Viewer) =>
  !isProjectScoped(viewer.role) && record.authorRole !== null
    ? { authorRole: record.authorRole as NonNullable<Suggestion["authorRole"]> }
    : {};

/**
 * Suggestions `SG-n` (TK-55c) : le client suggère, l'équipe décide. Les écritures sont atomiques
 * dans le dépôt (clé, notifications via `NotificationEmitter`, audit) ; accepter ne touche pas la
 * spec. Le texte libre n'est ni lu ni journalisé ici.
 */
@Injectable()
export class SuggestionService {
  constructor(
    @Inject(SUGGESTION_REPOSITORY) private readonly repository: SuggestionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(role: string | undefined) {
    return { role: role ?? "", now: new Date(this.clock.now()) };
  }

  async create(scope: ProjectScope, viewer: Viewer, input: CreateSuggestion): Promise<Suggestion> {
    const view = await this.repository.create(scope, this.actor(viewer.role), input);
    return outputOf(view, scope.userId, viewer);
  }

  async list(
    scope: ProjectScope,
    viewer: Viewer,
    input: { status?: SuggestionStatus; targetRef?: string; limit?: number; cursor?: string },
  ): Promise<SuggestionList> {
    const page = await this.repository.list(scope, {
      status: input.status,
      targetRef: input.targetRef,
      limit: input.limit ?? DEFAULT_PAGE_SIZE,
      after: positionOf(input.cursor),
    });
    return {
      items: page.records.map((record) =>
        outputOf({ record, headSha: page.headSha }, scope.userId, viewer),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async withdraw(scope: ProjectScope, viewer: Viewer, id: string): Promise<Suggestion> {
    const view = await this.repository.withdraw(scope, this.actor(viewer.role), id);
    return outputOf(view, scope.userId, viewer);
  }

  async decide(
    scope: ProjectScope,
    viewer: Viewer,
    id: string,
    decision: { status: "accepted" | "rejected"; note?: string | undefined },
  ): Promise<Suggestion> {
    const view = await this.repository.decide(scope, this.actor(viewer.role), id, decision);
    return outputOf(view, scope.userId, viewer);
  }
}
