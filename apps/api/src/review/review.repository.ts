import type { CursorPosition } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const REVIEW_REPOSITORY = Symbol("REVIEW_REPOSITORY");

export type ReviewTargetKind = "feature" | "baseline" | "flow" | "rules" | "roles" | "deliverable";
export type ReviewStatus = "approved" | "changes_requested";

/** Une review telle que stockée ; `sha` et `authorUserId` ne sortent que par `review.list` (équipe). */
export interface ReviewRecord {
  id: string;
  targetKind: ReviewTargetKind;
  targetRef: string;
  sha: string;
  status: ReviewStatus;
  authorUserId: string;
  authorRole: string | null;
  comment: string | null;
  createdAt: Date;
  /** Hachage du contenu validé (`review_versions`), `null` pour une review d'avant TK-100 ou une baseline. */
  contentHash: string | null;
}

export interface SubmitReview {
  targetKind: ReviewTargetKind;
  targetRef: string;
  version: string;
  status: ReviewStatus;
  comment?: string | undefined;
}

/** Acteur d'une écriture : le rôle relu de la session et l'instant de l'horloge. */
export interface ReviewActor {
  role: string;
  now: Date;
}

/** La review écrite (ou rejouée) et la tête de spec qu'elle valide. */
export interface SubmittedReview {
  record: ReviewRecord;
  headSha: string;
  /** Hachage courant de la cible au moment de l'écriture, `null` quand elle n'en a pas (baseline, snapshot d'avant TK-100). */
  currentHash: string | null;
}

export interface ListReviews {
  /** Le lecteur est le client : seules les cibles qu'il valide (B325 e). */
  clientOnly: boolean;
  limit: number;
  after: CursorPosition | null;
  targetKind?: ReviewTargetKind | undefined;
  targetRef?: string | undefined;
}

export interface ReviewPage {
  records: ReviewRecord[];
  nextCursor: string | null;
  headSha: string | null;
  /** Hachage courant de chaque cible de la page (clé `kind:ref`), `null` quand l'index n'en a pas (repli sur le SHA). */
  currentHashes: Map<string, string | null>;
}

/**
 * Journal des validations d'un projet, en ajout seul : aucune méthode ne modifie ni ne supprime une
 * review. `submit` est une transaction (review, passage de la baseline, notifications et audit
 * réussissent ou échouent ensemble) ; ses refus sont des erreurs typées levées depuis la transaction.
 */
export interface ReviewRepository {
  submit(scope: ProjectScope, actor: ReviewActor, input: SubmitReview): Promise<SubmittedReview>;
  list(scope: ProjectScope, query: ListReviews): Promise<ReviewPage>;
}
