import { findSecretPaths, SECRET_REFUSAL_MESSAGE, SECRET_VALUE_CODE } from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, failed, type Outcome } from "./types.ts";

/**
 * Dernier arbitre (TK-115, B724) : aucune valeur de secret n'entre dans la spec, quel que soit le lot (idée comprise). Le
 * rapport désigne le champ de l'opération, jamais la valeur. `undefined` : rien à refuser.
 */
export function secretRefusal(operations: readonly BatchOperation[]): Outcome | undefined {
  const issues = operations.flatMap((operation, i) =>
    findSecretPaths(operation.payload).map((pointer) => ({
      rule: "structure" as const,
      code: SECRET_VALUE_CODE,
      severity: "error" as const,
      path: "",
      pointer: `/operations/${i}${pointer}`,
      message: SECRET_REFUSAL_MESSAGE,
    })),
  );
  if (issues.length === 0) return undefined;
  return failed("SPEC_INVALID", toStoredReport(issues));
}
