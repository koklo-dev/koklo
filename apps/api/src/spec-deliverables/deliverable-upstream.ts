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

/** Un composant ou une décision d'une tête : hachage de son contenu, et pour une décision son acceptation. */
export interface UpstreamEntity {
  hash: string;
  accepted: boolean;
}

/** Faits de l'impact de l'architecture sur le cahier technique (TK-115, B735). */
export interface TechnicalUpstreamFacts {
  /** Composants et décisions de la tête de la dernière décision ; `null` : tête non indexée. */
  atDecision: ReadonlyMap<string, UpstreamEntity> | null;
  atHead: ReadonlyMap<string, UpstreamEntity>;
  /** Choix, opérations et exigences de la tête, avec les composants et décisions qu'ils citent. */
  citing: readonly { id: string; cites: readonly string[] }[];
}

export type TechnicalChange = "added" | "removed" | "changed" | "accepted";
export interface TechnicalImpact {
  changes: { id: string; change: TechnicalChange }[];
  items: string[];
}

function changeOf(
  before: UpstreamEntity | undefined,
  after: UpstreamEntity | undefined,
): TechnicalChange | undefined {
  if (after === undefined) return "removed";
  if (before?.hash === after.hash) return undefined;
  if (after.accepted && before?.accepted !== true) return "accepted";
  return before === undefined ? "added" : "changed";
}

/**
 * Composants et décisions ajoutés, retirés, modifiés ou acceptés depuis la dernière décision sur le cahier technique, et
 * les éléments qui les citent ; sans décision comparable, aucun impact.
 */
export function technicalImpactOf(facts: TechnicalUpstreamFacts | null): TechnicalImpact {
  if (facts === null || facts.atDecision === null) return { changes: [], items: [] };
  const { atDecision, atHead, citing } = facts;
  const ids = [...new Set([...atDecision.keys(), ...atHead.keys()])].sort();
  const changes = ids.flatMap((id) => {
    const change = changeOf(atDecision.get(id), atHead.get(id));
    return change === undefined ? [] : [{ id, change }];
  });
  const changed = new Set(changes.map((entry) => entry.id));
  const concerned = citing.filter((item) => item.cites.some((id) => changed.has(id)));
  return {
    changes: changes.slice(0, STALE_ARTIFACTS_MAX),
    items: firstSorted(
      concerned.map((item) => item.id),
      STALE_ARTIFACTS_MAX,
    ),
  };
}
