import type {
  FeatureSummary,
  FunctionalItem,
  SpecHeadOutput,
  SpecItem,
  SpecRefsSearchOutput,
} from "@koklo/contract";

import type { ProjectScope } from "../tracker/scope.ts";

export const SPEC_READ_REPOSITORY = Symbol("SPEC_READ_REPOSITORY");

/** Révision demandée ; les deux champs sont exclusifs (le contrat le garantit). */
export interface Revision {
  branch?: string;
  commitSha?: string;
}

export interface FeatureFilter {
  status?: FeatureSummary["status"];
  priority?: FeatureSummary["priority"];
  validation?: FeatureSummary["validation"];
}

/** Résumé d'une fonctionnalité sans sa validation (prompts de l'agent, doublons) : aucune lecture des reviews. */
export type FeatureHead = Omit<FeatureSummary, "validation">;

/** Demande de page de `spec.listFeatures` : filtres, recherche, position (curseur ou `around`), taille. */
export interface FeatureListRequest {
  filter: FeatureFilter;
  /** Recherche plein texte (identifiant et titre). */
  q?: string;
  limit: number;
  cursor?: string;
  /** Identifiant `F-nnn` à amener dans la page. */
  around?: string;
}

export interface FeaturePage {
  items: FeatureSummary[];
  nextCursor: string | null;
  previousCursor: string | null;
  /** Rang de la première fonctionnalité dans la liste filtrée. */
  offset: number;
  total: number;
  facets: {
    status: Record<string, number>;
    priority: Record<string, number>;
    validation: Record<string, number>;
  };
}

/** Page lue : `null` quand le projet n'a pas de dépôt de spec ou que la révision n'est pas indexée. */
export type IndexedFeaturePage =
  | { kind: "failed"; errorCode: string; commitSha: string }
  | { kind: "page"; page: FeaturePage };

/** Instantané lu : `null` quand le projet n'a pas de dépôt de spec ou que la révision n'est pas indexée. */
export type IndexedFeatures =
  | { kind: "failed"; errorCode: string; commitSha: string }
  | { kind: "rows"; rows: FeatureHead[] };

/** Ce qu'il faut pour lire une feature dans git, décidé sur l'index avant tout réseau. */
export type FeatureSource =
  | { kind: "failed"; errorCode: string; commitSha: string }
  | {
      kind: "found";
      commitSha: string;
      /** Chemin du fichier relatif à la racine de la spec. */
      filePath: string;
      /** Dossier de la spec dans un monorepo, sinon `null`. */
      specPath: string | null;
      repoName: string;
      /** Propriétaire du dépôt chez le fournisseur. */
      owner: { kind: "organization" | "user"; login: string };
      installation: { id: string; externalId: string; active: boolean };
    };

/** Élément de l'index générique cité ou trouvé par l'autocomplétion (TK-101). */
export type EntityReference = SpecItem["referencedBy"]["items"][number];
/** Résultat de l'autocomplétion : les six genres qu'on peut lier. */
export type RefHit = SpecRefsSearchOutput["items"][number];

/** Demande de page de `spec.functional.list` : onglet, filtre de type des règles, recherche, position, taille. */
export interface FunctionalListRequest {
  tab: "rules" | "flows";
  type?: string;
  q?: string;
  limit: number;
  cursor?: string;
  around?: string;
}

export interface FunctionalPage {
  items: FunctionalItem[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Page lue ; `null` quand le projet n'a pas de dépôt de spec ou que la révision n'est pas indexée. */
export type IndexedFunctionalPage =
  | { kind: "failed"; errorCode: string; commitSha: string }
  | { kind: "page"; page: FunctionalPage };

/** Une entité de l'index générique lue pour une fiche ou la matrice (`rule`, `flow`, ou le fichier `roles`). */
export type EntityItem =
  | { kind: "failed"; errorCode: string; commitSha: string }
  | { kind: "found"; commitSha: string; path: string; data: unknown };

/** Lectures de l'index de la spec ; chaque méthode est une transaction courte, sans réseau. */
export interface SpecReadRepository {
  /** `NOT_FOUND` si le projet n'est pas de l'organisation ; `null` si la révision n'est pas indexée. */
  head(scope: ProjectScope, revision: Revision): Promise<SpecHeadOutput>;
  /**
   * Une page de features de la révision, filtrée et triée numériquement, avec total et facettes.
   * `NOT_FOUND` si `around` n'est pas une feature de la révision, `VALIDATION{cursor}` pour un
   * curseur étranger ; `null` si la révision n'est pas indexée.
   */
  featuresPage(
    scope: ProjectScope,
    revision: Revision,
    request: FeatureListRequest,
  ): Promise<IndexedFeaturePage | null>;
  /** Une page de règles ou de parcours de la révision (liste à curseur de l'index d'entités). */
  functionalPage(
    scope: ProjectScope,
    revision: Revision,
    request: FunctionalListRequest,
  ): Promise<IndexedFunctionalPage | null>;
  /**
   * Une entité de la tête (`rule`, `flow`, `table` ou `roles`, dont `specId` est `roles`) avec son chemin et son contenu indexé ;
   * `null` si elle est absente ou que les entités de la tête ne sont pas indexées.
   */
  entityItem(
    scope: ProjectScope,
    kind: "rule" | "flow" | "roles" | "table",
    specId: string,
    revision?: Revision,
  ): Promise<EntityItem | null>;
  /** Toutes les features de la révision, non triées (prompts de l'agent) ; `null` si non indexée. */
  features(scope: ProjectScope, revision: Revision): Promise<IndexedFeatures | null>;
  /** Feature de la tête par défaut du projet ; `null` si absente de l'instantané courant. */
  featureSource(scope: ProjectScope, specId: string): Promise<FeatureSource | null>;
  /**
   * Éléments de la tête dont l'identifiant commence par `q` ou dont le titre en contient les mots (20 au plus, par rang).
   * Liste vide quand les entités de la tête ne sont pas indexées (`entities_indexed_at` nul) ou l'index en échec.
   */
  searchRefs(scope: ProjectScope, kinds: readonly RefHit["kind"][], q: string): Promise<RefHit[]>;
  /** Éléments de la tête qui citent `specId` (jeton exact), 20 au plus ; `total` les compte tous. */
  referencedBy(scope: ProjectScope, specId: string): Promise<SpecItem["referencedBy"]>;
}
