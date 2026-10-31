import type { FeatureDetail, FeatureSummary } from "@koklo/contract";
import type { IconName } from "@koklo/ui";

export type FeatureStatus = FeatureSummary["status"];
export type FeaturePriority = FeatureSummary["priority"];
export type StepType = FeatureDetail["criteria"][number]["steps"][number]["type"];

const TODO = "feature-labels: non implémenté";

/** Libellé du statut de spec ; une valeur inconnue ne sort jamais brute. */
export function statusLabel(_status: string): string {
  throw new Error(TODO);
}

/** Icône du statut de spec (jamais une teinte seule). */
export function statusIcon(_status: string): IconName {
  throw new Error(TODO);
}

/** Libellé de priorité (Indispensable, Importante, Souhaitable, Reportée). */
export function priorityLabel(_priority: string): string {
  throw new Error(TODO);
}

/** Mot d'ouverture d'une étape (Étant donné, Quand, Alors, Et). */
export function stepLabel(_type: string): string {
  throw new Error(TODO);
}

/** « N critère(s) » : singulier pour 0 et 1. */
export function criteriaLabel(_count: number): string {
  throw new Error(TODO);
}
