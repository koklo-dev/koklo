import {
  type FeatureFormValues,
  FIELD_ORDER,
  type FieldKey,
  isLinkField,
  parseLinks,
  sameField,
} from "./feature-form.ts";
import { criteriaLabel, priorityLabel, statusLabel } from "./feature-labels.ts";

/** Comparaison à trois du conflit de version (S-feature-form §5.8). */
export interface RebaseResult {
  /** Saisie rebasée : la vôtre là où vous seul avez modifié ou où les deux ont modifié, la version actuelle ailleurs. */
  values: FeatureFormValues;
  /** Nouvelle référence : la version actuelle. */
  baseline: FeatureFormValues;
  /** Champs modifiés des deux côtés avec des valeurs différentes. */
  conflicts: FieldKey[];
}

export function rebase(
  baseline: FeatureFormValues,
  mine: FeatureFormValues,
  current: FeatureFormValues,
): RebaseResult {
  const values = { ...current } as Record<FieldKey, unknown>;
  const conflicts: FieldKey[] = [];
  for (const field of FIELD_ORDER) {
    if (sameField(baseline, mine, field)) continue;
    values[field] = mine[field];
    if (!sameField(baseline, current, field) && !sameField(mine, current, field)) {
      conflicts.push(field);
    }
  }
  return { values: values as unknown as FeatureFormValues, baseline: current, conflicts };
}

const EXCERPT_MAX = 120;
const EMPTY_TEXT = "Aucune valeur";

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return EMPTY_TEXT;
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat;
}

/** « Valeur actuelle dans la spec : … » : texte d'un champ, 120 caractères au plus. */
export function describeCurrentValue(field: FieldKey, values: FeatureFormValues): string {
  if (field === "priority") return priorityLabel(values.priority);
  if (field === "status") return statusLabel(values.status);
  if (field === "criteria") return criteriaLabel(values.criteria.length);
  if (isLinkField(field)) return excerpt(parseLinks(values[field]).join(", "));
  return excerpt(values[field]);
}
