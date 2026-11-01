import type { FieldKey } from "./feature-form.ts";

/** Bouton d'entrée de la suppression : reçoit le focus quand on garde la fonctionnalité. */
export const DELETE_TRIGGER_ID = "feature-delete-trigger";

/** Texte qui explique pourquoi « Enregistrer » ou la suppression est désactivé. */
export const REASON_ID = "feature-form-save-reason";

/** Libellés des champs, pour les avis de conflit et les liens de diagnostic. */
export const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Titre",
  priority: "Priorité",
  status: "Statut",
  description: "Description",
  criteria: "Critères d'acceptation",
  screens: "Écrans",
  roles: "Rôles",
  rules: "Règles",
  tables: "Tables",
  endpoints: "Endpoints",
  nfr: "Exigences non fonctionnelles",
};

/** Identifiant DOM d'un champ du formulaire d'après son nom d'erreur (`criteria.2.title` devient `feature-form-criteria-2-title`). */
export const fieldId = (field: string): string => `feature-form-${field.replaceAll(".", "-")}`;

export const ADD_CRITERION_ID = "feature-form-criteria-add";

/** Élément qui reçoit le focus pour un champ, `criteria` sans nom précis visant le premier critère. */
export function focusIdOf(field: string, criteriaCount: number): string {
  if (field !== "criteria") return fieldId(field);
  return criteriaCount > 0 ? fieldId("criteria.1.title") : ADD_CRITERION_ID;
}

/** Champ de premier niveau d'une erreur de validation (`criteria.2.title` -> `criteria`). */
export const topField = (field: string): FieldKey => field.split(".")[0] as FieldKey;
