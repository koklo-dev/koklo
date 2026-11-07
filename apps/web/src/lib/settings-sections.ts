import type { Role } from "@koklo/contract";
import { canListMembers, canManage } from "./roles.ts";
import { SETTINGS_SECTIONS, type SettingsSection } from "./shell-routes.ts";

export const SETTINGS_LABELS: Record<SettingsSection, string> = {
  general: "Général",
  members: "Membres",
  ai: "Fournisseurs d'IA",
  github: "GitHub",
  account: "Mon compte",
};

/** Groupes de la navigation secondaire : l'organisation, puis la personne. */
export const SETTINGS_GROUPS: ReadonlyArray<{
  label: string;
  sections: readonly SettingsSection[];
}> = [
  { label: "Organisation", sections: ["general", "members", "ai", "github"] },
  { label: "Vous", sections: ["account"] },
];

/**
 * Sections ouvertes à un rôle : Mon compte à tous, Membres à l'équipe et au business (lecture), le reste aux
 * gestionnaires. Rôle inconnu : Mon compte seul. Le serveur reste l'autorité (`@Roles` + service).
 */
export function canOpenSection(section: SettingsSection, role: Role | undefined): boolean {
  if (section === "account") return true;
  return section === "members" ? canListMembers(role) : canManage(role);
}

export const sectionsOf = (role: Role | undefined): SettingsSection[] =>
  SETTINGS_SECTIONS.filter((section) => canOpenSection(section, role));

/** Section d'arrivée : Membres pour qui la lit, Mon compte pour le client et le rôle inconnu. */
export const defaultSection = (role: Role | undefined): SettingsSection =>
  canListMembers(role) ? "members" : "account";

/** Membres s'affiche en lecture seule hors propriétaire et administrateur. */
export const isReadOnlySection = (section: SettingsSection, role: Role | undefined): boolean =>
  section === "members" && !canManage(role);
