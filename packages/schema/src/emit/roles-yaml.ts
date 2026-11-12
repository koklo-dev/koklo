import { stringify } from "yaml";
import { type RolesFile, RolesFileSchema } from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitRolesError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitRolesError";
    this.path = path;
  }
}

/**
 * `domain/roles.yaml` canonique : rôles puis permissions, clés dans un ordre FIXE, objets neufs (aucune ancre). Les
 * restrictions gardent leur ordre d'insertion. Pure ; `parseSpecFiles(emit(f))` rend `f`, l'émission est idempotente.
 */
export function emitRolesYaml(file: RolesFile): string {
  const checked = RolesFileSchema.safeParse(file);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitRolesError(issue?.message ?? "rôles invalides", toPointer(issue?.path ?? []));
  }
  const { roles, permissions } = checked.data;
  return stringify(
    {
      roles: roles.map((role) => ({
        id: role.id,
        nom: role.nom,
        ...(role.description === undefined ? {} : { description: role.description }),
        permissions: [...role.permissions],
        ...(role.restrictions === undefined ? {} : { restrictions: { ...role.restrictions } }),
      })),
      permissions: permissions.map((permission) => ({
        id: permission.id,
        ...(permission.libelle === undefined ? {} : { libelle: permission.libelle }),
        action: permission.action,
        ressource: permission.ressource,
        ...(permission.conditions.length === 0 ? {} : { conditions: [...permission.conditions] }),
        ...(permission.endpoints.length === 0 ? {} : { endpoints: [...permission.endpoints] }),
      })),
    },
    { lineWidth: 0 },
  );
}
