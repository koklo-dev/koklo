import { Inject, Injectable } from "@nestjs/common";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { recordAudit } from "../tracker/audit.ts";
import { type CursorPosition, keysetAfter, pageOfItems } from "../tracker/cursor.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  CommentPage,
  CommentRecord,
  CommentRepository,
  CommentStore,
  CommentTarget,
  CommentTicket,
  NewComment,
} from "./comment.repository.ts";

const toRecord = (row: {
  id: string;
  targetKind: string;
  targetId: string;
  targetRef: string | null;
  authorKind: CommentRecord["authorKind"];
  authorId: string | null;
  body: string;
  createdAt: Date;
}): CommentRecord => ({
  id: row.id,
  targetKind: row.targetKind === "table" ? "table" : "ticket",
  targetId: row.targetId,
  targetRef: row.targetRef,
  authorKind: row.authorKind,
  authorId: row.authorId,
  body: row.body,
  createdAt: row.createdAt,
});

class PrismaCommentStore implements CommentStore {
  constructor(
    private readonly tx: Tx,
    private readonly scope: ProjectScope,
    private readonly resolver: SpecHeadResolver,
  ) {}

  findTicket(id: string): Promise<CommentTicket | null> {
    return this.tx.ticket.findFirst({
      where: { id, projectId: this.scope.projectId, deletedAt: null },
      select: { id: true },
    });
  }

  async tableExists(ref: string): Promise<boolean> {
    const head = await this.resolver.resolve(this.tx, this.scope, {});
    if (!head || head.snapshot.status === "failed") return false;
    const row = await this.tx.specEntity.findFirst({
      where: { snapshotId: head.snapshot.id, kind: "table", specId: ref },
      select: { id: true },
    });
    return row !== null;
  }

  /** Une table a le projet pour `target_id` et son `T-<slug>` pour `target_ref` ; un ticket n'a pas de `target_ref`. */
  private targetColumns(target: CommentTarget) {
    return target.kind === "table"
      ? { targetKind: "table" as const, targetId: this.scope.projectId, targetRef: target.ref }
      : { targetKind: "ticket" as const, targetId: target.ticketId, targetRef: null };
  }

  async insert(comment: NewComment): Promise<CommentRecord> {
    return toRecord(
      await this.tx.ticketComment.create({
        data: {
          organizationId: this.scope.organizationId,
          ...this.targetColumns(comment.target),
          authorKind: comment.authorKind,
          authorId: comment.authorId,
          body: comment.body,
        },
      }),
    );
  }

  async find(id: string): Promise<CommentRecord | null> {
    const row = await this.tx.ticketComment.findFirst({ where: { id, deletedAt: null } });
    return row && toRecord(row);
  }

  async list(
    target: CommentTarget,
    limit: number,
    after: CursorPosition | null,
  ): Promise<CommentPage> {
    const rows = await this.tx.ticketComment.findMany({
      where: {
        ...this.targetColumns(target),
        deletedAt: null,
        ...(after ? keysetAfter("createdAt", after, "asc") : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    return pageOfItems(rows, limit, (row) => row.createdAt, toRecord);
  }

  async markDeleted(id: string, deletedAt: Date): Promise<boolean> {
    const { count } = await this.tx.ticketComment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt },
    });
    return count > 0;
  }

  audit(
    action: "comment.create" | "comment.delete",
    comment: CommentRecord,
    ticketId: string | null,
  ): Promise<void> {
    return recordAudit(this.tx, this.scope, {
      action,
      targetKind: "comment",
      targetId: comment.id,
      ...(ticketId === null ? {} : { ticketId }),
    });
  }
}

@Injectable()
export class PrismaCommentRepository implements CommentRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
  ) {}

  run<T>(scope: ProjectScope, work: (store: CommentStore) => Promise<T>): Promise<T> {
    return this.transactions.run(scope, (tx) =>
      work(new PrismaCommentStore(tx, scope, this.resolver)),
    );
  }
}
