/** Onglets du cahier fonctionnel (`?tab=`) : les quatre types d'éléments de la spec. */
export const FEATURES_TABS = ["features", "rules", "roles", "flows"] as const;
export type FeaturesTab = (typeof FEATURES_TABS)[number];

/** Onglet de l'adresse ; une valeur inconnue ou absente ouvre les fonctionnalités. */
export function readFeaturesTab(search: string): FeaturesTab {
  const value = new URLSearchParams(search).get("tab");
  return FEATURES_TABS.find((tab) => tab === value) ?? "features";
}

export const TAB_LABELS: Record<FeaturesTab, string> = {
  features: "Fonctionnalités",
  rules: "Règles métier",
  roles: "Rôles et permissions",
  flows: "Parcours",
};

/** Libellé du bouton d'ajout de chaque onglet (maquette 10 l.637). */
export const CREATE_LABELS: Record<FeaturesTab, string> = {
  features: "Nouvelle fonctionnalité",
  rules: "Nouvelle règle",
  roles: "Nouveau rôle",
  flows: "Nouveau parcours",
};

/** Identifiant d'un élément de chaque onglet (`?sel=`, `?edit=`) : même motif que le contrat. */
export const TAB_ID: Record<FeaturesTab, RegExp> = {
  features: /^F-\d{3,}$/,
  rules: /^R-\d{3,}$/,
  roles: /^RL-[a-z0-9][a-z0-9-]*$/,
  flows: /^P-[a-z0-9][a-z0-9-]*$/,
};

/** Types de proposition de l'agent relus dans chaque onglet (`proposal.kind`). */
export const TAB_PROPOSAL_KINDS: Record<FeaturesTab, readonly string[]> = {
  features: ["feature", "criteria"],
  rules: ["rule"],
  roles: ["role"],
  flows: ["flow"],
};

/** Onglet qui relit un type de proposition. */
export function tabOfProposalKind(kind: string): FeaturesTab {
  return FEATURES_TABS.find((tab) => TAB_PROPOSAL_KINDS[tab].includes(kind)) ?? "features";
}
