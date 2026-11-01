import type { Permission, Role, RolesFile } from "../entities/index.ts";
import type { ParsedSpec } from "../types.ts";
import type { SpecIndex } from "./index.ts";
import { type Collect, checkLinks, type Emit } from "./rule4-links.ts";

type Link = Parameters<typeof checkLinks>[0][number];

const roleLink = (items: readonly string[], index: SpecIndex): Link => ({
  items,
  base: "/roles",
  known: index.roles,
  code: "R4_UNKNOWN_ROLE",
  label: "Le rôle",
});

const tablesAndEndpoints = (
  value: { tables: readonly string[]; endpoints: readonly string[] },
  index: SpecIndex,
): Link[] => [
  {
    items: value.tables,
    base: "/tables",
    known: index.tables,
    code: "R4_UNKNOWN_TABLE",
    label: "La table",
  },
  {
    items: value.endpoints,
    base: "/endpoints",
    known: index.endpoints,
    code: "R4_UNKNOWN_ENDPOINT",
    label: "L'endpoint",
  },
];

function referencingLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const { path, value: f } of spec.features) {
    const rules: Link = {
      items: f.regles,
      base: "/regles",
      known: index.rules,
      code: "R4_UNKNOWN_RULE",
      label: "La règle",
    };
    checkLinks([roleLink(f.roles, index), rules], at(path, f.id));
  }
  for (const { path, value: s } of spec.screens) {
    checkLinks([roleLink(s.roles, index)], at(path, s.id));
  }
  for (const { path, value: r } of spec.rules) {
    checkLinks(tablesAndEndpoints(r, index), at(path, r.id));
  }
}

function checkResource(permission: Permission, index: SpecIndex, emit: Emit, i: number): void {
  const isTable = permission.ressource.startsWith("T-");
  const known = isTable
    ? index.tables.has(permission.ressource)
    : index.endpoints.has(permission.ressource);
  if (known) return;
  const code = isTable ? "R4_UNKNOWN_TABLE" : "R4_UNKNOWN_ENDPOINT";
  const label = isTable ? "La table" : "L'endpoint";
  emit(code, `/permissions/${i}/ressource`, `${label} ${permission.ressource} n'existe pas.`);
}

function permissionLinks(file: RolesFile, index: SpecIndex, path: string, at: Collect): void {
  file.permissions.forEach((permission, i) => {
    const emit = at(path, permission.id);
    checkResource(permission, index, emit, i);
    const endpoints: Link = {
      items: permission.endpoints,
      base: `/permissions/${i}/endpoints`,
      known: index.endpoints,
      code: "R4_UNKNOWN_ENDPOINT",
      label: "L'endpoint",
    };
    checkLinks([endpoints], emit);
  });
}

function roleLinks(roles: readonly Role[], index: SpecIndex, path: string, at: Collect): void {
  roles.forEach((role, i) => {
    const link: Link = {
      items: role.permissions,
      base: `/roles/${i}/permissions`,
      known: index.permissions,
      code: "R4_UNKNOWN_PERMISSION",
      label: "La permission",
    };
    checkLinks([link], at(path, role.id));
  });
}

/** Règle 4 pour `domain/` : rôles, permissions et règles métier citent des entités existantes. */
export function checkDomainLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  referencingLinks(spec, index, at);
  for (const { path, value: file } of spec.roles) {
    roleLinks(file.roles, index, path, at);
    permissionLinks(file, index, path, at);
  }
}
