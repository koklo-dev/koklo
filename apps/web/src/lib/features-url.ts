import type { FeaturePriority, FeatureStatus } from "./feature-labels.ts";

export interface FeaturesUrlState {
  status?: FeatureStatus;
  priority?: FeaturePriority;
  /** Identifiant `F-nnn` de la fiche ouverte. */
  feature?: string;
}

export type FeaturesUrlPatch = {
  [K in keyof FeaturesUrlState]?: FeaturesUrlState[K] | null;
};

const TODO = "features-url: non implémenté";

/** Lit `status`, `priority` et `feature` dans une query string ; les valeurs inconnues sont ignorées. */
export function readFeaturesUrl(_search: string): FeaturesUrlState {
  throw new Error(TODO);
}

/** Applique `patch` (null efface) à `search` et rend la nouvelle query string : "" ou "?a=b". */
export function withFeaturesUrl(_search: string, _patch: FeaturesUrlPatch): string {
  throw new Error(TODO);
}
