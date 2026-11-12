import type { StatusFacts } from "../spec-deliverables/deliverable-statuses.ts";
import type { ListWindow } from "../tracker/long-list.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { LabelRows, LinkSources } from "./client-space-entities.ts";
import type { ReviewVerdict } from "./validation.ts";

export const CLIENT_SPACE_REPOSITORY = Symbol("CLIENT_SPACE_REPOSITORY");

export interface ClientProjectRecord {
  id: string;
  name: string;
  /** `iteration` ssi `phaseOf` donne `iterations` (une baseline validée ou taguée, B272), sinon `framing`. */
  phase: "framing" | "iteration";
}

export interface IndexedRow {
  specId: string;
  title: string;
  priority: "must" | "should" | "could" | "wont";
  criteriaCount: number;
}

/** Features de la tête lue, avec le SHA de cette tête (devient le jeton opaque `version`). */
export interface IndexedHead {
  sha: string;
  rows: IndexedRow[];
}

/** Ce que le journal des reviews et des suggestions dit d'une feature (lecture seule). */
export interface FeatureTrail {
  latestReview: ReviewVerdict | undefined;
  openSuggestions: number;
}

/** Faits de la progression du client : statuts de la tête, nombres affichés par onglet, client invité. */
export interface ProgressFacts {
  facts: StatusFacts;
  counts: { rules: number; roles: number };
  hasClient: boolean;
  clientFirstName: string | null;
}

export interface EntityRow {
  specId: string;
  path: string;
  data: unknown;
}
/** Page d'une liste d'entités ; `q` (recherche plein texte) et `type` (règles) portent sur tout l'index (TK-105, B364). */
export interface EntityListRequest {
  limit: number;
  cursor: string | undefined;
  q: string | undefined;
  type: string | undefined;
}
/** Page de parcours : chaque ligne avec son dernier verdict (clé `P-…`). */
export interface FlowsRead {
  headSha: string;
  window: ListWindow<EntityRow>;
  verdicts: Map<string, ReviewVerdict | undefined>;
}
/** Page de règles et verdict du bloc entier. */
export interface RulesRead {
  headSha: string;
  window: ListWindow<EntityRow>;
  block: ReviewVerdict | undefined;
}
/** Fichier des rôles (`null` : rien d'indexé) et verdict du bloc entier. */
export interface RolesRead {
  headSha: string;
  file: unknown;
  block: ReviewVerdict | undefined;
}

/** Lectures de l'espace client ; chaque méthode est une transaction courte, sans écriture. */
export interface ClientSpaceRepository {
  /** `linkedIds` `null` : toute l'organisation ; sinon seulement ces projets. */
  projects(
    organizationId: string,
    linkedIds: readonly string[] | null,
  ): Promise<ClientProjectRecord[]>;
  /** `null` : aucune spec indexée ou index en échec. `q` ne garde que les fonctionnalités qui correspondent à la recherche. */
  indexedHead(scope: ProjectScope, q?: string): Promise<IndexedHead | null>;
  /** Tête lue et présence de la feature ; `null` : aucune spec indexée ou index en échec. */
  featureHead(
    scope: ProjectScope,
    specId: string,
  ): Promise<{ found: boolean; indexedAt: Date } | null>;
  /** Libellés des éléments liés à une fonctionnalité (règles citées, parcours qui la citent, rôles, écrans). */
  linkLabels(scope: ProjectScope, featureId: string, source: LinkSources): Promise<LabelRows>;
  /** `null` : aucune spec indexée ou index en échec. */
  progress(scope: ProjectScope): Promise<ProgressFacts | null>;
  flows(scope: ProjectScope, request: EntityListRequest): Promise<FlowsRead | null>;
  rules(scope: ProjectScope, request: EntityListRequest): Promise<RulesRead | null>;
  roles(scope: ProjectScope): Promise<RolesRead | null>;
  /** Dernière review et suggestions ouvertes de chaque référence demandée (clé : `F-nnn`). */
  trails(scope: ProjectScope, refs: readonly string[]): Promise<Map<string, FeatureTrail>>;
}
