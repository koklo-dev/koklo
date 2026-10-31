"use client";

import { useState } from "react";
import { writeCreationResume } from "./creation-resume.ts";
import type { CreationOutcome, PendingResume } from "./creation-types.ts";
import type { StartFailure } from "./github-start-error.ts";
import { useGithubAccounts } from "./use-github-accounts.ts";
import { useProjectCreation } from "./use-project-creation.ts";
import { useSpecRepoLink } from "./use-spec-repo-link.ts";
import { useStartInstallation } from "./use-start-installation.ts";

interface PanelOptions {
  open: boolean;
  resume: PendingResume | null;
  onFinish: (outcome: CreationOutcome) => void;
}

/** Tout ce que le panneau de création pilote : comptes, machine d'états, autorisation, repli « relier ». */
export function useCreationPanel({ open, resume, onFinish }: PanelOptions) {
  const accounts = useGithubAccounts(open);
  const creation = useProjectCreation({
    accounts: accounts.accounts,
    accountsStatus: accounts.status,
    resume,
    onFinish,
    onReloadAccounts: accounts.reload,
  });
  const [authFailure, setAuthFailure] = useState<StartFailure>();
  const start = useStartInstallation(setAuthFailure);
  const link = useSpecRepoLink({
    projectId: creation.project?.id,
    account: creation.selected,
    onLinked: () => creation.finish({ kind: "linked", name: creation.project?.name ?? "" }),
    onExisting: creation.markExisting,
  });
  const busy = creation.busy || start.active !== undefined || link.pending;

  function authorize(): void {
    if (!creation.selected) return;
    setAuthFailure(undefined);
    start.run(creation.selected.id, () => {
      const marker = creation.marker();
      if (marker) writeCreationResume(marker);
    });
  }

  return {
    creation,
    accounts,
    link,
    busy,
    authorizing: start.active !== undefined,
    authFailure,
    authorize,
    submit: (event?: React.FormEvent) => {
      setAuthFailure(undefined);
      creation.submit(event);
    },
    /** Fermeture demandée (Échap, clic hors panneau, « Fermer ») : sans effet pendant un appel en vol. */
    requestClose: () => {
      if (!busy) onFinish(creation.closeOutcome());
    },
  };
}

export type CreationPanel = ReturnType<typeof useCreationPanel>;
