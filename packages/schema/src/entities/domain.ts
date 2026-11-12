import { z } from "zod";
import { endpointId, featureId, permissionId, roleId, ruleId, tableId } from "./ids.ts";

export const PERMISSION_ACTIONS = ["lire", "creer", "modifier", "supprimer", "executer"] as const;

/** Nom métier d'une ressource ou d'une action (`agenda`, `modifier`) : même alphabet que le jeton d'un `PM-`. */
const businessName = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/);

export const RoleSchema = z.strictObject({
  id: roleId,
  nom: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(permissionId).default([]),
  /** Restriction du rôle pour une permission qu'il porte (`PM-… -> « les siennes »`), TK-103 (B338 c). */
  restrictions: z.record(permissionId, z.string().min(1)).optional(),
});

export const PermissionSchema = z.strictObject({
  id: permissionId,
  libelle: z.string().min(1).optional(),
  /** Une action du vocabulaire fermé ou un nom métier (`PM-agenda.lire`, TK-103). */
  action: z.union([z.enum(PERMISSION_ACTIONS), businessName]),
  /** Une table `T-`, un endpoint `E-` ou un nom métier : la règle 4 ne vérifie que les deux premiers. */
  ressource: z.union([tableId, endpointId, businessName]),
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
  /** Titre court (TK-103) : facultatif au schéma (fichiers existants), exigé à la création par le contrat. */
  titre: z.string().min(1).optional(),
  type: z.enum(["contrainte", "calcul", "workflow"]),
  tables: z.array(tableId).default([]),
  endpoints: z.array(endpointId).default([]),
  /** Noms des états d'un workflow ; le premier est l'état initial (TK-103, B338 b). */
  etats: z.array(z.string().min(1)).optional(),
  /** Fonctionnalités qui appliquent la règle. */
  fonctionnalites: z.array(featureId).optional(),
  enonce: z.string().min(1),
  exemples: z.array(z.string()).default([]),
});

export type Role = z.output<typeof RoleSchema>;
export type Permission = z.output<typeof PermissionSchema>;
export type PermissionAction = Permission["action"];
export type RolesFile = z.output<typeof RolesFileSchema>;
export type BusinessRule = z.output<typeof BusinessRuleSchema>;
