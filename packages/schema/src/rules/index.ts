import type { Criterion } from "../entities/index.ts";
import type { ParsedSpec } from "../types.ts";

export type DataRef = { ok: true; table: string; field?: string } | { ok: false };

const DATA_REF = /^(T-[a-z0-9][a-z0-9-]*)(?:\.([a-z_][a-z0-9_]*))?$/;

/** `T-user` ou `T-user.email` ; toute autre forme est mal formée. */
export function parseDataRef(value: string): DataRef {
  const match = DATA_REF.exec(value);
  if (!match?.[1]) return { ok: false };
  return match[2] === undefined
    ? { ok: true, table: match[1] }
    : { ok: true, table: match[1], field: match[2] };
}

/** Index de résolution construit une fois pour les trois règles. */
export type SpecIndex = {
  features: Map<
    string,
    { path: string; criteria: ReadonlySet<string>; list: readonly Criterion[] }
  >;
  tables: Map<string, ReadonlySet<string>>;
  endpoints: Set<string>;
  screens: Set<string>;
  roles: Set<string>;
  permissions: Set<string>;
  rules: Set<string>;
};

export function buildIndex(spec: ParsedSpec): SpecIndex {
  return {
    features: new Map(
      spec.features.map((f) => [
        f.value.id,
        {
          path: f.path,
          criteria: new Set(f.value.criteres.map((c) => c.id)),
          list: f.value.criteres,
        },
      ]),
    ),
    tables: new Map(
      spec.tables.map((t) => [t.value.id, new Set(t.value.champs.map((c) => c.nom))]),
    ),
    endpoints: new Set(spec.endpoints.map((e) => e.value.id)),
    screens: new Set(spec.screens.map((s) => s.value.id)),
    roles: new Set(spec.roles.flatMap((f) => f.value.roles.map((r) => r.id))),
    permissions: new Set(spec.roles.flatMap((f) => f.value.permissions.map((p) => p.id))),
    rules: new Set(spec.rules.map((r) => r.value.id)),
  };
}
