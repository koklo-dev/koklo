import { sortIssues } from "./issue.ts";
import { parseSpecFiles } from "./parse/files.ts";
import { buildIndex } from "./rules/index.ts";
import { checkRule4 } from "./rules/rule4.ts";
import { checkRule5 } from "./rules/rule5.ts";
import { checkRule7 } from "./rules/rule7.ts";
import type { Issue, ParsedSpec, SpecFile, ValidationReport } from "./types.ts";

export function buildReport(issues: readonly Issue[]): ValidationReport {
  const sorted = sortIssues(issues);
  const error = sorted.filter((i) => i.severity === "error").length;
  return { ok: error === 0, counts: { error, warning: sorted.length - error }, issues: sorted };
}

/** Règles 4, 5 et 7 sur des entités déjà parsées. Pure, ne mute pas l'entrée. */
export function validateSpec(spec: ParsedSpec): ValidationReport {
  const index = buildIndex(spec);
  return buildReport([
    ...checkRule4(spec, index),
    ...checkRule5(spec, index),
    ...checkRule7(spec, index),
  ]);
}

/** Parse puis valide : rapport complet, structure comprise. */
export function checkSpec(files: readonly SpecFile[]): ValidationReport {
  const { spec, issues } = parseSpecFiles(files);
  return buildReport([...issues, ...validateSpec(spec).issues]);
}
