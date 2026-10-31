import type { SpecBatchSubmitInput, SpecOperation } from "@koklo/contract";
import type { FeatureFormValues } from "./feature-form.ts";

type Operation = SpecOperation;

/** Squelette Red (TK-48 / 48e) : construction de l'opération et de l'entrée de `specBatch.submit` (§5.2). */
export function buildCreateOperation(_values: FeatureFormValues): Operation {
  throw new Error("buildCreateOperation : non implémenté");
}
/** `null` quand rien n'a changé (le contrat exige au moins un champ modifié). */
export function buildUpdateOperation(
  _specId: string,
  _baseline: FeatureFormValues,
  _values: FeatureFormValues,
): Operation | null {
  throw new Error("buildUpdateOperation : non implémenté");
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
  _context: SubmitContext,
  _operation: Operation,
): SpecBatchSubmitInput {
  throw new Error("buildSubmitInput : non implémenté");
}
