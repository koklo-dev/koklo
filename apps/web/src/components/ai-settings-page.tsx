"use client";

import { Alert, AlertDescription, Icon } from "@koklo/ui";
import { type ReactNode, useState } from "react";
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

function Announcement({ message }: { message: string }) {
  return (
    <p role="status" className="flex min-h-5 items-center gap-1.5 text-sm">
      {message ? <Icon name="check_circle" size={16} /> : null}
      {message}
    </p>
  );
}

/** Liste, modèle par usage, secours, à quoi servent les clés, consommation : dans cet ordre (S-ai-settings §3). */
function Content() {
  const list = useProviderList();
  const models = useQualifiedModels();
  const [message, setMessage] = useState("");
  const redirecting = useUnauthorizedRedirect(list.error);
  if (errorCode(list.error) === "FORBIDDEN") return <Restricted />;
  if (redirecting) return null;
  return (
    <>
      <Announcement message={message} />
      <AiQueryBoundary query={list} loading={L.loadingList} failed={L.loadFailedTitle}>
        {(data) => {
          const withModels = new Set((models.data?.items ?? []).map((model) => model.provider));
          return (
            <>
              <AiProvidersSection
                items={data.items}
                withModels={withModels}
                announce={setMessage}
              />
              {data.items.length > 0 ? (
                <AiUsageModels items={data.items} announce={setMessage} />
              ) : null}
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
                <AiPurposes />
                {data.items.length > 0 ? <AiConsumption announce={setMessage} /> : null}
              </div>
            </>
          );
        }}
      </AiQueryBoundary>
    </>
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
        <p className="max-w-xl text-sm text-muted-foreground">{L.intro}</p>
        <AiSendPolicy />
        <Content />
      </>
    ) : (
      <Restricted />
    );
  }
  return (
    <div data-testid="ai-settings-page" className="flex min-w-0 max-w-5xl flex-col gap-4">
      <h2 className="text-section-title">{L.title}</h2>
      {body}
    </div>
  );
}
