/**
 * SQUELETTE (TK-53b, étape Red) : types seuls. Le Green ajoute RoleSchema, PermissionSchema,
 * RolesFileSchema et BusinessRuleSchema (voir .workflow/TK-53/03-decisions-53b.md).
 */
export type PermissionAction = "lire" | "creer" | "modifier" | "supprimer" | "executer";

export type Role = { id: string; nom: string; description?: string; permissions: string[] };

export type Permission = {
  id: string;
  action: PermissionAction;
  ressource: string;
  conditions: string[];
  endpoints: string[];
};

/** Forme de `domain/roles.yaml`. */
export type RolesFile = { roles: Role[]; permissions: Permission[] };

/** Règle métier `domain/rules/R-nnn-slug.md`. */
export type BusinessRule = {
  id: string;
  type: "contrainte" | "calcul" | "workflow";
  tables: string[];
  endpoints: string[];
  enonce: string;
  exemples: string[];
};
