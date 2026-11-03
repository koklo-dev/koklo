import type { Untrusted } from "@koklo/domain";

/** Les deux textes libres d'une suggestion : le corps du client et la note de l'équipe. */
export interface SuggestionTexts {
  body: string;
  decisionNote: string | null;
}

/**
 * Squelette du Red (TK-55c) : l'accesseur unique par lequel un texte de suggestion peut atteindre un
 * prompt (TK-54/57). Le Green l'enveloppe dans `Untrusted("client-suggestion", ...)`.
 */
export function untrustedSuggestion(row: SuggestionTexts): {
  body: Untrusted;
  note: Untrusted | null;
} {
  return {
    body: row.body as unknown as Untrusted,
    note: row.decisionNote as unknown as Untrusted | null,
  };
}
