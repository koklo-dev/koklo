import type { Role } from "@koklo/contract";
import type { IconName } from "@koklo/ui";
import { canListMembers, canManage } from "./roles.ts";
import { SETTINGS_SECTIONS, type SettingsSection } from "./shell-routes.ts";

export const SETTINGS_LABELS: Record<SettingsSection, string> = {
  general: "Général",
  members: "Membres",
  ai: "Fournisseurs d'IA",
  github: "GitHub",
  account: "Mon compte",
};

/** Titre (h2 et fil d'Ariane) de chaque section : celui de la planche 24, « Organisation » pour Général. */
export const SETTINGS_TITLES: Record<SettingsSection, string> = {
  ...SETTINGS_LABELS,
  general: "Organisation",
};

/** Icône de chaque section dans la navigation secondaire (planche 24). */
export const SETTINGS_ICONS: Record<SettingsSection, IconName> = {
  general: "apartment",
  members: "group",
  ai: "key",
  github: "link",
  account: "person",
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
