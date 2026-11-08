import type { Role } from "@koklo/contract";
import { SecondaryNav, type SecondaryNavGroup } from "@koklo/ui";
import {
  canOpenSection,
  SETTINGS_GROUPS,
  SETTINGS_ICONS,
  SETTINGS_LABELS,
} from "../lib/settings-sections.ts";
import { type SettingsSection, settingsPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

function groupsFor(
  section: SettingsSection,
  role: Role | undefined,
  memberCount: number | undefined,
): SecondaryNavGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    label: group.label,
    items: group.sections
      .filter((candidate) => canOpenSection(candidate, role))
      .map((candidate) => ({
        href: settingsPath(candidate),
        icon: SETTINGS_ICONS[candidate],
        label: SETTINGS_LABELS[candidate],
        current: candidate === section,
        ...(candidate === "members" && memberCount !== undefined ? { count: memberCount } : {}),
      })),
  })).filter((group) => group.items.length > 0);
}

/**
 * Navigation secondaire de Réglages (S-settings §2) : `SecondaryNav` de l'interface, 240 px dès 768 px, liens
 * horizontaux défilants en dessous. Un lien par section permise au rôle ; la courante porte `aria-current="page"`.
 */
export function SettingsNav({
  section,
  role,
  memberCount,
}: {
  section: SettingsSection;
  role: Role | undefined;
  memberCount: number | undefined;
}) {
  return (
    <SecondaryNav
      label="Sections des réglages"
      groups={groupsFor(section, role, memberCount)}
      LinkComponent={ShellLink}
    />
  );
}
