import { Untrusted } from "@koklo/domain";

/** Les deux textes libres d'une suggestion : le corps du client et la note de l'équipe. */
export interface SuggestionTexts {
  body: string;
  decisionNote: string | null;
}

/**
 * L'accesseur unique par lequel un texte de suggestion peut atteindre un prompt (TK-54/57) : le
 * corps et la note sont enveloppés dans `Untrusted("client-suggestion")`, qui ne s'interpole ni ne
 * se journalise. C'est le seul endroit qui construit cette origine.
 */
export function untrustedSuggestion(row: SuggestionTexts): {
  body: Untrusted;
  note: Untrusted | null;
} {
  return {
    body: new Untrusted("client-suggestion", row.body),
    note: row.decisionNote === null ? null : new Untrusted("client-suggestion", row.decisionNote),
  };
}
