import { z } from "zod";
import { endpointId, permissionId, roleId, ruleId, tableId } from "./ids.ts";

export const PERMISSION_ACTIONS = ["lire", "creer", "modifier", "supprimer", "executer"] as const;

export const RoleSchema = z.strictObject({
  id: roleId,
  nom: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(permissionId).default([]),
});

export const PermissionSchema = z.strictObject({
  id: permissionId,
  action: z.enum(PERMISSION_ACTIONS),
  ressource: z.union([tableId, endpointId]),
  conditions: z.array(z.string()).default([]),
  endpoints: z.array(endpointId).default([]),
});

/** Forme de `domain/roles.yaml` : les deux listes sont facultatives (scaffold `roles: []`). */
export const RolesFileSchema = z.strictObject({
  roles: z.array(RoleSchema).default([]),
  permissions: z.array(PermissionSchema).default([]),
});

/** Front matter d'une règle `domain/rules/R-nnn-slug.md` plus énoncé et exemples du corps. */
export const BusinessRuleSchema = z.strictObject({
  id: ruleId,
  type: z.enum(["contrainte", "calcul", "workflow"]),
  tables: z.array(tableId).default([]),
  endpoints: z.array(endpointId).default([]),
  enonce: z.string().min(1),
  exemples: z.array(z.string()).default([]),
});

export type Role = z.output<typeof RoleSchema>;
export type Permission = z.output<typeof PermissionSchema>;
export type PermissionAction = Permission["action"];
export type RolesFile = z.output<typeof RolesFileSchema>;
export type BusinessRule = z.output<typeof BusinessRuleSchema>;
