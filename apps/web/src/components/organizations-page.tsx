"use client";

import { Button, Card } from "@koklo/ui";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "../lib/auth-client.ts";
import { clearAllFeatureStorage } from "../lib/feature-draft.ts";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { useOrganizationEntry } from "../lib/use-organization-entry.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { OrganizationForm } from "./organization-form.tsx";
import { OrganizationList } from "./organization-list.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

function EntryLoading({ label }: { label: string }) {
  return <LoadingStatus label={label} rows={1} rowClassName="h-16" />;
}

function SignOut() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="h-11 md:h-9"
      onClick={async () => {
        clearAllFeatureStorage();
        await authClient.signOut();
        router.replace("/login");
      }}
    >
      Se déconnecter
    </Button>
  );
}

function Heading({ hasOrganizations, active }: { hasOrganizations: boolean; active: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[24px] font-semibold tracking-[-0.015em]">
        {hasOrganizations ? "Choisir une organisation" : "Créer votre organisation"}
      </h1>
      {hasOrganizations ? null : (
        <p className="text-[13px] text-muted-foreground">
          Une organisation regroupe vos projets et votre équipe. Vous en serez le propriétaire.
        </p>
      )}
      {active ? (
        <Button asChild variant="ghost" className="h-11 w-fit md:h-9">
          <a href="/projects">Retour aux projets</a>
        </Button>
      ) : null}
    </div>
  );
}

function Entry({ entry }: { entry: ReturnType<typeof useOrganizationEntry> }) {
  const { organizations, activeId, openingId, openFailed, open } = entry;
  const hasOrganizations = organizations.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <Heading hasOrganizations={hasOrganizations} active={Boolean(activeId)} />
      {openFailed ? (
        <ErrorNotice title="Impossible de continuer">{GENERIC_ERROR}</ErrorNotice>
      ) : null}
      {hasOrganizations ? (
        <OrganizationList
          organizations={organizations}
          activeId={activeId}
          openingId={openingId}
          onOpen={open}
        />
      ) : null}
      <OrganizationForm autoFocus={!hasOrganizations} />
    </div>
  );
}

function content(entry: ReturnType<typeof useOrganizationEntry>): ReactNode {
  const { list, ready, autoOpening } = entry;
  if (list.isError) {
    return (
      <ErrorNotice title="Impossible de continuer" onRetry={() => void list.refetch()}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  if (list.isSuccess && autoOpening)
    return <EntryLoading label={`Ouverture de ${autoOpening.name}…`} />;
  return ready ? (
    <Entry entry={entry} />
  ) : (
    <EntryLoading label="Chargement de vos organisations…" />
  );
}

/** Porte d'entrée sans organisation active : créer, choisir ou ouvrir automatiquement l'unique organisation. */
export function OrganizationsPage() {
  const entry = useOrganizationEntry();
  return (
    <main
      data-testid="organizations-page"
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-4 md:p-10"
    >
      <ThemeToggle className="absolute top-4 right-4" />
      <Card className="w-full max-w-md p-6">{content(entry)}</Card>
      <SignOut />
    </main>
  );
}
