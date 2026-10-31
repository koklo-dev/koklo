import type { FeatureDetail } from "@koklo/contract";
import type { FeaturePriority, FeatureStatus, StepType } from "./feature-labels.ts";

/**
 * Squelette Red (TK-48 / 48e) : valeurs, validation et comparaison du formulaire d'une fonctionnalité.
 * Contrat imposé : .workflow/TK-48/03-red-48e.md. Le Green remplace les corps.
 */
export interface StepValue {
  type: StepType;
  text: string;
}
export interface CriterionValue {
  /** `AC-n` d'un critère existant (lecture seule) ; absent pour un critère ajouté ou dont le titre a changé. */
  id?: string;
  title: string;
  steps: StepValue[];
}
export interface FeatureFormValues {
  title: string;
  /** "" tant que la personne n'a rien choisi (aucune présélection). */
  priority: "" | FeaturePriority;
  status: FeatureStatus;
  description: string;
  criteria: CriterionValue[];
  /** Listes de liens : un identifiant par ligne (lignes vides ignorées). */
  screens: string;
  roles: string;
  rules: string;
  tables: string;
  endpoints: string;
  nfr: string;
}
export type FieldKey = Exclude<keyof FeatureFormValues, never>;
export interface FormIssue {
  /** `title`, `priority`, `criteria.<n>.title`, `criteria.<n>.steps.<m>.text` (n, m à partir de 1), `screens`, `roles`... */
  field: string;
  message: string;
}

export const LINK_FIELDS = ["screens", "roles", "rules", "tables", "endpoints", "nfr"] as const;
export const EMPTY_VALUES: FeatureFormValues = {
  title: "",
  priority: "",
  status: "brouillon",
  description: "",
  criteria: [],
  screens: "",
  roles: "",
  rules: "",
  tables: "",
  endpoints: "",
  nfr: "",
};

export function valuesFromDetail(_detail: FeatureDetail): FeatureFormValues {
  throw new Error("valuesFromDetail : non implémenté");
}
export function validateFeatureForm(_values: FeatureFormValues): FormIssue[] {
  throw new Error("validateFeatureForm : non implémenté");
}
/** Champs dont la valeur normalisée diffère (titre sans espaces autour, CRLF=LF, liens sans lignes vides). */
export function diffValues(_baseline: FeatureFormValues, _values: FeatureFormValues): FieldKey[] {
  throw new Error("diffValues : non implémenté");
}
/** Contrôle préalable du designer (S-feature-form §5.4) : `null` si la règle est respectée. */
export function checkDesignerScreens(
  _mode: "create" | "update",
  _baseline: FeatureFormValues | null,
  _values: FeatureFormValues,
): FormIssue | null {
  throw new Error("checkDesignerScreens : non implémenté");
}
