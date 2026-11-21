/**
 * Impact amont d'un livrable (Données, TK-109 B449 ; Architecture, TK-113) : faits lus en base (hachages de contenu des
 * fonctionnalités, règles et tables citées), jamais le contenu des fichiers.
 */
export interface UpstreamFacts {
  /** Identifiants F-nnn, R-nnn (et T-slug pour l'Architecture) cités par la source du livrable à la tête courante. */
  sources: readonly string[];
  /** Hachage de chaque amont à la tête de la dernière décision ; `null` : jamais décidé, ou cette tête n'est pas indexée. */
  atDecision: ReadonlyMap<string, string> | null;
  /** Hachage de chaque amont à la tête courante (absent : retiré). */
  atHead: ReadonlyMap<string, string>;
  /** Architecture : tables de la tête de la décision (`null` : tête non indexée) et de la tête courante. */
  tables?: { atDecision: ReadonlySet<string> | null; atHead: ReadonlySet<string> };
  /** Architecture : composants et flux qui citent chaque amont (à la tête courante, plus à la décision pour une table retirée). */
  citedBy?: ReadonlyMap<string, { components: readonly string[]; flows: readonly string[] }>;
}

/** Identifiants rendus au plus (B449) : la liste sert une phrase d'alerte, pas un inventaire. */
export const STALE_UPSTREAM_MAX = 20;
/** Composants et flux concernés rendus au plus (TK-113). */
export const STALE_ARTIFACTS_MAX = 50;

export interface StaleImpact {
  upstream: string[];
  components: string[];
  flows: string[];
}

const NO_IMPACT = (): StaleImpact => ({ upstream: [], components: [], flows: [] });

/** Amonts cités dont le contenu a changé depuis la décision (retirés compris). */
function changedCitations(facts: UpstreamFacts, atDecision: ReadonlyMap<string, string>) {
  return facts.sources.filter((id) => {
    const before = atDecision.get(id);
    return before !== undefined && facts.atHead.get(id) !== before;
  });
}

/** Tables ajoutées ou retirées depuis la décision (Architecture) ; tête de la décision non indexée : aucune. */
function changedTables({ tables }: UpstreamFacts): string[] {
  const before = tables?.atDecision;
  if (!tables || !before) return [];
  return [
    ...[...tables.atHead].filter((id) => !before.has(id)),
    ...[...before].filter((id) => !tables.atHead.has(id)),
  ];
}

const firstSorted = (values: Iterable<string>, max: number): string[] =>
  [...new Set(values)].sort().slice(0, max);

/**
 * Amonts modifiés depuis la dernière décision, et composants et flux qui les citent. Une source citée depuis la décision
 * (inconnue alors) n'est pas un impact ; sans décision comparable, aucun impact. Une nouvelle décision ramène la comparaison
 * à zéro.
 */
export function staleImpactOf(facts: UpstreamFacts | null): StaleImpact {
  if (facts === null || facts.atDecision === null) return NO_IMPACT();
  const changed = new Set([...changedCitations(facts, facts.atDecision), ...changedTables(facts)]);
  const cited = [...changed].flatMap((id) => facts.citedBy?.get(id) ?? []);
  return {
    upstream: firstSorted(changed, STALE_UPSTREAM_MAX),
    components: firstSorted(
      cited.flatMap((entry) => entry.components),
      STALE_ARTIFACTS_MAX,
    ),
    flows: firstSorted(
      cited.flatMap((entry) => entry.flows),
      STALE_ARTIFACTS_MAX,
    ),
  };
}

/** Amonts cités dont le contenu a changé depuis la dernière décision, triés. */
export const staleUpstreamOf = (facts: UpstreamFacts | null): string[] =>
  staleImpactOf(facts).upstream;
