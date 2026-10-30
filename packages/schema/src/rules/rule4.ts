import type { IssueCode } from "../codes.ts";
import type { Annotation, SpecNode } from "../entities/index.ts";
import { ruleIssue } from "../issue.ts";
import type { Issue, ParsedSpec } from "../types.ts";
import { parseDataRef, type SpecIndex } from "./index.ts";

type Emit = (code: IssueCode, pointer: string, message: string) => void;

function emitterFor(out: Issue[], path: string, entityId: string | undefined): Emit {
  return (code, pointer, message) => {
    out.push(ruleIssue(4, code, path, pointer, entityId, message));
  };
}

/** `T-x` ou `T-x.champ` : la table puis le champ doivent exister. */
function checkDataRef(value: string, pointer: string, index: SpecIndex, emit: Emit): void {
  const ref = parseDataRef(value);
  if (!ref.ok) {
    emit(
      "R4_MALFORMED_DATA_REF",
      pointer,
      `La donnée « ${value} » n'est ni T-table ni T-table.champ.`,
    );
    return;
  }
  const fields = index.tables.get(ref.table);
  if (!fields) {
    emit("R4_UNKNOWN_TABLE", pointer, `La table ${ref.table} citée par « ${value} » n'existe pas.`);
  } else if (ref.field !== undefined && !fields.has(ref.field)) {
    emit(
      "R4_UNKNOWN_FIELD",
      pointer,
      `Le champ « ${value} » n'existe pas dans la table ${ref.table}.`,
    );
  }
}

function checkList(
  items: readonly string[] | undefined,
  base: string,
  known: (id: string) => boolean,
  code: IssueCode,
  label: string,
  emit: Emit,
): void {
  (items ?? []).forEach((id, i) => {
    if (!known(id)) emit(code, `${base}/${i}`, `${label} ${id} n'existe pas.`);
  });
}

function checkAnnotation(a: Annotation, base: string, index: SpecIndex, emit: Emit): void {
  const feature = index.features.get(a.feature);
  if (!feature) {
    emit("R4_UNKNOWN_FEATURE", `${base}/feature`, `La feature ${a.feature} n'existe pas.`);
  } else if (a.critere !== undefined && !feature.criteria.has(a.critere)) {
    emit(
      "R4_UNKNOWN_CRITERION",
      `${base}/critere`,
      `Le critère ${a.critere} n'existe pas dans la feature ${a.feature}.`,
    );
  }
  if (a.donnee !== undefined) checkDataRef(a.donnee, `${base}/donnee`, index, emit);
  if (a.endpoint !== undefined && !index.endpoints.has(a.endpoint)) {
    emit("R4_UNKNOWN_ENDPOINT", `${base}/endpoint`, `L'endpoint ${a.endpoint} n'existe pas.`);
  }
}

function walkNode(node: SpecNode, base: string, index: SpecIndex, emit: Emit): void {
  (node.annotations ?? []).forEach((a, i) => {
    checkAnnotation(a, `${base}/annotations/${i}`, index, emit);
  });
  (node.enfants ?? []).forEach((child, i) => {
    walkNode(child, `${base}/enfants/${i}`, index, emit);
  });
}

type Collect = (path: string, entityId: string) => Emit;

/** Liens de listes (`tables`, `endpoints`, ...) : un contrôle par couple (liste, règle). */
function checkLinks(
  checks: readonly {
    items: readonly string[] | undefined;
    base: string;
    known: { has(id: string): boolean };
    code: IssueCode;
    label: string;
  }[],
  emit: Emit,
): void {
  for (const c of checks)
    checkList(c.items, c.base, (id) => c.known.has(id), c.code, c.label, emit);
}

function featureLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const { path, value: f } of spec.features) {
    checkLinks(
      [
        {
          items: f.tables,
          base: "/tables",
          known: index.tables,
          code: "R4_UNKNOWN_TABLE",
          label: "La table",
        },
        {
          items: f.endpoints,
          base: "/endpoints",
          known: index.endpoints,
          code: "R4_UNKNOWN_ENDPOINT",
          label: "L'endpoint",
        },
        {
          items: f.ecrans,
          base: "/ecrans",
          known: index.screens,
          code: "R4_UNKNOWN_SCREEN",
          label: "L'écran",
        },
      ],
      at(path, f.id),
    );
  }
}

function screenLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const { path, value: s } of spec.screens) {
    const emit = at(path, s.id);
    checkLinks(
      [
        {
          items: s.features,
          base: "/features",
          known: index.features,
          code: "R4_UNKNOWN_FEATURE",
          label: "La feature",
        },
      ],
      emit,
    );
    walkNode(s.arbre, "/arbre", index, emit);
  }
}

function dataLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const { path, value: e } of spec.endpoints) {
    checkLinks(
      [
        {
          items: e.tables,
          base: "/tables",
          known: index.tables,
          code: "R4_UNKNOWN_TABLE",
          label: "La table",
        },
      ],
      at(path, e.id),
    );
  }
  for (const { path, value: file } of spec.relations) {
    file.relations.forEach((r, i) => {
      const emit = at(path, r.from.split(".")[0] ?? "");
      checkDataRef(r.from, `/relations/${i}/from`, index, emit);
      checkDataRef(r.to, `/relations/${i}/to`, index, emit);
    });
  }
}

function testLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const { path, value: t } of spec.tests) {
    const emit = at(path, t.feature);
    const feature = index.features.get(t.feature);
    if (!feature) {
      emit("R4_UNKNOWN_FEATURE", "/feature", `La feature ${t.feature} n'existe pas.`);
      continue;
    }
    t.criteres.forEach((c, i) => {
      if (feature.criteria.has(c)) return;
      emit(
        "R4_UNKNOWN_CRITERION",
        `/criteres/${i}`,
        `Le critère ${c} n'existe pas dans la feature ${t.feature}.`,
      );
    });
  }
}

/** Règle 4 : tout lien pointe vers une feature, table/champ, endpoint, écran ou critère existant. */
export function checkRule4(spec: ParsedSpec, index: SpecIndex): Issue[] {
  const out: Issue[] = [];
  const at: Collect = (path, entityId) => emitterFor(out, path, entityId);
  featureLinks(spec, index, at);
  screenLinks(spec, index, at);
  dataLinks(spec, index, at);
  testLinks(spec, index, at);
  return out;
}
