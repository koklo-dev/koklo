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
 * grand (uuid v7, monotone). Ne modifie pas la liste reçue.
 */
export function latestReview(reviews: readonly ReviewVerdict[]): ReviewVerdict | undefined {
  return reviews.reduce<ReviewVerdict | undefined>(
    (latest, review) => (latest === undefined || compare(review, latest) > 0 ? review : latest),
    undefined,
  );
}

function compare(a: ReviewVerdict, b: ReviewVerdict): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Statut de validation au regard de la tête courante (comparaison exacte du SHA). */
export function validationOf(latest: ReviewVerdict | undefined, headSha: string): ValidationState {
  if (latest === undefined) return { validation: "to_validate", previouslyValidated: false };
  if (latest.sha === headSha) {
    return {
      validation: latest.status === "approved" ? "validated" : "to_revise",
      previouslyValidated: false,
    };
  }
  return { validation: "to_validate", previouslyValidated: latest.status === "approved" };
}
