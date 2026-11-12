import { type DeliverableKey, type DeliverableStatus, staleLivrables } from "@koklo/domain";

/** Impact de la dernière version d'idée figée sur les livrables (B328) : lu en base, jamais le contenu des pages. */
export interface IdeaImpact {
  /** Étiquette de la version figée la plus récente (`idea-v2`). */
  idea: string;
  frozenAt: Date;
  /** Pages ajoutées, modifiées ou retirées depuis la version précédente. */
  changedPages: number;
  /** Date de la dernière validation (toute décision) de chaque livrable ; absente s'il n'en a jamais eu. */
  lastReviewAt: Partial<Record<DeliverableKey, Date>>;
}

export interface StaleBecause {
  idea: string;
  changedPages: number;
}

/**
 * Livrables « À revoir » à cause d'une nouvelle version d'idée : dépendants de l'idée, de proche en proche, qui ont déjà
 * été validés ou enregistrés (une décision existe) avant cette version. Un livrable jamais validé n'est pas touché ; un
 * forçage ne masque rien (il n'intervient pas ici).
 */
export function staleBecauseOf(
  impact: IdeaImpact | null,
): Partial<Record<DeliverableKey, StaleBecause>> {
  if (impact === null || impact.changedPages === 0) return {};
  const stale: Partial<Record<DeliverableKey, StaleBecause>> = {};
  for (const key of staleLivrables(["idea"])) {
    const reviewed = impact.lastReviewAt[key];
    if (reviewed !== undefined && reviewed < impact.frozenAt) {
      stale[key] = { idea: impact.idea, changedPages: impact.changedPages };
    }
  }
  return stale;
}

/** Statut d'un livrable périmé : toujours « À revoir ». */
export const staleStatus = (status: DeliverableStatus, stale: boolean): DeliverableStatus =>
  stale ? "revise" : status;
