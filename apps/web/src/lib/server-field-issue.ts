import { errorCode, errorData } from "./api-error.ts";
import type { SaveFailure } from "./feature-errors.ts";
import type { FormIssue } from "./feature-form.ts";

const OPERATION_FIELD = /^operations\.\d+\.([A-Za-z]+)/;

/**
 * Refus du serveur qui vise un champ du formulaire (422 `VALIDATION`, `data.field` = `operations.<i>.<champ>`) avec sa
 * phrase (`data.message`, jamais la valeur refusée) ; `null` pour tout autre échec.
 */
export function serverFieldIssue(
  failure: SaveFailure | null,
  labels: Record<string, string>,
): FormIssue | null {
  if (failure?.source !== "submit" || errorCode(failure.error) !== "VALIDATION") return null;
  const data = errorData(failure.error);
  const field = OPERATION_FIELD.exec(String(data?.field ?? ""))?.[1];
  const message = data?.message;
  if (!field || !Object.hasOwn(labels, field) || typeof message !== "string") return null;
  return { field, message };
}
