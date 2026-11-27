import {
  type MatrixCell,
  type MatrixRow,
  type RightRestriction,
  type RightsFile,
  type Role,
  type RolesFile,
  SECURITY_LIMITS,
} from "../entities/index.ts";
import { oneLineOf } from "./text.ts";

/**
 * Matrice des droits (TK-117, B794) : actions = permissions de `domain/roles.yaml`, colonnes = rôles. La Sécurité
 * n'accorde ni ne retire jamais une permission : elle ajoute des restrictions à celles qu'un rôle porte. Fonctions pures.
 */
type Permission = RolesFile["permissions"][number];

/** Libellé d'une permission, sinon (absent ou blanc) son action et sa ressource. */
export const permissionLabel = (permission: Permission): string =>
  oneLineOf(permission.libelle ?? "", SECURITY_LIMITS.line) ||
  oneLineOf(`${permission.action} ${permission.ressource}`, SECURITY_LIMITS.line);

/** Absente : « non » ; portée et restreinte (par le rôle ou la Sécurité) : « restreint » ; sinon « oui ». */
function cellOf(
  role: Role,
  permission: string,
  restrictions: readonly RightRestriction[],
): MatrixCell {
  if (!role.permissions.includes(permission as Role["permissions"][number])) {
    return { role: role.id, acces: "non" };
  }
  const own = role.restrictions?.[permission];
  const added = restrictions
    .filter((entry) => entry.role === role.id && entry.permission === permission)
    .map((entry) => entry.restriction);
  const declared = [...(own === undefined ? [] : [own]), ...added];
  if (declared.length === 0) return { role: role.id, acces: "oui" };
  const texts = [...new Set(declared)].join(" · ");
  const restriction = oneLineOf(texts, SECURITY_LIMITS.text);
  /** Une restriction déclarée mais blanche restreint quand même. */
  return { role: role.id, acces: "restreint", ...(restriction && { restriction }) };
}

export const rightsMatrix = (
  roles: RolesFile,
  restrictions: readonly RightRestriction[] = [],
): MatrixRow[] =>
  roles.permissions.map((permission) => ({
    action: permission.id,
    libelle: permissionLabel(permission),
    cases: roles.roles.map((role) => cellOf(role, permission.id, restrictions)),
  }));

/** Contenu de `security/rights.yaml` : matrice régénérée, restrictions et règles de propriété conservées. */
export function rightsFileOf(roles: RolesFile, previous?: RightsFile): RightsFile {
  const restrictions = previous?.restrictions ?? [];
  return {
    matrice: rightsMatrix(roles, restrictions),
    restrictions,
    propriete: previous?.propriete ?? [],
  };
}

export interface AbuseCase {
  readonly role: string;
  readonly action: string;
  readonly libelle: string;
  readonly acces: "non" | "restreint";
  readonly restriction?: string | undefined;
}

/** Cases « non » et restreintes, rôle par rôle : un scénario d'abus chacune. */
export function abuseCases(matrix: readonly MatrixRow[]): AbuseCase[] {
  const cases = matrix.flatMap(({ action, libelle, cases }) =>
    cases.flatMap(({ role, acces, restriction }) =>
      acces === "oui" ? [] : [{ role, action, libelle, acces, restriction }],
    ),
  );
  const roles = matrix[0]?.cases.map((cell) => cell.role) ?? [];
  return roles.flatMap((role) => cases.filter((entry) => entry.role === role));
}
