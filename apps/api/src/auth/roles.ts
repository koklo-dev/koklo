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
 * Lancer, relire et décider les propositions de l'agent (`ai.proposeDeliverable|proposeOptions|reviseProposal`,
 * `proposal.*`, TK-99a) : ceux de `specBatch`, qui seuls peuvent les appliquer. Client et business : 403 partout
 * (jamais de proposition en attente côté client).
 */
export const PROPOSAL_ROLES = SPEC_BATCH_ROLES;

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

/**
 * Lire la liste des membres (`member.list`) : nom, e-mail et rôle de toute l'organisation. Fermé au
 * client, lié ou non (TK-55, revue d'attaque B1) ; un rôle absent ou inconnu est refusé (403).
 */
export const MEMBER_LIST_ROLES = STAFF_ROLES;

/**
 * Lire l'espace client (`clientSpace.*`, TK-55b) : les six rôles. Le client n'y voit que ses projets
 * liés (cloisonnement central), les autres rôles toute l'organisation.
 */
export const CLIENT_SPACE_READ_ROLES = [...STAFF_ROLES, CLIENT_ROLE] as const;

/**
 * Proposer une suggestion et retirer la sienne (`suggestion.create|withdraw`, CDC §14 « Proposer »,
 * TK-55c, D3) : les rôles de §14 ; le business lit seulement. Le client ne propose qu'en cadrage.
 */
export const SUGGESTION_CREATE_ROLES = ["owner", "admin", "dev", "designer", "client"] as const;

/** Lire les suggestions d'un projet (`suggestion.list`) : les six rôles, le client sur ses projets liés. */
export const SUGGESTION_READ_ROLES = [...STAFF_ROLES, CLIENT_ROLE] as const;

/** Accepter ou rejeter (`suggestion.accept|reject`, « Éditer features », TK-55c, D4) : designer exclu. */
export const SUGGESTION_DECIDE_ROLES = ["owner", "admin", "dev"] as const;

/**
 * Valider une cible (`review.submit`, CDC §14, TK-55d, TK-100 B325 d) : le client, et l'équipe qui valide à sa place ou
 * un livrable technique (owner, admin, développeur). Le garde ne fait que fermer le designer, le business et tout rôle
 * inconnu (403) ; la politique fine par cible (D1, rôles par livrable) est `review-policy.ts`. Jamais un jeton d'agent.
 */
export const REVIEW_SUBMIT_ROLES = [CLIENT_ROLE, "owner", "admin", "dev"] as const;

/**
 * Forcer l'ouverture d'un livrable de la spec (`spec.forceDeliverable`, TK-100, B325 f) : owner et admin seulement. Le
 * forçage ouvre sans rien valider ; jamais un client, un développeur, un designer, un business ni un jeton d'agent.
 */
export const DELIVERABLE_FORCE_ROLES = ["owner", "admin"] as const;

/**
 * Relire le journal des validations (`review.list`) : l'équipe avec le SHA, le client pour les seules cibles qu'il valide
 * (B325 e, filtre serveur dans `review-policy.ts`).
 */
export const REVIEW_READ_ROLES = [...STAFF_ROLES, CLIENT_ROLE] as const;

/** Notifiés d'une validation (`review.submitted`, `baseline.validated`) : l'équipe qui agit, pas le business. */
export const REVIEW_NOTIFIED_ROLES = ["owner", "admin", "dev", "designer"] as const;

/**
 * Lire l'organisation (`org.get`, TK-97) : nom, slug et compteurs de Général. Fermé au client (lié ou non),
 * comme la liste des membres ; un rôle absent ou inconnu est refusé (403).
 */
export const ORG_READ_ROLES = STAFF_ROLES;

/**
 * Rôles dont l'invitation porte des projets (B98) : obligatoires pour eux, refusés aux autres. À l'acceptation,
 * un lien `project_client_access` est créé par projet. Le cloisonnement serveur ne change que pour le client.
 */
export const PROJECT_INVITATION_ROLES = [CLIENT_ROLE, "business"] as const;

/** Lire le dossier d'idée (`idea.list|get`, TK-89, décision 2) : les six rôles, le client sur ses projets liés. */
export const IDEA_READ_ROLES = [...STAFF_ROLES, CLIENT_ROLE] as const;

/**
 * Rédiger le dossier d'idée (sauvegarde, statut, pages, présence, TK-89, décision 1) : le client rédige, le
 * business lit seulement (aligné sur `COMMENT_WRITE_ROLES`, CDC §14). La publication relève de `SPEC_BATCH_ROLES`.
 */
export const IDEA_WRITE_ROLES = ["owner", "admin", "dev", "designer", "client"] as const;

/**
 * Créer une organisation (`organization.create`, TK-55) : le rôle est PAR organisation. Autorisé à
 * qui n'a aucune appartenance (premier compte) ou au moins une appartenance d'équipe ; refusé à qui
 * n'est que `client`, ou n'a que des rôles hors de la liste fermée `STAFF_ROLES` (fail-closed).
 */
export function mayCreateOrganization(roles: readonly string[]): boolean {
  return roles.length === 0 || roles.some((role) => STAFF_ROLES.some((staff) => staff === role));
}
