import { SPEC_REPORT_ISSUES_MAX } from "./constants.ts";
import type { ReportIssue, StoredReport } from "./types.ts";

const issueKey = (issue: ReportIssue): string =>
  [issue.rule, issue.code, issue.path, issue.pointer, issue.entityId ?? ""].join("|");

/**
 * Diagnostics de `after` absents de `before` (clé `rule|code|path|pointer|entityId`) : les erreurs
 * qui existaient déjà ne bloquent pas un lot qui ne les aggrave pas (un cadrage est incomplet).
 */
export function newIssues(
  before: readonly ReportIssue[],
  after: readonly ReportIssue[],
): ReportIssue[] {
  const known = new Set(before.map(issueKey));
  return after.filter((issue) => !known.has(issueKey(issue)));
}

/** Rapport du contrat : décomptes complets, `issues` plafonné à 100 avec `truncated`. */
export function toStoredReport(issues: readonly ReportIssue[]): StoredReport {
  const error = issues.filter((issue) => issue.severity === "error").length;
  return {
    ok: error === 0,
    counts: { error, warning: issues.length - error },
    truncated: issues.length > SPEC_REPORT_ISSUES_MAX,
    issues: issues.slice(0, SPEC_REPORT_ISSUES_MAX),
  };
}
