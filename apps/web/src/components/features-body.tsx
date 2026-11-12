"use client";

import type { Role } from "@koklo/contract";
import type { ReactNode } from "react";
import type { FeaturesView } from "../lib/features-view.ts";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { canManage } from "../lib/roles.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { ProjectNotFound } from "./features-empty.tsx";
import { SpecIndexFailed } from "./spec-index-failed.tsx";
import { SpecPreparing } from "./spec-preparing.tsx";
import { SpecRepoMissing } from "./spec-repo-missing.tsx";

export interface SpecBodyProps {
  view: FeaturesView;
  projectId: string;
  role: Role | undefined;
  team: boolean;
  expired: boolean;
  /** « Réessayer » de l'erreur de chargement. */
  retryLoad: () => void;
  refresh: () => void;
  refetchRepos: () => void;
  repoCreated: { created: boolean; onFinish: Parameters<typeof SpecRepoMissing>[0]["onFinish"] };
  /** Titre de l'erreur de chargement (« Impossible de charger les règles métier »). */
  errorTitle: string;
  skeleton: ReactNode;
  /** Spec lue mais vide : état propre à l'onglet. */
  empty: ReactNode;
  /** Recherche ou filtre sans résultat. */
  emptyFiltered: ReactNode;
  /** Liste affichée (`view.kind === "list"`). */
  list: ReactNode;
}

function Preparing(props: SpecBodyProps) {
  const { view, expired, refresh, refetchRepos, repoCreated } = props;
  const retryRepos = view.kind === "neutral" && view.retryRepos;
  return (
    <SpecPreparing
      neutral={view.kind === "neutral"}
      expired={expired}
      retryRepos={retryRepos}
      onRefresh={retryRepos ? refetchRepos : refresh}
      focusTitle={repoCreated.created}
    />
  );
}

/** Corps d'un onglet du cahier : un seul état principal à la fois (design/screens/S-features.md §4). */
export function SpecBody(props: SpecBodyProps) {
  const { view, role, retryLoad, refresh, projectId, repoCreated } = props;
  switch (view.kind) {
    case "loading":
      return props.skeleton;
    case "not-found":
      return <ProjectNotFound />;
    case "error":
      return (
        <ErrorNotice title={props.errorTitle} onRetry={retryLoad}>
          {GENERIC_ERROR}
        </ErrorNotice>
      );
    case "index-failed":
      return (
        <SpecIndexFailed
          errorCode={view.errorCode}
          commitSha={view.commitSha}
          team={props.team}
          onRefresh={refresh}
        />
      );
    case "no-repo":
      return (
        <SpecRepoMissing
          projectId={projectId}
          canCreate={canManage(role)}
          onFinish={repoCreated.onFinish}
          created={repoCreated.created}
        />
      );
    case "neutral":
    case "preparing":
      return <Preparing {...props} />;
    case "empty":
      return props.empty;
    case "empty-filtered":
      return props.emptyFiltered;
    case "list":
      return props.list;
  }
}
