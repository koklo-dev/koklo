import type { CursorPosition } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const COMMENT_REPOSITORY = Symbol("COMMENT_REPOSITORY");

/** Ticket non supprimé du projet courant : seule cible vérifiable, seule porte d'accès. */
export interface CommentTicket {
  id: string;
}

export interface CommentRecord {
  id: string;
  targetId: string;
  authorKind: "human" | "agent" | "client" | "system";
  /** NULL en base pour un commentaire système. */
  authorId: string | null;
  body: string;
  createdAt: Date;
}

export interface NewComment {
  ticketId: string;
  authorKind: "human" | "client";
  authorId: string;
  body: string;
}

export interface CommentPage {
  items: CommentRecord[];
  nextCursor: string | null;
}

/** Opérations d'une transaction de commentaires ; l'audit partage cette transaction. */
export interface CommentStore {
  findTicket(id: string): Promise<CommentTicket | null>;
  insert(comment: NewComment): Promise<CommentRecord>;
  /** Commentaire non supprimé, quel que soit son ticket (l'appartenance se vérifie ensuite). */
  find(id: string): Promise<CommentRecord | null>;
  /** Ancien vers récent, après `after` ; `limit` lignes au plus. */
  list(ticketId: string, limit: number, after: CursorPosition | null): Promise<CommentPage>;
  /** Suppression logique ; `false` si la course a été perdue. */
  markDeleted(id: string, deletedAt: Date): Promise<boolean>;
  audit(
    action: "comment.create" | "comment.delete",
    comment: CommentRecord,
    ticketId: string,
  ): Promise<void>;
}

export interface CommentRepository {
  run<T>(scope: ProjectScope, work: (store: CommentStore) => Promise<T>): Promise<T>;
}
