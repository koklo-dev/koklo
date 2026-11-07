"use client";

import { Alert, AlertDescription, Badge, Icon } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { InstallationCallbackOutcome } from "../lib/github-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { ROLE_LABELS } from "../lib/roles.ts";
import { canOpenSection, defaultSection, isReadOnlySection } from "../lib/settings-sections.ts";
import { type SettingsSection, settingsPath } from "../lib/shell-routes.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { AccountPage } from "./account-page.tsx";
import { AiSettingsPage } from "./ai-settings-page.tsx";
import { GeneralPage } from "./general-page.tsx";
import { GithubPage } from "./github-page.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { MembersPage } from "./members-page.tsx";
import { PageBody } from "./page-body.tsx";
import { SettingsNav } from "./settings-nav.tsx";

const READ_ONLY =
  "Lecture seule : seuls les propriétaires et les administrateurs modifient cette section.";
const CLIENT_SUMMARY = "Vous voyez seulement les réglages de votre compte.";

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

function SectionBody({
  section,
  githubResult,
}: {
  section: SettingsSection;
  githubResult: InstallationCallbackOutcome | undefined;
}) {
  switch (section) {
    case "general":
      return <GeneralPage />;
    case "members":
      return <MembersPage />;
    case "ai":
      return <AiSettingsPage />;
    case "github":
      return <GithubPage result={githubResult} />;
    case "account":
      return <AccountPage />;
  }
}

/** « <organisation> · N projets · N membres » ; le client n'appelle pas `org.get` (403). */
function useSummary(hasOrganizationAccess: boolean) {
  const org = useQuery({ ...orpc.org.get.queryOptions(), enabled: hasOrganizationAccess });
  const text = org.data
    ? `${org.data.name} · ${plural(org.data.projectCount, "projet", "projets")} · ${plural(org.data.memberCount, "membre", "membres")}`
    : undefined;
  return { text, memberCount: org.data?.memberCount };
}

/** Au changement de section, le focus passe au h2 de la nouvelle section (pas au premier rendu). */
function useFocusSectionHeading(section: SettingsSection) {
  const content = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenché par le seul changement de section
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const heading = content.current?.querySelector("h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [section]);
  return content;
}

/**
 * Réglages (DESIGN.md §5.4, S-settings) : h1 « Réglages », pastille du rôle, résumé, navigation par rôle, puis
 * l'écran de la section. Une section interdite au rôle redirige vers la section par défaut, sans rien charger.
 */
export function SettingsPage({
  section,
  githubResult,
}: {
  section: SettingsSection;
  githubResult?: InstallationCallbackOutcome;
}) {
  const router = useRouter();
  const { role, organizations, session } = useActiveOrganization();
  const roleKnown = !organizations.isPending && !session.isPending;
  const allowed = canOpenSection(section, role);
  const summary = useSummary(roleKnown && role !== undefined && role !== "client");
  const content = useFocusSectionHeading(section);
  const redirectTo = roleKnown && !allowed ? settingsPath(defaultSection(role)) : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  return (
    <>
      <div className="border-b bg-background px-4 pb-4 pt-5 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 tabIndex={-1} className="text-page-title focus-visible:outline-none">
            Réglages
          </h1>
          {role ? (
            <Badge variant="outline" data-testid="settings-role">
              {ROLE_LABELS[role]}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-meta text-muted-foreground">
          {role === "client" ? CLIENT_SUMMARY : summary.text}
        </p>
      </div>
      <div className="flex flex-col md:flex-row">
        <SettingsNav section={section} role={role} memberCount={summary.memberCount} />
        <div ref={content} className="min-w-0 flex-1">
          <PageBody>
            {roleKnown && allowed ? (
              <div className="flex flex-col gap-6">
                {isReadOnlySection(section, role) ? (
                  <Alert className="max-w-xl">
                    <Icon name="lock" size={20} />
                    <AlertDescription>{READ_ONLY}</AlertDescription>
                  </Alert>
                ) : null}
                <SectionBody section={section} githubResult={githubResult} />
              </div>
            ) : (
              <LoadingStatus label="Chargement des réglages…" />
            )}
          </PageBody>
        </div>
      </div>
    </>
  );
}
