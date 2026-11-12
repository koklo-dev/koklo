/** Statut de validation d'une cible, vu du client (TK-55b). */
export type Validation = "validated" | "to_validate" | "to_revise";

/** Verdict d'une review, tel que stocké : `sha` est la tête de spec lue au moment du verdict. */
export interface ReviewVerdict {
  id: string;
  status: "approved" | "changes_requested" | "withdrawn";
  sha: string;
  createdAt: Date;
  /** Hachage du contenu de la cible au moment du verdict (`review_versions`) ; absent pour une review d'avant TK-100. */
  contentHash?: string | null;
  /** Hachage courant du contenu de la cible, posé par le lecteur ; absent quand l'index n'a pas encore d'entités. */
  currentHash?: string | null;
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

/**
 * Le verdict porte-t-il encore sur le contenu courant ? Comparaison du hachage de la cible quand la review en a un et que
 * l'index aussi (TK-100, B11 : un autre élément ou la mise en page ne l'invalident pas), sinon du SHA de tête.
 */
export function isCurrent(verdict: ReviewVerdict, headSha: string): boolean {
  const { contentHash, currentHash } = verdict;
  if (contentHash != null && currentHash != null) return contentHash === currentHash;
  return verdict.sha === headSha;
}

/** Statut de validation au regard du contenu courant de la cible (hachage, à défaut SHA de tête). */
export function validationOf(latest: ReviewVerdict | undefined, headSha: string): ValidationState {
  // « Annuler » (B349) : la cible redevient à valider, jamais « précédemment validée ».
  if (latest === undefined || latest.status === "withdrawn") {
    return { validation: "to_validate", previouslyValidated: false };
  }
  if (isCurrent(latest, headSha)) {
    return {
      validation: latest.status === "approved" ? "validated" : "to_revise",
      previouslyValidated: false,
    };
  }
  return { validation: "to_validate", previouslyValidated: latest.status === "approved" };
}
