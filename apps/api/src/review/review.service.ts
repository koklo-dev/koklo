import type { reviewListOutputSchema, reviewSubmitOutputSchema } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { validationOf } from "../client-space/validation.ts";
import { CLOCK, type Clock } from "../clock.ts";
import { DEFAULT_PAGE_SIZE, positionOf } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  REVIEW_REPOSITORY,
  type ReviewRepository,
  type ReviewTargetKind,
  type SubmitReview,
} from "./review.repository.ts";

type Submitted = z.output<typeof reviewSubmitOutputSchema>;
type ReviewList = z.output<typeof reviewListOutputSchema>;

/**
 * Validation d'une feature ou d'une baseline par le client (TK-55d). Le service ne lit ni ne
 * journalise le commentaire ; la sortie de `submit` ne porte ni SHA ni auteur, celle de `list`
 * (équipe) porte la preuve technique. `validation` se déduit de la review écrite et de la tête.
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
    const { record, headSha } = await this.repository.submit(
      scope,
      { role: role ?? "", now: new Date(this.clock.now()) },
      input,
    );
    return {
      id: record.id,
      status: record.status,
      validation: validationOf(record, headSha).validation,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async list(
    scope: ProjectScope,
    input: { targetKind?: ReviewTargetKind; targetRef?: string; limit?: number; cursor?: string },
  ): Promise<ReviewList> {
    const page = await this.repository.list(scope, {
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
        sha: record.sha,
        status: record.status,
        authorId: record.authorUserId,
        authorRole: (record.authorRole ?? null) as ReviewList["items"][number]["authorRole"],
        comment: record.comment,
        createdAt: record.createdAt.toISOString(),
        current: page.headSha !== null && record.sha === page.headSha,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
