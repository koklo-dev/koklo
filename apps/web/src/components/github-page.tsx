"use client";

import { Alert, AlertDescription, Icon } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readCreationResume } from "../lib/creation-resume.ts";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import {
  type InstallationCallbackOutcome,
  REDIRECTING_LABEL,
  RESTRICTED_TEXT,
  RESULT_NOTICES,
} from "../lib/github-labels.ts";
import type { StartFailure } from "../lib/github-start-error.ts";
import { orpc } from "../lib/orpc.ts";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { NEW_INSTALLATION, useStartInstallation } from "../lib/use-start-installation.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { GithubEmpty } from "./github-empty.tsx";
import { InstallButton } from "./github-install-button.tsx";
import { GithubInstallations } from "./github-installations.tsx";
import { GithubResultNotice } from "./github-result-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";

const isKnownOutcome = (value: unknown): value is InstallationCallbackOutcome =>
  typeof value === "string" && Object.hasOwn(RESULT_NOTICES, value);

function Title() {
  return <h1 className="text-[30px] font-semibold tracking-[-0.025em]">GitHub</h1>;
}

/** Liste, vide, chargement ou erreur selon la requête des installations. */
function InstallationsSection({
  query,
  redirecting,
  active,
  onAuthorize,
}: {
  query: ReturnType<typeof useInstallationList>;
  redirecting: boolean;
  active: string | undefined;
  onAuthorize: (installationId: string) => void;
}) {
  if (query.data?.length) {
    return (
      <GithubInstallations
        installations={query.data}
        redirectingId={active === NEW_INSTALLATION ? undefined : active}
        locked={active !== undefined}
        onAuthorize={onAuthorize}
      />
    );
  }
  if (query.data) return <GithubEmpty />;
  if (query.isError && !query.isFetching) {
    if (redirecting) return null;
    return (
      <ErrorNotice
        title="Impossible de charger les installations"
        onRetry={() => void query.refetch()}
      >
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  return (
    <LoadingStatus label="Chargement des installations GitHub…" rows={2} rowClassName="h-20" />
  );
}

const useInstallationList = () => useQuery(orpc.installation.list.queryOptions({ enabled: true }));

/** Page d'un propriétaire ou d'un administrateur : retour de GitHub, installation, autorisations. */
function GithubManager({ result }: { result: InstallationCallbackOutcome | undefined }) {
  const router = useRouter();
  const installations = useInstallationList();
  const redirecting = useUnauthorizedRedirect(installations.error);
  const [outcome, setOutcome] = useState(() => (isKnownOutcome(result) ? result : undefined));
  const [failure, setFailure] = useState<StartFailure>();
  const [resumeName, setResumeName] = useState<string>();

  // Après l'installation, un marqueur de création de projet valide propose de reprendre (S-projects §5.1).
  useEffect(() => {
    setResumeName(outcome === "installed" ? readCreationResume()?.projectName : undefined);
  }, [outcome]);

  // Le message du retour de GitHub est gardé dans l'état, puis le paramètre quitte l'URL (pas de rejeu).
  useEffect(() => {
    if (!isKnownOutcome(result)) return;
    setOutcome(result);
    router.replace("/github", { scroll: false });
  }, [result, router]);

  const { active, run } = useStartInstallation((next) => {
    setFailure(next);
    if (next.reloadList) void installations.refetch();
  });
  const act = (installationId?: string) => {
    setOutcome(undefined);
    setFailure(undefined);
    run(installationId);
  };

  const installButton = (
    <InstallButton
      onInstall={() => act()}
      locked={active !== undefined}
      redirecting={active === NEW_INSTALLATION}
    />
  );
  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Koklo utilise l'application GitHub pour créer le dépôt de spécification de vos projets et
          y enregistrer vos fonctionnalités. Vous choisissez les comptes et les dépôts auxquels elle
          a accès.
        </p>
        {installButton}
      </div>
      {active === undefined ? null : (
        <p role="status" className="text-[13px] text-muted-foreground">
          {REDIRECTING_LABEL}
        </p>
      )}
      {outcome ? <GithubResultNotice outcome={outcome} resumeProjectName={resumeName} /> : null}
      {failure ? (
        <ErrorNotice {...(failure.title ? { title: failure.title } : {})}>
          {failure.text}
        </ErrorNotice>
      ) : null}
      <InstallationsSection
        query={installations}
        redirecting={redirecting}
        active={active}
        onAuthorize={act}
      />
    </>
  );
}

/** Installation de l'application GitHub et autorisation de la personne (propriétaires et administrateurs). */
export function GithubPage({ result }: { result?: InstallationCallbackOutcome | undefined }) {
  const { organizations, session, role } = useActiveOrganization();
  // Sans organisation active (page atteinte hors garde), l'API arbitre : UNAUTHORIZED renvoie vers /organizations.
  const settled = !organizations.isPending && !session.isPending;
  let body = <LoadingStatus label="Chargement…" rows={1} />;
  if (role && !canManage(role)) {
    body = (
      <Alert>
        <Icon name="lock" size={20} />
        <AlertDescription>{RESTRICTED_TEXT}</AlertDescription>
      </Alert>
    );
  } else if (settled) body = <GithubManager result={result} />;
  return (
    <div data-testid="github-page" className="flex max-w-4xl flex-col gap-6">
      <Title />
      {body}
    </div>
  );
}
