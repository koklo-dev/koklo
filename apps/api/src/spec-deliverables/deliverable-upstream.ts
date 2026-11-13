/**
 * Impact amont du livrable Données (TK-109, B449) : faits lus en base (hachages de contenu des fonctionnalités et règles
 * citées), jamais le contenu des fichiers.
 */
export interface UpstreamFacts {
  /** Identifiants F-nnn et R-nnn cités par `source:` des tables de la tête. */
  sources: readonly string[];
  /** Hachage de chaque amont à la tête de la dernière décision ; `null` : jamais décidé, ou cette tête n'est pas indexée. */
  atDecision: ReadonlyMap<string, string> | null;
  /** Hachage de chaque amont à la tête courante (absent : retiré). */
  atHead: ReadonlyMap<string, string>;
}

/** Identifiants rendus au plus (B449) : la liste sert une phrase d'alerte, pas un inventaire. */
export const STALE_UPSTREAM_MAX = 20;

/**
 * Amonts cités dont le contenu a changé depuis la dernière décision, triés. Une source citée depuis la décision (inconnue
 * alors) n'est pas un impact ; sans décision comparable, aucun impact. Une nouvelle décision ramène la comparaison à zéro.
 */
export function staleUpstreamOf(facts: UpstreamFacts | null): string[] {
  if (facts === null || facts.atDecision === null) return [];
  const { atDecision, atHead } = facts;
  const changed = new Set<string>();
  for (const id of facts.sources) {
    const before = atDecision.get(id);
    if (before !== undefined && atHead.get(id) !== before) changed.add(id);
  }
  return [...changed].sort().slice(0, STALE_UPSTREAM_MAX);
}
