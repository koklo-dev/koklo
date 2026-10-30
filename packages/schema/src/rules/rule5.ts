import type { IssueCode } from "../codes.ts";
import type { Feature } from "../entities/index.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue, ParsedSpec } from "../types.ts";
import type { SpecIndex } from "./index.ts";

function specifiedIsCovered(spec: ParsedSpec, index: SpecIndex, id: string): boolean {
  const feature = spec.features.find((f) => f.value.id === id)?.value;
  if (!feature) return false;
  return (
    feature.ecrans.some((s) => index.screens.has(s)) ||
    feature.endpoints.some((e) => index.endpoints.has(e)) ||
    spec.screens.some((s) => s.value.features.includes(id))
  );
}

const issue5 = (
  code: IssueCode,
  path: string,
  pointer: string,
  entityId: string,
  message: string,
): Issue => ruleIssue(5, code, path, pointer, entityId, message);

/** Critères couverts par au moins un scénario de test, par feature. */
function testedCriteria(spec: ParsedSpec): Map<string, Set<string>> {
  const tested = new Map<string, Set<string>>();
  for (const { value: t } of spec.tests) {
    const set = tested.get(t.feature) ?? new Set<string>();
    for (const c of t.criteres) set.add(c);
    tested.set(t.feature, set);
  }
  return tested;
}

function checkImplemented(
  path: string,
  f: Feature,
  tested: ReadonlyMap<string, ReadonlySet<string>>,
): Issue[] {
  const out: Issue[] = [];
  if (f.criteres.length === 0) {
    const message = `La feature ${f.id} est implémentée mais n'a aucun critère d'acceptation.`;
    out.push(issue5("R5_IMPLEMENTED_WITHOUT_CRITERIA", path, "/criteres", f.id, message));
  }
  f.criteres.forEach((c, i) => {
    if (tested.get(f.id)?.has(c.id)) return;
    const message = `Le critère ${c.id} de la feature ${f.id} n'est couvert par aucun test alors que la feature est implémentée.`;
    out.push(
      issue5("R5_IMPLEMENTED_CRITERION_WITHOUT_TEST", path, `/criteres/${i}`, f.id, message),
    );
  });
  return out;
}

/** Règle 5 : `specifiee` a un écran ou un endpoint ; `implementee` a un test par critère. */
export function checkRule5(spec: ParsedSpec, index: SpecIndex): Issue[] {
  const tested = testedCriteria(spec);
  return spec.features.flatMap(({ path, value: f }) => {
    if (f.statut === "implementee") return checkImplemented(path, f, tested);
    if (f.statut !== "specifiee" || specifiedIsCovered(spec, index, f.id)) return [];
    const message = `La feature ${f.id} est spécifiée mais n'a aucun écran ni endpoint existant.`;
    return [issue5("R5_SPECIFIED_WITHOUT_SCREEN_OR_ENDPOINT", path, "", f.id, message)];
  });
}
