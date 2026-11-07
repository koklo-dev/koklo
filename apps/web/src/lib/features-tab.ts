/** Onglets du cahier fonctionnel (`?tab=`) : seul le premier existe au lot 1, les trois autres sont « Bientôt ». */
export const FEATURES_TABS = ["features", "rules", "roles", "flows"] as const;
export type FeaturesTab = (typeof FEATURES_TABS)[number];

/** Onglet de l'adresse ; une valeur inconnue ou absente ouvre les fonctionnalités. */
export function readFeaturesTab(search: string): FeaturesTab {
  const value = new URLSearchParams(search).get("tab");
  return FEATURES_TABS.find((tab) => tab === value) ?? "features";
}
