/**
 * Dérivations pures de la coquille (TK-88, B77). La disponibilité des livrables vient de `spec.deliverables`
 * (TK-100, règle B1 du domaine) : la coquille ne la calcule plus.
 */
export type ProjectPhase = "idea" | "framing" | "iterations";

export interface ShellFacts {
  /** Fonctionnalités de l'instantané courant de la spec (0 sans dépôt ni index). */
  featureCount: number;
  /** Baselines `validated` ou `tagged`. */
  validatedBaselines: number;
  /** Versions `idea-vN` dont le lot est commité (TK-91, B260). */
  ideaVersions: number;
}

/** `idea` tant qu'aucune version `idea-vN` n'est commitée et qu'aucune fonctionnalité n'existe ; `framing` ensuite. */
export function phaseOf({
  featureCount,
  validatedBaselines,
  ideaVersions,
}: ShellFacts): ProjectPhase {
  if (featureCount === 0 && ideaVersions === 0) return "idea";
  return validatedBaselines > 0 ? "iterations" : "framing";
}
