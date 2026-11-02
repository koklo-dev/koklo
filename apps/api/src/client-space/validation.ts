/** Statut de validation d'une cible, vu du client (TK-55b). */
export type Validation = "validated" | "to_validate" | "to_revise";

/** Verdict d'une review, tel que stocké : `sha` est la tête de spec lue au moment du verdict. */
export interface ReviewVerdict {
  id: string;
  status: "approved" | "changes_requested";
  sha: string;
  createdAt: Date;
}

export interface ValidationState {
  validation: Validation;
  /** Vrai si la dernière review était `approved` mais périmée (la spec a avancé depuis). */
  previouslyValidated: boolean;
}

/**
 * Dernière review d'une cible : la plus récente par `createdAt`, à égalité l'identifiant le plus
 * grand (uuid v7, monotone). SQUELETTE DU RED.
 */
export function latestReview(_reviews: readonly ReviewVerdict[]): ReviewVerdict | undefined {
  return undefined;
}

/** Statut de validation au regard de la tête courante. SQUELETTE DU RED. */
export function validationOf(
  _latest: ReviewVerdict | undefined,
  _headSha: string,
): ValidationState {
  return { validation: "to_validate", previouslyValidated: false };
}
