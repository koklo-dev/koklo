import type { FeatureDetail, FeatureSummary } from "@koklo/contract";
import type { IconName } from "@koklo/ui";

export type FeatureStatus = FeatureSummary["status"];
export type FeaturePriority = FeatureSummary["priority"];
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

/** Mot d'ouverture d'une étape (Étant donné, Quand, Alors, Et). */
export function stepLabel(type: string): string {
  return lookup(STEPS, type) ?? UNKNOWN;
}

/** « N critère(s) » : singulier pour 0 et 1. */
export function criteriaLabel(count: number): string {
  return count > 1 ? `${count} critères` : `${count} critère`;
}
