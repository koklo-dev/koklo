import type { MemberRole, Role } from "@koklo/contract";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  dev: "Développeur",
  designer: "Designer",
  client: "Client",
  business: "Business",
};

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

/** `member.list` expose noms, e-mails et rôles de toute l'organisation : fermé au client (403). */
export function canListMembers(role: Role | undefined): boolean {
  return role !== "client";
}
