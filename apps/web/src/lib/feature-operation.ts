import type { SpecBatchSubmitInput, SpecOperation } from "@koklo/contract";
import {
  diffValues,
  type FeatureFormValues,
  type FieldKey,
  isLinkField,
  LINK_FIELDS,
  normalizeCriteria,
  normalizeText,
  parseLinks,
} from "./feature-form.ts";

/** Valeur d'un champ telle que le contrat l'attend (titre sans espaces, liens en tableaux, critères en bloc). */
function fieldValue(values: FeatureFormValues, field: FieldKey): unknown {
  if (field === "title") return values.title.trim();
  if (field === "description") return normalizeText(values.description);
  if (field === "criteria") return normalizeCriteria(values.criteria);
  if (isLinkField(field)) return parseLinks(values[field]);
  return values[field];
}

const CREATE_OPTIONAL: readonly FieldKey[] = ["status", "description", "criteria", ...LINK_FIELDS];

/** Un champ facultatif n'est envoyé à la création que s'il diffère de sa valeur par défaut. */
function isFilled(values: FeatureFormValues, field: FieldKey): boolean {
  if (field === "status") return values.status !== "brouillon";
  if (field === "description") return values.description.trim() !== "";
  if (field === "criteria") return values.criteria.length > 0;
  return isLinkField(field) && parseLinks(values[field]).length > 0;
}

export function buildCreateOperation(values: FeatureFormValues): SpecOperation {
  const operation: Record<string, unknown> = {
    kind: "feature.create",
    title: fieldValue(values, "title"),
    priority: values.priority,
  };
  for (const field of CREATE_OPTIONAL.filter((f) => isFilled(values, f)))
    operation[field] = fieldValue(values, field);
  return operation as SpecOperation;
}

/** `null` quand rien n'a changé (le contrat exige au moins un champ modifié). */
export function buildUpdateOperation(
  specId: string,
  baseline: FeatureFormValues,
  values: FeatureFormValues,
): SpecOperation | null {
  const changed = diffValues(baseline, values);
  if (changed.length === 0) return null;
  const operation: Record<string, unknown> = { kind: "feature.update", specId };
  for (const field of changed) operation[field] = fieldValue(values, field);
  return operation as SpecOperation;
}

/** Suppression : `{ kind: "feature.delete", specId }` seule (S-feature-form §4.8). Squelette du Red 48e-2. */
export function buildDeleteOperation(_specId: string): SpecOperation {
  throw new Error("non implémenté");
}

export interface SubmitContext {
  projectId: string;
  idempotencyKey: string;
  /** `spec.head.branch`. */
  branch: string;
  /** `spec.head.commitSha` en modification ; absent à la création. */
  baseSha?: string;
}

export function buildSubmitInput(
  context: SubmitContext,
  operation: SpecOperation,
): SpecBatchSubmitInput {
  const { projectId, idempotencyKey, branch, baseSha } = context;
  return {
    projectId,
    idempotencyKey,
    branch,
    ...(baseSha === undefined ? {} : { baseSha }),
    operations: [operation],
  };
}
