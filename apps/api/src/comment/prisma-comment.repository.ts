import { Inject, Injectable } from "@nestjs/common";
import { recordAudit } from "../tracker/audit.ts";
import { type CursorPosition, keysetAfter, pageOfItems } from "../tracker/cursor.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  CommentPage,
  CommentRecord,
  CommentRepository,
  CommentStore,
  CommentTicket,
  NewComment,
} from "./comment.repository.ts";

const toRecord = (row: {
  id: string;
  targetId: string;
  authorKind: CommentRecord["authorKind"];
  authorId: string | null;
  body: string;
  createdAt: Date;
}): CommentRecord => ({
  id: row.id,
  targetId: row.targetId,
  authorKind: row.authorKind,
  authorId: row.authorId,
  body: row.body,
  createdAt: row.createdAt,
});

class PrismaCommentStore implements CommentStore {
  constructor(
    private readonly tx: Tx,
    private readonly scope: ProjectScope,
  ) {}

  findTicket(id: string): Promise<CommentTicket | null> {
    return this.tx.ticket.findFirst({
      where: { id, projectId: this.scope.projectId, deletedAt: null },
      select: { id: true },
    });
  }

  async insert(comment: NewComment): Promise<CommentRecord> {
    return toRecord(
      await this.tx.ticketComment.create({
        data: {
          organizationId: this.scope.organizationId,
          targetKind: "ticket",
          targetId: comment.ticketId,
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

  async list(ticketId: string, limit: number, after: CursorPosition | null): Promise<CommentPage> {
    const rows = await this.tx.ticketComment.findMany({
      where: {
        targetKind: "ticket",
        targetId: ticketId,
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
    ticketId: string,
  ): Promise<void> {
    return recordAudit(this.tx, this.scope, {
      action,
      targetKind: "comment",
      targetId: comment.id,
      ticketId,
    });
  }
}

@Injectable()
export class PrismaCommentRepository implements CommentRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  run<T>(scope: ProjectScope, work: (store: CommentStore) => Promise<T>): Promise<T> {
    return this.transactions.run(scope, (tx) => work(new PrismaCommentStore(tx, scope)));
  }
}
