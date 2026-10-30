import type { IssueCode } from "./codes.ts";
import type { Issue } from "./types.ts";

type StructCode = Extract<IssueCode, `STRUCT_${string}`>;

export function structIssue(
  code: StructCode,
  path: string,
  message: string,
  pointer = "",
  entityId?: string,
): Issue {
  const issue: Issue = { rule: "structure", code, severity: "error", path, pointer, message };
  if (entityId !== undefined) issue.entityId = entityId;
  return issue;
}

/** Émet une issue de règle : la règle 7 est un avertissement, les règles 4 et 5 des erreurs. */
export function ruleIssue(
  rule: 4 | 5 | 7,
  code: IssueCode,
  path: string,
  pointer: string,
  entityId: string | undefined,
  message: string,
): Issue {
  const issue: Issue = {
    rule,
    code,
    severity: rule === 7 ? "warning" : "error",
    path,
    pointer,
    message,
  };
  if (entityId !== undefined) issue.entityId = entityId;
  return issue;
}

/** Comparaison lexicographique en unités de code UTF-16 (indépendante de la locale). */
export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Tri total et stable : path, pointer, code, message (unités de code UTF-16). */
export function sortIssues(issues: readonly Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      compare(a.path, b.path) ||
      compare(a.pointer, b.pointer) ||
      compare(a.code, b.code) ||
      compare(a.message, b.message),
  );
}
