"use client";

import { Alert, AlertDescription, Icon } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { errorCode } from "../lib/api-error.ts";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { useAiCredentialSession } from "../lib/use-ai-credential-session.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { AiCredentialCard } from "./ai-credential-card.tsx";
import { ErrorNotice } from "./error-notice.tsx";
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

/** Liste des clés (une seule carte, Anthropic) et écritures. */
function Content() {
  const list = useQuery(orpc.llmCredential.list.queryOptions({ enabled: true }));
  const session = useAiCredentialSession();
  const redirecting = useUnauthorizedRedirect(list.error);

  if (session.state.forbidden || errorCode(list.error) === "FORBIDDEN") return <Restricted />;
  if (list.data) {
    const item = list.data.items.find((entry) => entry.provider === "anthropic");
    return <AiCredentialCard item={item} session={session} />;
  }
  if (list.isError && !list.isFetching) {
    if (redirecting) return null;
    return (
      <ErrorNotice title={L.loadFailedTitle} onRetry={() => void list.refetch()}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  return <LoadingStatus label={L.loadingList} rows={1} rowClassName="h-48" />;
}

/** Propriétaires et administrateurs : introduction, puis liste des clés et écritures. */
function Manager() {
  return (
    <>
      <p className="max-w-xl text-sm text-muted-foreground">{L.intro}</p>
      <Content />
    </>
  );
}

/**
 * Réglages de l'IA (S-ai-settings) : la clé du fournisseur de l'organisation, réservée aux propriétaires et
 * administrateurs. Tant que le rôle est inconnu (fail-closed) : chargement, aucun appel `llmCredential.*`.
 */
export function AiSettingsPage() {
  const { role, session } = useActiveOrganization();
  // Session perdue ou sans organisation active (page atteinte hors garde) : même redirection que sur une 401.
  useUnauthorizedRedirect(session.data === null ? UNAUTHORIZED : undefined);
  let body = <LoadingStatus label={L.loadingRole} rows={1} />;
  if (role) body = canManage(role) ? <Manager /> : <Restricted />;
  return (
    <div data-testid="ai-settings-page" className="flex min-w-0 max-w-2xl flex-col gap-6">
      <h1 className="text-page-title">{L.title}</h1>
      {body}
    </div>
  );
}
