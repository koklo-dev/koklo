import type { FeatureFormValues, FieldKey } from "./feature-form.ts";

/** Squelette Red (TK-48 / 48e) : comparaison à trois du conflit de version (S-feature-form §5.8). */
export interface RebaseResult {
  /** Saisie rebasée : la vôtre là où vous seul avez modifié ou où les deux ont modifié, la version actuelle ailleurs. */
  values: FeatureFormValues;
  /** Nouvelle référence : la version actuelle. */
  baseline: FeatureFormValues;
  /** Champs modifiés des deux côtés avec des valeurs différentes. */
  conflicts: FieldKey[];
}
export function rebase(
  _baseline: FeatureFormValues,
  _mine: FeatureFormValues,
  _current: FeatureFormValues,
): RebaseResult {
  throw new Error("rebase : non implémenté");
}
/** « Valeur actuelle dans la spec : … » : texte d'un champ, 120 caractères au plus. */
export function describeCurrentValue(_field: FieldKey, _values: FeatureFormValues): string {
  throw new Error("describeCurrentValue : non implémenté");
}
