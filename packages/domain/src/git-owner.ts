/** Propriétaire d'un dépôt : `kind` est lu chez le fournisseur, jamais déduit (ADR 0009). */
export type GitOwner = {
  readonly kind: "organization" | "user";
  readonly login: string;
};

/** Installation de l'application Git pour un propriétaire. */
export type GitInstallation = {
  readonly id: string;
  readonly owner: GitOwner;
};
