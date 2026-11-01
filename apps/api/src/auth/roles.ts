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

/**
 * Rôles qui écrivent tickets, dépendances et sprints (CDC §14, « Gérer tickets / sprints ») : le
 * client ne fait que commenter, le business lit. Seule source pour `@Roles(...TICKET_WRITE_ROLES)`.
 */
export const TICKET_WRITE_ROLES = ["owner", "admin", "dev", "designer"] as const;

/**
 * Le chemin du worktree d'un runner est interne à l'infrastructure : lisible des seuls rôles
 * d'écriture (deny by default, aussi sans rôle). Source unique pour `ticket.get` et `lease.get`.
 */
export const canSeeWorktree = (role: string | undefined): boolean =>
  TICKET_WRITE_ROLES.some((writer) => writer === role);

/** Rôles qui prennent un bail de livraison (CDC §14, « Lancer un runner de livraison »). */
export const LEASE_ACQUIRE_ROLES = ["owner", "admin", "dev"] as const;

/** Lecture de l'état de projet : son contenu porte politique de merge et réglages de livraison. */
export const PROJECT_STATE_READ_ROLES = ["owner", "admin", "dev"] as const;

/** Écriture de l'état de projet : la politique de merge relève du propriétaire et de l'admin (§14). */
export const PROJECT_STATE_WRITE_ROLES = ["owner", "admin"] as const;

/** Qui commente (CDC §14, « Commenter ») : le client commente, le business lit seulement. */
export const COMMENT_WRITE_ROLES = ["owner", "admin", "dev", "designer", "client"] as const;

/** Supprime le commentaire d'autrui (modération) ; tout autre rôle ne supprime que le sien. */
export const COMMENT_DELETE_ANY_ROLES = MANAGER_ROLES;

/** Lecture du journal d'audit : il expose acteurs et cibles de toute l'organisation. */
export const AUDIT_READ_ROLES = MANAGER_ROLES;

/**
 * Lecture des repos d'un projet (CDC §14, annexe A §4.0) : ils portent propriétaire, nom et
 * branche du code ; le client et le business n'y accèdent pas. Création et rattachement :
 * `MANAGER_ROLES`.
 */
export const REPO_READ_ROLES = ["owner", "admin", "dev", "designer"] as const;

/**
 * Soumettre et lire un lot d'écriture de la spec (CDC §14, annexe A §4.0). Le designer y a accès
 * mais n'écrit que les features liées à un écran : cette limite se vérifie par opération, dans le
 * worker, sur l'état réel de la branche. Client et business n'y accèdent jamais.
 */
export const SPEC_BATCH_ROLES = ["owner", "admin", "dev", "designer"] as const;

/**
 * Rôles qui voient toute l'organisation (CDC §14, TK-55a) : seul le `client` est cloisonné par
 * projet. Liste FERMÉE : un rôle absent ou inconnu n'en fait pas partie et est cloisonné comme un
 * client (fail-closed, `AuthSession.role` est optionnel).
 */
export const STAFF_ROLES = ["owner", "admin", "dev", "designer", "business"] as const;

/** Gérer les liens client <-> projet (`projectClient.*`) : comme « gérer membres » (CDC §14). */
export const PROJECT_CLIENT_ROLES = MANAGER_ROLES;

/**
 * Lire la spec brute (`spec.head|listFeatures|getFeature`) : fermé au client (TK-55a, D7), qui
 * passe par l'espace client (TK-55b). Le vocabulaire git (branche, SHA, chemins) n'est pas le sien.
 */
export const SPEC_READ_ROLES = STAFF_ROLES;

/** Le seul rôle cloisonné par projet ; son rôle est vérifié à la liaison et purgé à la sortie. */
export const CLIENT_ROLE = "client";
