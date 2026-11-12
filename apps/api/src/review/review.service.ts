import type { reviewListOutputSchema, reviewSubmitOutputSchema } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { CLIENT_ROLE } from "../auth/roles.ts";
import { isCurrent, validationOf } from "../client-space/validation.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { DEFAULT_PAGE_SIZE, positionOf } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  REVIEW_REPOSITORY,
  type ReviewRepository,
  type ReviewTargetKind,
  type SubmitReview,
} from "./review.repository.ts";
import { isDelegatedTarget } from "./review-policy.ts";

type Submitted = z.output<typeof reviewSubmitOutputSchema>;
type ReviewList = z.output<typeof reviewListOutputSchema>;

/**
 * Validation d'une cible par le client, ou par l'équipe selon la cible (TK-55d, TK-100). Le service ne lit ni ne
 * journalise le commentaire ; la sortie de `submit` ne porte ni SHA ni auteur, celle de `list` porte la preuve technique
 * à l'équipe (le SHA n'est jamais montré au client, D7). `validation` se déduit de la review écrite et du contenu courant.
 */
@Injectable()
export class ReviewService {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly repository: ReviewRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async submit(
    scope: ProjectScope,
    role: string | undefined,
    input: SubmitReview,
  ): Promise<Submitted> {
    const { record, headSha, currentHash } = await this.repository.submit(
      scope,
      { role: role ?? "", now: new Date(this.clock.now()) },
      input,
    );
    return {
      id: record.id,
      status: record.status,
      validation: validationOf({ ...record, currentHash }, headSha).validation,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async list(
    scope: ProjectScope,
    role: string | undefined,
    input: { targetKind?: ReviewTargetKind; targetRef?: string; limit?: number; cursor?: string },
  ): Promise<ReviewList> {
    const clientOnly = role === CLIENT_ROLE;
    const page = await this.repository.list(scope, {
      clientOnly,
      targetKind: input.targetKind,
      targetRef: input.targetRef,
      limit: input.limit ?? DEFAULT_PAGE_SIZE,
      after: positionOf(input.cursor),
    });
    return {
      items: page.records.map((record) => ({
        id: record.id,
        targetKind: record.targetKind,
        targetRef: record.targetRef,
        sha: clientOnly ? null : record.sha,
        status: record.status,
        authorId: record.authorUserId,
        authorRole: (record.authorRole ?? null) as ReviewList["items"][number]["authorRole"],
        comment: record.comment,
        createdAt: record.createdAt.toISOString(),
        current:
          page.headSha !== null &&
          isCurrent(
            {
              ...record,
              currentHash:
                page.currentHashes.get(`${record.targetKind}:${record.targetRef}`) ?? null,
            },
            page.headSha,
          ),
        onBehalf:
          record.authorRole !== CLIENT_ROLE &&
          isDelegatedTarget(record.targetKind, record.targetRef),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
