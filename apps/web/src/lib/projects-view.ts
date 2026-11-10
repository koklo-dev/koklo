export type ProjectsViewKind = "loading" | "error" | "empty" | "no-match" | "grid";

export interface ProjectsViewFacts {
  /** Une première page est arrivée. */
  hasData: boolean;
  /** La lecture a échoué sans rien à montrer (et sans redirection de session en cours). */
  failed: boolean;
  /** Le rôle est connu : il décide du texte de l'état vide et du bouton, on évite un flash. */
  roleKnown: boolean;
  /** Une recherche ou une phase est posée dans l'adresse. */
  filtered: boolean;
  /** Projets du total filtré et cartes déjà chargées. */
  total: number;
  shown: number;
}

/** Ce que montre `/projects` (S-projects v7 §4) : chargement, erreur, aucun projet, aucun résultat, ou la grille. */
export function projectsViewKind(facts: ProjectsViewFacts): ProjectsViewKind {
  if (facts.failed) return "error";
  if (!facts.hasData || !facts.roleKnown) return "loading";
  if (!facts.filtered && facts.total === 0) return "empty";
  return facts.shown === 0 ? "no-match" : "grid";
}
