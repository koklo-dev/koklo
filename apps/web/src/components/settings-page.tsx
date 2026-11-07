"use client";

import { HeaderTabs, type ProjectHeaderTab } from "@koklo/ui";
import type { InstallationCallbackOutcome } from "../lib/github-labels.ts";
import { canOpenSection, SETTINGS_LABELS } from "../lib/settings-sections.ts";
import { SETTINGS_SECTIONS, type SettingsSection, settingsPath } from "../lib/shell-routes.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { AiSettingsPage } from "./ai-settings-page.tsx";
import { GithubPage } from "./github-page.tsx";
import { MembersPage } from "./members-page.tsx";
import { PageBody } from "./page-body.tsx";
import { ShellLink } from "./shell-link.tsx";

function SectionBody({
  section,
  githubResult,
}: {
  section: SettingsSection;
  githubResult: InstallationCallbackOutcome | undefined;
}) {
  switch (section) {
    case "members":
      return <MembersPage />;
    case "github":
      return <GithubPage result={githubResult} />;
    case "ai":
      return <AiSettingsPage />;
  }
}

/**
 * Réglages (DESIGN.md §5.4) : h1 « Réglages », onglets en liens selon le rôle (celui de la page courante est toujours
 * là), puis l'écran de la section tel qu'il était.
 */
export function SettingsPage({
  section,
  githubResult,
}: {
  section: SettingsSection;
  githubResult?: InstallationCallbackOutcome;
}) {
  const { role } = useActiveOrganization();
  const tabs: ProjectHeaderTab[] = SETTINGS_SECTIONS.filter(
    (candidate) => candidate === section || canOpenSection(candidate, role),
  ).map((candidate) => ({
    label: SETTINGS_LABELS[candidate],
    href: settingsPath(candidate),
    active: candidate === section,
  }));
  return (
    <>
      <div className="border-b bg-background px-4 pb-4 pt-5 md:px-8">
        <h1 tabIndex={-1} className="text-page-title focus-visible:outline-none">
          Réglages
        </h1>
        <HeaderTabs tabs={tabs} label="Sections des réglages" LinkComponent={ShellLink} />
      </div>
      <PageBody>
        <SectionBody section={section} githubResult={githubResult} />
      </PageBody>
    </>
  );
}
