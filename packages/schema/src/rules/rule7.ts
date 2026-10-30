import type { IssueCode } from "../codes.ts";
import type { SpecNode } from "../entities/index.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue, ParsedSpec } from "../types.ts";
import { parseDataRef, type SpecIndex } from "./index.ts";

type Referenced = { tables: Set<string>; endpoints: Set<string> };

/** Tables et endpoints cités par les annotations d'un arbre d'écran, descendants compris. */
function collectFromNode(node: SpecNode, used: Referenced): void {
  for (const a of node.annotations ?? []) {
    const ref = a.donnee === undefined ? undefined : parseDataRef(a.donnee);
    if (ref?.ok) used.tables.add(ref.table);
    if (a.endpoint !== undefined) used.endpoints.add(a.endpoint);
  }
  for (const child of node.enfants ?? []) collectFromNode(child, used);
}

function collectFromRelations(spec: ParsedSpec, used: Referenced): void {
  const sides = spec.relations.flatMap(({ value }) =>
    value.relations.flatMap((r) => [r.from, r.to]),
  );
  for (const side of sides) {
    const ref = parseDataRef(side);
    if (ref.ok) used.tables.add(ref.table);
  }
}

function collectReferences(spec: ParsedSpec): Referenced {
  const used: Referenced = { tables: new Set(), endpoints: new Set() };
  for (const { value: f } of spec.features) {
    for (const t of f.tables) used.tables.add(t);
    for (const e of f.endpoints) used.endpoints.add(e);
  }
  for (const { value: e } of spec.endpoints) for (const t of e.tables ?? []) used.tables.add(t);
  collectFromRelations(spec, used);
  for (const { value: s } of spec.screens) collectFromNode(s.arbre, used);
  return used;
}

const warn = (code: IssueCode, path: string, entityId: string, message: string): Issue =>
  ruleIssue(7, code, path, "", entityId, message);

/** Règle 7 (avertissement) : aucune table, endpoint, écran ni test jamais référencé. */
export function checkRule7(spec: ParsedSpec, index: SpecIndex): Issue[] {
  const used = collectReferences(spec);
  const cited = new Set(spec.features.flatMap((f) => f.value.ecrans));
  return [
    ...spec.tables
      .filter(({ value: t }) => !used.tables.has(t.id))
      .map(({ path, value: t }) =>
        warn(
          "R7_ORPHAN_TABLE",
          path,
          t.id,
          `La table ${t.id} n'est référencée par aucune feature, endpoint, relation ni annotation.`,
        ),
      ),
    ...spec.endpoints
      .filter(({ value: e }) => !used.endpoints.has(e.id))
      .map(({ path, value: e }) =>
        warn(
          "R7_ORPHAN_ENDPOINT",
          path,
          e.id,
          `L'endpoint ${e.id} n'est référencé par aucune feature ni annotation.`,
        ),
      ),
    ...spec.screens
      .filter(({ value: s }) => !cited.has(s.id) && !s.features.some((f) => index.features.has(f)))
      .map(({ path, value: s }) =>
        warn(
          "R7_ORPHAN_SCREEN",
          path,
          s.id,
          `L'écran ${s.id} n'est cité par aucune feature et ne cite aucune feature existante.`,
        ),
      ),
    ...spec.tests
      .filter(({ value: t }) => !index.features.has(t.feature))
      .map(({ path, value: t }) =>
        warn(
          "R7_ORPHAN_TEST",
          path,
          t.feature,
          `Le scénario de test vise la feature ${t.feature}, qui n'existe pas.`,
        ),
      ),
  ];
}
