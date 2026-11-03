import type { Untrusted } from "@koklo/domain";
import { untrustedSuggestion } from "../suggestion/untrusted-suggestion.ts";

/**
 * L'accesseur unique par lequel le commentaire d'une review peut atteindre un prompt (TK-54/57) : il
 * est enveloppé dans `Untrusted`, qui ne s'interpole ni ne se journalise. Aucune nouvelle origine :
 * c'est l'origine `client-suggestion`, construite par `untrustedSuggestion` et nulle part ailleurs.
 */
export function untrustedReviewComment(row: { comment: string | null }): Untrusted | null {
  return row.comment === null
    ? null
    : untrustedSuggestion({ body: row.comment, decisionNote: null }).body;
}
