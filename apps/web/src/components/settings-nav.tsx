import type { Role } from "@koklo/contract";
import { Badge, cn } from "@koklo/ui";
import { canOpenSection, SETTINGS_GROUPS, SETTINGS_LABELS } from "../lib/settings-sections.ts";
import { type SettingsSection, settingsPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

const LINK =
  "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground md:min-h-9";

/**
 * Navigation secondaire de Réglages (S-settings §2) : 240 px à gauche dès 768 px, liens horizontaux défilants au-dessus
 * du contenu en dessous. Un lien par section permise au rôle ; la section courante porte `aria-current="page"`.
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
    <nav
      aria-label="Sections des réglages"
      className="flex shrink-0 gap-4 overflow-x-auto border-b px-4 py-2 md:w-60 md:flex-col md:gap-5 md:overflow-visible md:border-b-0 md:border-r md:px-4 md:py-6"
    >
      {SETTINGS_GROUPS.map((group) => {
        const sections = group.sections.filter((candidate) => canOpenSection(candidate, role));
        if (sections.length === 0) return null;
        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="hidden px-3 text-meta text-muted-foreground md:block">{group.label}</p>
            <ul className="flex gap-1 md:flex-col md:gap-px">
              {sections.map((candidate) => (
                <li key={candidate}>
                  <ShellLink
                    href={settingsPath(candidate)}
                    className={cn(LINK)}
                    {...(candidate === section ? { "aria-current": "page" as const } : {})}
                  >
                    {SETTINGS_LABELS[candidate]}
                    {candidate === "members" && memberCount !== undefined ? (
                      <Badge>{memberCount}</Badge>
                    ) : null}
                  </ShellLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
