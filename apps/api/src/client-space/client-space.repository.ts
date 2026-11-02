import type { ProjectScope } from "../tracker/scope.ts";
import type { ReviewVerdict } from "./validation.ts";

export const CLIENT_SPACE_REPOSITORY = Symbol("CLIENT_SPACE_REPOSITORY");

export interface ClientProjectRecord {
  id: string;
  name: string;
  /** `iteration` ssi une baseline taguée existe, sinon `framing`. */
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

/** Lectures de l'espace client ; chaque méthode est une transaction courte, sans écriture. */
export interface ClientSpaceRepository {
  /** `linkedIds` `null` : toute l'organisation ; sinon seulement ces projets. */
  projects(
    organizationId: string,
    linkedIds: readonly string[] | null,
  ): Promise<ClientProjectRecord[]>;
  /** `null` : aucune spec indexée ou index en échec. */
  indexedHead(scope: ProjectScope): Promise<IndexedHead | null>;
  /** Tête lue et présence de la feature ; `null` : aucune spec indexée ou index en échec. */
  featureHead(scope: ProjectScope, specId: string): Promise<{ found: boolean } | null>;
  /** Dernière review et suggestions ouvertes de chaque référence demandée (clé : `F-nnn`). */
  trails(scope: ProjectScope, refs: readonly string[]): Promise<Map<string, FeatureTrail>>;
}
