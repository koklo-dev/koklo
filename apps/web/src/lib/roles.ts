import type { MemberRole, Role } from "@koklo/contract";
import type { Role as PillRole } from "@koklo/ui";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  dev: "Développeur",
  designer: "Designer",
  client: "Client",
  business: "Business",
};

/** Rôle du contrat vers celui de `RolePill` (`dev` s'y écrit `developer`). */
export const pillRole = (role: Role): PillRole => (role === "dev" ? "developer" : role);

/** Seuls les propriétaires et les administrateurs créent des projets et invitent (CDC §14). */
export function canManage(role: Role | undefined): boolean {
  return role === "owner" || role === "admin";
}

const INVITABLE: MemberRole[] = ["admin", "dev", "designer", "client", "business"];

/** Rôles proposables à l'invitation : `owner` jamais, `admin` seulement pour un propriétaire. */
export function invitableRoles(role: Role | undefined): MemberRole[] {
  return role === "owner" ? INVITABLE : INVITABLE.filter((candidate) => candidate !== "admin");
}

/** L'équipe (propriétaire, administrateur, développeur, designer) déplace les tickets ; le reste est en lecture seule. */
export function canMoveTickets(role: Role | undefined): boolean {
  return role === "owner" || role === "admin" || role === "dev" || role === "designer";
}

/** `repo.list` est réservé à l'équipe : client et business ne l'appellent jamais. */
export function canReadRepos(role: Role | undefined): boolean {
  return canMoveTickets(role);
}

/** `specBatch.submit` : propriétaire, administrateur, développeur et designer écrivent dans la spec (`SPEC_BATCH_ROLES`). */
export function canWriteSpec(role: Role | string | undefined): boolean {
  return role === "owner" || role === "admin" || role === "dev" || role === "designer";
}

/**
 * `member.list` expose noms, e-mails et rôles de toute l'organisation : réservé à l'équipe et au
 * business (liste fermée, comme `STAFF_ROLES` côté api). Rôle inconnu ou absent : non autorisé.
 */
export function canListMembers(role: Role | string | undefined): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "dev" ||
    role === "designer" ||
    role === "business"
  );
}

/**
 * Un gestionnaire agit sur un membre, sauf sur un propriétaire que seul un propriétaire touche (H3).
 * Le serveur reste l'autorité : ceci évite seulement de proposer une action qu'il refuserait.
 */
export function canTouchMember(actor: Role | undefined, target: Role): boolean {
  return canManage(actor) && (target !== "owner" || actor === "owner");
}

/** Rôles proposés dans le menu d'un membre : ceux que l'on peut inviter, sauf son rôle actuel. */
export function assignableRoles(actor: Role | undefined, target: Role): MemberRole[] {
  return invitableRoles(actor).filter((candidate) => candidate !== target);
}

/** Rédiger l'espace Idée : l'équipe et le client lié ; le business lit seulement (`IDEA_WRITE_ROLES`). Le serveur reste l'autorité. */
export function canWriteIdea(role: Role | string | undefined): boolean {
  return canWriteSpec(role) || role === "client";
}

/** Publier l'espace Idée dans le dépôt : l'équipe seulement (`SPEC_BATCH_ROLES`), jamais le client. */
export const canPublishIdea = canWriteSpec;
