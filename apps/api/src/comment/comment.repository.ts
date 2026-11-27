import type { CursorPosition } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const COMMENT_REPOSITORY = Symbol("COMMENT_REPOSITORY");

/** Ticket non supprimé du projet courant : seule cible vérifiable, seule porte d'accès. */
export interface CommentTicket {
  id: string;
}

/**
 * Genres de cible repérés par un identifiant lisible (`targetRef`) : table (3.7.0), composant, décision et flux (3.11.0),
 * choix technique, bloc des environnements et section du cahier technique (3.17.0), opération et bloc des exigences
 * (3.18.0), résumé client de la Sécurité (3.19.0).
 */
export const REF_KINDS = [
  "table",
  "component",
  "adr",
  "archflow",
  "stack",
  "environments",
  "tech_section",
  "operation",
  "requirements",
  "security_summary",
] as const;
export type RefKind = (typeof REF_KINDS)[number];
/** Genres vérifiés dans l'index d'entités ; une section du cahier n'est pas indexée (lue en Git). */
export type IndexedRefKind = Exclude<RefKind, "tech_section">;

/** Cible d'un commentaire : un ticket du projet, ou un élément de la spec repéré par son identifiant lisible. */
export type CommentTarget = { kind: "ticket"; ticketId: string } | { kind: RefKind; ref: string };

export interface CommentRecord {
  id: string;
  targetKind: "ticket" | RefKind;
  /** Le ticket, ou le projet pour une table. */
  targetId: string;
  /** Identifiant lisible d'un élément de la spec ; `null` pour un ticket. */
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
  /** L'élément existe dans l'index de la tête de spec du projet. */
  refExists(kind: IndexedRefKind, ref: string): Promise<boolean>;
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
