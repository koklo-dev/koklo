import type { IssueCode } from "../codes.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue, ParsedSpec } from "../types.ts";

const warn = (code: IssueCode, path: string, pointer: string, id: string, message: string) =>
  ruleIssue(7, code, path, pointer, id, message);

/** Rôles, permissions et règles jamais utilisés (avertissements de la règle 7). */
export function checkDomainOrphans(spec: ParsedSpec): Issue[] {
  const citedRoles = new Set([
    ...spec.features.flatMap((f) => f.value.roles),
    ...spec.screens.flatMap((s) => s.value.roles),
  ]);
  const citedRules = new Set(spec.features.flatMap((f) => f.value.regles));
  const held = new Set(spec.roles.flatMap((f) => f.value.roles.flatMap((r) => r.permissions)));
  return [
    ...spec.roles.flatMap(({ path, value }) =>
      value.roles.flatMap((r, i) =>
        citedRoles.has(r.id)
          ? []
          : [
              warn(
                "R7_ORPHAN_ROLE",
                path,
                `/roles/${i}`,
                r.id,
                `Le rôle ${r.id} n'est cité par aucune feature ni aucun écran.`,
              ),
            ],
      ),
    ),
    ...spec.roles.flatMap(({ path, value }) =>
      value.permissions.flatMap((p, i) =>
        held.has(p.id)
          ? []
          : [
              warn(
                "R7_ORPHAN_PERMISSION",
                path,
                `/permissions/${i}`,
                p.id,
                `La permission ${p.id} n'est détenue par aucun rôle.`,
              ),
            ],
      ),
    ),
    ...spec.rules
      .filter(({ value: r }) => !citedRules.has(r.id))
      .map(({ path, value: r }) =>
        warn("R7_ORPHAN_RULE", path, "", r.id, `La règle ${r.id} n'est citée par aucune feature.`),
      ),
  ];
}
