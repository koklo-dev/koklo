/** Squelette Red (TK-48 / 48c) : table code d'erreur -> texte et action (design/screens/S-projects.md §4.1). */
export interface SpecRepoErrorContext {
  /** Login du compte GitHub choisi. */
  ownerLogin: string;
  /** Nom de dépôt saisi (vide si le champ était vide). */
  repoName: string;
}

export interface SpecRepoErrorView {
  /** Texte affiché sous le titre fixe ; jamais de valeur brute de l'erreur. */
  text: string;
  /** Action principale : « Réessayer », « Autoriser Koklo », « Réautoriser Koklo » ou « Fermer » seul. */
  action: "retry" | "authorize" | "reauthorize" | "close";
  /** `spec_repo_exists` : succès, pas une erreur. */
  alreadyExists?: boolean;
  /** Lien « Ouvrir la page GitHub » (autorisation d'installation expirée). */
  githubLink?: boolean;
  /** Champ à focaliser. */
  focus?: "repo-name";
  /** Propose « Relier un dépôt existant ». */
  offerLink?: boolean;
  /** La liste des comptes est périmée : à recharger. */
  reloadAccounts?: boolean;
  /** Erreur à poser sous le champ « Nom du dépôt » (le titre fixe reste affiché). */
  fieldError?: string;
}

export function describeSpecRepoError(
  _error: unknown,
  _context: SpecRepoErrorContext,
): SpecRepoErrorView {
  throw new Error("describeSpecRepoError: non implémenté (TK-48c)");
}
