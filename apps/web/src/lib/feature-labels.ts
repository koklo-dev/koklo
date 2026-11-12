import type { FeatureDetail, FeatureSummary } from "@koklo/contract";
import type { IconName, LifecycleStage, PriorityLevel, ValidationStatusValue } from "@koklo/ui";

export type FeatureStatus = FeatureSummary["status"];
export type FeaturePriority = FeatureSummary["priority"];
export type FeatureValidation = FeatureSummary["validation"];
export type StepType = FeatureDetail["criteria"][number]["steps"][number]["type"];

/** Libellé neutre d'une valeur que cette version ne connaît pas : jamais la valeur brute. */
const UNKNOWN = "Autre";

const STATUSES: Record<FeatureStatus, { label: string; icon: IconName }> = {
  brouillon: { label: "Brouillon", icon: "edit_note" },
  specifiee: { label: "Spécifiée", icon: "fact_check" },
  implementee: { label: "Implémentée", icon: "task_alt" },
  adoptee: { label: "Adoptée", icon: "check_circle" },
};

const PRIORITIES: Record<FeaturePriority, string> = {
  must: "Indispensable",
  should: "Importante",
  could: "Souhaitable",
  wont: "Reportée",
};

/** Barres allumées de `PriorityIndicator` (DESIGN.md v2 §5.1) : must 3 … wont 0. */
const PRIORITY_LEVELS: Record<FeaturePriority, PriorityLevel> = {
  must: 3,
  should: 2,
  could: 1,
  wont: 0,
};

const STEPS: Record<StepType, string> = {
  etant_donne: "Étant donné",
  quand: "Quand",
  alors: "Alors",
  et: "Et",
};

function lookup<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Libellé du statut de spec ; une valeur inconnue ne sort jamais brute. */
export function statusLabel(status: string): string {
  return lookup(STATUSES, status)?.label ?? UNKNOWN;
}

/** Icône du statut de spec (jamais une teinte seule). */
export function statusIcon(status: string): IconName {
  return lookup(STATUSES, status)?.icon ?? "radio_button_unchecked";
}

/** Libellé de priorité (Indispensable, Importante, Souhaitable, Reportée). */
export function priorityLabel(priority: string): string {
  return lookup(PRIORITIES, priority) ?? UNKNOWN;
}

/** Niveau de `PriorityIndicator` ; une valeur inconnue n'allume aucune barre. */
export function priorityLevel(priority: string): PriorityLevel {
  return lookup(PRIORITY_LEVELS, priority) ?? 0;
}

/**
 * Stade de `LifecycleStatus` dérivé des données présentes (H3, questions.md B22), en attendant le calcul
 * serveur : implementee ou adoptee -> Implémentée (3) ; sinon au moins un critère -> Spécifiée (1) ; sinon
 * Idée (0). Conçue, Testée et Livrée ne sont jamais déduits : la donnée manque, pas de faux contenu.
 */
export function lifecycleStage(feature: { status: string; criteriaCount: number }): LifecycleStage {
  if (feature.status === "implementee" || feature.status === "adoptee") return 3;
  return feature.criteriaCount > 0 ? 1 : 0;
}

/** Mot d'ouverture d'une étape (Étant donné, Quand, Alors, Et). */
export function stepLabel(type: string): string {
  return lookup(STEPS, type) ?? UNKNOWN;
}

/** « N critère(s) » : singulier pour 0 et 1. */
export function criteriaLabel(count: number): string {
  return count > 1 ? `${count} critères` : `${count} critère`;
}

const VALIDATIONS: Record<FeatureValidation, { label: string; status: ValidationStatusValue }> = {
  validated: { label: "Validée", status: "validated" },
  to_validate: { label: "À valider", status: "pending" },
  to_revise: { label: "À revoir", status: "revise" },
};

/** Libellé de la validation client d'une fonctionnalité (Validée, À valider, À revoir). */
export function validationLabel(validation: string): string {
  return lookup(VALIDATIONS, validation)?.label ?? UNKNOWN;
}

/** Statut de `ValidationStatus` d'une validation ; une valeur inconnue reste « À valider » (jamais validée). */
export function validationStatus(validation: string): ValidationStatusValue {
  return lookup(VALIDATIONS, validation)?.status ?? "pending";
}
