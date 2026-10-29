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
