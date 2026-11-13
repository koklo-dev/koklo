import type { CursorPosition } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const COMMENT_REPOSITORY = Symbol("COMMENT_REPOSITORY");

/** Ticket non supprimé du projet courant : seule cible vérifiable, seule porte d'accès. */
export interface CommentTicket {
  id: string;
}

/** Cible d'un commentaire : un ticket du projet, ou une table de données (3.7.0, repérée par `T-<slug>`). */
export type CommentTarget = { kind: "ticket"; ticketId: string } | { kind: "table"; ref: string };

export interface CommentRecord {
  id: string;
  targetKind: "ticket" | "table";
  /** Le ticket, ou le projet pour une table. */
  targetId: string;
  /** `T-<slug>` d'une table ; `null` pour un ticket. */
  targetRef: string | null;
  authorKind: "human" | "agent" | "client" | "system";
  /** NULL en base pour un commentaire système. */
  authorId: string | null;
  body: string;
  createdAt: Date;
}

export interface NewComment {
  target: CommentTarget;
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
  /** La table existe dans l'index de la tête de spec du projet. */
  tableExists(ref: string): Promise<boolean>;
  insert(comment: NewComment): Promise<CommentRecord>;
  /** Commentaire non supprimé, quel que soit son ticket (l'appartenance se vérifie ensuite). */
  find(id: string): Promise<CommentRecord | null>;
  /** Ancien vers récent, après `after` ; `limit` lignes au plus. */
  list(target: CommentTarget, limit: number, after: CursorPosition | null): Promise<CommentPage>;
  /** Suppression logique ; `false` si la course a été perdue. */
  markDeleted(id: string, deletedAt: Date): Promise<boolean>;
  audit(
    action: "comment.create" | "comment.delete",
    comment: CommentRecord,
    ticketId: string | null,
  ): Promise<void>;
}

export interface CommentRepository {
  run<T>(scope: ProjectScope, work: (store: CommentStore) => Promise<T>): Promise<T>;
}
