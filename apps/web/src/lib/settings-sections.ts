import type { Role } from "@koklo/contract";
import { canListMembers, canManage } from "./roles.ts";
import type { SettingsSection } from "./shell-routes.ts";

export const SETTINGS_LABELS: Record<SettingsSection, string> = {
  members: "Membres",
  github: "GitHub",
  ai: "IA",
};

/** Sections dont l'onglet est proposé : Membres à l'équipe et au business, GitHub et IA aux gestionnaires. */
const ALLOWED: Record<SettingsSection, (role: Role | undefined) => boolean> = {
  members: canListMembers,
  github: canManage,
  ai: canManage,
};

export const canOpenSection = (section: SettingsSection, role: Role | undefined): boolean =>
  ALLOWED[section](role);
