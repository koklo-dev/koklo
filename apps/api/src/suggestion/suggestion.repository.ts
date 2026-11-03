import type { CursorPosition } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const SUGGESTION_REPOSITORY = Symbol("SUGGESTION_REPOSITORY");

export type SuggestionStatus = "open" | "accepted" | "rejected" | "withdrawn";

/** Une suggestion telle que stockée ; `authorUserId` et `baseSha` ne sortent jamais de l'API. */
export interface SuggestionRecord {
  id: string;
  key: string;
  targetKind: "feature" | "project";
  targetRef: string | null;
  body: string;
  status: SuggestionStatus;
  decisionNote: string | null;
  authorUserId: string | null;
  authorRole: string | null;
  baseSha: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

/** La suggestion et la tête de spec courante (`null` : rien d'indexé), pour calculer `outdated`. */
export interface SuggestionView {
  record: SuggestionRecord;
  headSha: string | null;
}

export interface CreateSuggestion {
  targetKind: "feature" | "project";
  targetRef?: string | undefined;
  body: string;
}

export interface SuggestionPage {
  records: SuggestionRecord[];
  nextCursor: string | null;
  headSha: string | null;
}

export interface ListSuggestions {
  limit: number;
  after: CursorPosition | null;
  status?: SuggestionStatus | undefined;
  targetRef?: string | undefined;
}

/** Acteur d'une écriture : la session (rôle relu dans `members`) et l'instant de l'horloge. */
export interface SuggestionActor {
  role: string;
  now: Date;
}

/**
 * Suggestions d'un projet. Chaque méthode est une transaction : l'écriture, la clé `SG-n`, les
 * notifications et l'audit réussissent ou échouent ensemble. Les refus sont des erreurs typées
 * (`NOT_FOUND`, `CONFLICT`) levées depuis la transaction.
 */
export interface SuggestionRepository {
  create(
    scope: ProjectScope,
    actor: SuggestionActor,
    input: CreateSuggestion,
  ): Promise<SuggestionView>;
  list(scope: ProjectScope, query: ListSuggestions): Promise<SuggestionPage>;
  /** L'auteur seul ; rejeu sur une suggestion déjà retirée : l'état tel quel, sans écriture. */
  withdraw(scope: ProjectScope, actor: SuggestionActor, id: string): Promise<SuggestionView>;
  /** Compare-and-set sur `open` ; rejeu de la même décision : l'état tel quel, sans écriture. */
  decide(
    scope: ProjectScope,
    actor: SuggestionActor,
    id: string,
    decision: { status: "accepted" | "rejected"; note?: string | undefined },
  ): Promise<SuggestionView>;
}
