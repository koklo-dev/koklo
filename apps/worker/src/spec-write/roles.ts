import {
  EmitRolesError,
  emitRolesYaml,
  type Permission,
  parseSpecFiles,
  type Role,
  type RolesFile,
} from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, failed } from "./types.ts";
import { forbidDesigner, invalidEmit, stop, type Workspace, writeFile } from "./workspace.ts";

export const ROLES_PATH = "domain/roles.yaml";

interface RolePayload {
  name?: string;
  description?: string;
  permissions?: { id: string; restriction?: string }[];
}

/** Fichier de rôles de la tête (vide s'il n'existe pas) ; un fichier invalide arrête le lot (`SPEC_INVALID`). */
export function readRoles(workspace: Workspace): RolesFile {
  const content = workspace.files.get(ROLES_PATH);
  if (content === undefined) return { roles: [], permissions: [] };
  const { spec, issues } = parseSpecFiles([{ path: ROLES_PATH, content }]);
  const file = spec.roles[0]?.value;
  return file ?? stop(failed("SPEC_INVALID", toStoredReport(issues)));
}

/** Rôles de la tête, pour détecter une collision ou une cible absente. */
export const roleIds = (workspace: Workspace): Set<string> =>
  new Set(workspace.files.has(ROLES_PATH) ? readRoles(workspace).roles.map((role) => role.id) : []);

/** `PM-agenda.modifier` -> ressource `agenda`, action `modifier` (nom métier, B338 c) ; sans point : action `acceder`. */
function permissionOf(id: string): Permission {
  const [resource = "", ...rest] = id.slice("PM-".length).split(".");
  return {
    id,
    ressource: resource,
    action: rest.length > 0 ? rest.join("-") : "acceder",
    conditions: [],
    endpoints: [],
  };
}

/** Les permissions citées et inconnues sont créées dans le même fichier. */
function withPermissions(file: RolesFile, ids: readonly string[]): Permission[] {
  const known = new Set(file.permissions.map((permission) => permission.id));
  const created = ids.filter((id, i) => !known.has(id) && ids.indexOf(id) === i).map(permissionOf);
  return [...file.permissions, ...created];
}

function restrictionsOf(permissions: NonNullable<RolePayload["permissions"]>) {
  const entries = permissions.flatMap(({ id, restriction }) =>
    restriction === undefined ? [] : [[id, restriction] as const],
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function patched(base: Role, payload: RolePayload): Role {
  const { restrictions: _dropped, ...rest } = base;
  const next: Role = { ...rest };
  if (payload.name !== undefined) next.nom = payload.name;
  if (payload.description !== undefined) next.description = payload.description;
  const kept = base.restrictions;
  if (payload.permissions === undefined) {
    return kept === undefined ? next : { ...next, restrictions: kept };
  }
  const restrictions = restrictionsOf(payload.permissions);
  next.permissions = payload.permissions.map(({ id }) => id);
  return restrictions === undefined ? next : { ...next, restrictions };
}

function save(workspace: Workspace, id: string, file: RolesFile): void {
  try {
    writeFile(workspace, ROLES_PATH, emitRolesYaml(file));
  } catch (error) {
    if (!(error instanceof EmitRolesError)) throw error;
    invalidEmit(ROLES_PATH, id, error);
  }
}

/**
 * `role.create|update|delete` sur `domain/roles.yaml` : le fichier est relu sur la tête à chaque tentative, seul le rôle
 * visé change (les autres rôles et permissions sont recopiés), donc deux lots concurrents sur deux rôles gardent les deux.
 */
export function applyRole(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as RolePayload;
  const file = readRoles(workspace);
  if (operation.kind === "role.delete") {
    save(workspace, id, { ...file, roles: file.roles.filter((role) => role.id !== id) });
    return;
  }
  const base: Role =
    operation.kind === "role.create"
      ? { id, nom: "", permissions: [] }
      : (file.roles.find((role) => role.id === id) as Role);
  const role = patched(base, payload);
  const roles =
    operation.kind === "role.create"
      ? [...file.roles, role]
      : file.roles.map((existing) => (existing.id === id ? role : existing));
  save(workspace, id, { roles, permissions: withPermissions(file, role.permissions) });
}
