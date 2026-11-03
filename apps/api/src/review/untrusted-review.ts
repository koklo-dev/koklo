import type { Untrusted } from "@koklo/domain";

/**
 * Squelette du Red (TK-55d) : le Green enveloppe le commentaire d'une review dans `Untrusted` en
 * déléguant à `untrustedSuggestion` (origine `client-suggestion`, aucune nouvelle origine).
 */
export function untrustedReviewComment(row: { comment: string | null }): Untrusted | null {
  return row.comment as unknown as Untrusted | null;
}
