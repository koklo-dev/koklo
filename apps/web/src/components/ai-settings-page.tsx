"use client";

import { Alert, AlertDescription, Icon, useToast } from "@koklo/ui";
import type { ReactNode } from "react";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { errorCode } from "../lib/api-error.ts";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { useProviderList, useQualifiedModels } from "../lib/use-ai-providers.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { AiConsumption } from "./ai-consumption.tsx";
import { AiProvidersSection } from "./ai-providers-section.tsx";
import { AiPurposes } from "./ai-purposes.tsx";
import { AiQueryBoundary } from "./ai-query-boundary.tsx";
import { AiSendPolicy } from "./ai-send-policy.tsx";
import { AiUsageModels } from "./ai-usage-models.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { SectionHeading } from "./section-heading.tsx";

const UNAUTHORIZED = { code: "UNAUTHORIZED" } as const;

/** Refus affiché sans appel d'API : rôle sans accès, ou 403 reçu (le rôle a changé entre-temps). */
function Restricted() {
  return (
    <Alert role="alert">
      <Icon name="lock" size={20} />
      <AlertDescription>{L.restricted}</AlertDescription>
    </Alert>
  );
}

/** Confirmations en `Toast` (B175) : poli pour un succès, assertif pour l'échec d'écriture. */
function useAnnounce(): (message: string) => void {
  const { toast } = useToast();
  return (message) =>
    toast({ title: message, tone: message === L.writeFailed ? "error" : "success" });
}

/** Liste, modèle par usage, secours, à quoi servent les clés, consommation : dans cet ordre (S-ai-settings §3). */
function Content() {
  const list = useProviderList();
  const models = useQualifiedModels();
  const announce = useAnnounce();
  const redirecting = useUnauthorizedRedirect(list.error);
  if (errorCode(list.error) === "FORBIDDEN") return <Restricted />;
  if (redirecting) return null;
  return (
    <AiQueryBoundary query={list} loading={L.loadingList} failed={L.loadFailedTitle}>
      {(data) => {
        const withModels = new Set((models.data?.items ?? []).map((model) => model.provider));
        return (
          <>
            <AiProvidersSection items={data.items} withModels={withModels} announce={announce} />
            {data.items.length > 0 ? (
              <AiUsageModels items={data.items} announce={announce} />
            ) : null}
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              <AiPurposes />
              {data.items.length > 0 ? <AiConsumption announce={announce} /> : null}
            </div>
          </>
        );
      }}
    </AiQueryBoundary>
  );
}

/**
 * Fournisseurs d'IA (S-ai-settings v2) : réservés aux propriétaires et administrateurs. Tant que le rôle est
 * inconnu (fail-closed) : chargement, aucun appel `ai*`.
 */
export function AiSettingsPage() {
  const { role, session } = useActiveOrganization();
  // Session perdue ou sans organisation active (page atteinte hors garde) : même redirection que sur une 401.
  useUnauthorizedRedirect(session.data === null ? UNAUTHORIZED : undefined);
  let body: ReactNode = <LoadingStatus label={L.loadingRole} rows={1} />;
  if (role) {
    body = canManage(role) ? (
      <>
        <AiSendPolicy />
        <Content />
      </>
    ) : (
      <Restricted />
    );
  }
  return (
    <div data-testid="ai-settings-page" className="flex min-w-0 max-w-[820px] flex-col gap-5">
      <SectionHeading title={L.title} description={role && canManage(role) ? L.intro : undefined} />
      {body}
    </div>
  );
}
