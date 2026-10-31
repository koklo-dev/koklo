import type { FeatureSummary, SpecHeadOutput } from "@koklo/contract";
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
}

/** Instantané lu : `null` quand le projet n'a pas de dépôt de spec ou que la révision n'est pas indexée. */
export type IndexedFeatures =
  | { kind: "failed"; errorCode: string; commitSha: string }
  | { kind: "rows"; rows: FeatureSummary[] };

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

/** Lectures de l'index de la spec ; chaque méthode est une transaction courte, sans réseau. */
export interface SpecReadRepository {
  /** `NOT_FOUND` si le projet n'est pas de l'organisation ; `null` si la révision n'est pas indexée. */
  head(scope: ProjectScope, revision: Revision): Promise<SpecHeadOutput>;
  /** Features de la révision (filtrées, non triées) ; `null` si la révision n'est pas indexée. */
  features(
    scope: ProjectScope,
    revision: Revision,
    filter: FeatureFilter,
  ): Promise<IndexedFeatures | null>;
  /** Feature de la tête par défaut du projet ; `null` si absente de l'instantané courant. */
  featureSource(scope: ProjectScope, specId: string): Promise<FeatureSource | null>;
}
