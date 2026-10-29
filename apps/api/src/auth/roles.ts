import { createAccessControl } from "better-auth/plugins/access";

/**
 * Rôles du CDC §14. « Gérer org, membres, fournisseurs, clés BYOK » : propriétaire et admin
 * seulement ; les quatre autres rôles n'ont aucun droit de gestion. Les routes de l'api ne
 * s'appuient pas sur cette table pour décider (garde de rôle relisant `members`), elle sert aux
 * contrôles internes du plugin (invitation) et nomme les rôles valides.
 */
const statement = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
} as const;

const ac = createAccessControl(statement);

export const organizationRoles = {
  owner: ac.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
  }),
  admin: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
  }),
  dev: ac.newRole({}),
  designer: ac.newRole({}),
  client: ac.newRole({}),
  business: ac.newRole({}),
};

export { ac as organizationAccessControl };

/**
 * Rôles qui gèrent l'organisation (CDC §14, « Gérer org, membres… ») : seule source pour les
 * gardes de route (`@Roles(...MANAGER_ROLES)`). Les droits du plugin ci-dessus en sont l'écho
 * pour owner et admin ; `roles-consistency.test.ts` vérifie leur cohérence.
 */
export const MANAGER_ROLES = ["owner", "admin"] as const;
