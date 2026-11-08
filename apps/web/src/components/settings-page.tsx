"use client";

import { PageHeader, RolePill } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { InstallationCallbackOutcome } from "../lib/github-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { pillRole } from "../lib/roles.ts";
import { canOpenSection, defaultSection, SETTINGS_TITLES } from "../lib/settings-sections.ts";
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

/** Premier segment du fil : l'organisation ; pour le client (sans `org.get`), son propre nom. */
function useCrumbOrigin(organization: string | undefined, isClient: boolean) {
  const me = useQuery({ ...orpc.me.get.queryOptions(), enabled: isClient });
  return isClient ? me.data?.name : organization;
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
  const { role, organizations, session, active } = useActiveOrganization();
  const roleKnown = !organizations.isPending && !session.isPending;
  const allowed = canOpenSection(section, role);
  const summary = useSummary(roleKnown && role !== undefined && role !== "client");
  const content = useFocusSectionHeading(section);
  const redirectTo = roleKnown && !allowed ? settingsPath(defaultSection(role)) : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  const origin = useCrumbOrigin(active?.name, role === "client");
  const summaryText = role === "client" ? CLIENT_SUMMARY : summary.text;

  return (
    <>
      <PageHeader
        title="Réglages"
        breadcrumb={
          origin
            ? [{ label: origin }, { label: "Réglages" }, { label: SETTINGS_TITLES[section] }]
            : undefined
        }
        status={
          role ? (
            <RolePill
              role={pillRole(role)}
              tone={role === "client" ? "warning" : "soft"}
              icon={role === "client" ? "person" : "badge"}
              data-testid="settings-role"
            />
          ) : undefined
        }
        {...(summaryText ? { summary: summaryText } : {})}
      />
      <div className="flex flex-col md:flex-row">
        <SettingsNav section={section} role={role} memberCount={summary.memberCount} />
        <div ref={content} className="min-w-0 flex-1">
          <PageBody>
            {roleKnown && allowed ? (
              <SectionBody section={section} githubResult={githubResult} />
            ) : (
              <LoadingStatus label="Chargement des réglages…" />
            )}
          </PageBody>
        </div>
      </div>
    </>
  );
}
