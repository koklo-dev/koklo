"use client";

import {
  Alert,
  AlertDescription,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Icon,
} from "@koklo/ui";
import type { Ref } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { canManage } from "../lib/roles.ts";
import { type FeaturesPageModel, useFeaturesPage } from "../lib/use-features-page.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FeatureFormSheet } from "./feature-form-sheet.tsx";
import { FeatureSheet } from "./feature-sheet.tsx";
import { FeaturesEmpty, FeaturesEmptyFiltered, ProjectNotFound } from "./features-empty.tsx";
import { FeaturesFilters } from "./features-filters.tsx";
import { FeaturesList } from "./features-list.tsx";
import { WriteFailure, WriteNotice } from "./saved-notice.tsx";
import { SpecIndexFailed } from "./spec-index-failed.tsx";
import { SpecPreparing } from "./spec-preparing.tsx";
import { SpecRepoMissing } from "./spec-repo-missing.tsx";

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: 5 }, (_, row) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: squelettes statiques, sans identité
          key={row}
          className="h-10 rounded-md bg-muted motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

function Header({
  name,
  titleRef,
  onCreate,
}: {
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  /** Présent seulement pour l'équipe qui écrit, quand la spec est lue. */
  onCreate: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem>Koklo</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/projects">Projets</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {name ? (
              <>
                <BreadcrumbItem>{name}</BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : null}
            <BreadcrumbItem>
              <BreadcrumbPage>Fonctionnalités</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="text-[30px] font-semibold tracking-[-0.025em] outline-none"
        >
          Fonctionnalités
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{name ?? "Projet"}</p>
      </div>
      {onCreate ? (
        <Button
          type="button"
          data-new-feature
          className="h-11 w-full md:h-9 md:w-auto"
          onClick={onCreate}
        >
          <Icon name="add" size={20} />
          Nouvelle fonctionnalité
        </Button>
      ) : null}
    </div>
  );
}

/** Ligne de version : l'équipe lit le court identifiant, le client une simple date de mise à jour. */
function VersionLine({
  head,
  team,
}: {
  head: { commitSha: string; indexedAt: string };
  team: boolean;
}) {
  const date = new Date(head.indexedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (!team) return <p className="text-xs text-muted-foreground">Mise à jour le {date}</p>;
  const short = head.commitSha.slice(0, 7);
  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Icon name="commit" size={16} />
      Version de la spec
      <span role="img" aria-label={`Version de la spec ${short}`} className="font-mono">
        {short}
      </span>{" "}
      · indexée le {date}
    </p>
  );
}

function BuildingNotice() {
  return (
    <Alert>
      <Icon name="schedule" size={20} />
      <AlertDescription>
        La spec est en cours de mise à jour : la liste peut être incomplète.
      </AlertDescription>
    </Alert>
  );
}

function Preparing({ page }: { page: FeaturesPageModel }) {
  const { view, expired, repos, refresh } = page.data;
  const retryRepos = view.kind === "neutral" && view.retryRepos;
  return (
    <SpecPreparing
      neutral={view.kind === "neutral"}
      expired={expired}
      retryRepos={retryRepos}
      onRefresh={retryRepos ? () => void repos.refetch() : refresh}
      focusTitle={page.repoCreated.created}
    />
  );
}

function ListView({ page, building }: { page: FeaturesPageModel; building: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {building ? <BuildingNotice /> : null}
      <FeaturesList
        projectName={page.data.projectName}
        items={page.data.features.items}
        hrefFor={page.sheet.hrefFor}
        onOpen={page.url.openFeature}
        more={page.more}
      />
    </div>
  );
}

/** Corps de l'écran : un seul état principal à la fois (design/screens/S-features.md §4). */
function Body({ page }: { page: FeaturesPageModel }) {
  const { view, role, projectName, retryLoad, refresh } = page.data;
  switch (view.kind) {
    case "loading":
      return <Skeleton />;
    case "not-found":
      return <ProjectNotFound />;
    case "error":
      return (
        <ErrorNotice title="Impossible de charger les fonctionnalités" onRetry={retryLoad}>
          {GENERIC_ERROR}
        </ErrorNotice>
      );
    case "index-failed":
      return (
        <SpecIndexFailed
          errorCode={view.errorCode}
          commitSha={view.commitSha}
          team={page.team}
          onRefresh={refresh}
        />
      );
    case "no-repo":
      return (
        <SpecRepoMissing
          projectId={page.data.projectId}
          projectName={projectName}
          canCreate={canManage(role)}
          onFinish={page.repoCreated.onFinish}
          created={page.repoCreated.created}
        />
      );
    case "neutral":
    case "preparing":
      return <Preparing page={page} />;
    case "empty":
      return <FeaturesEmpty onCreate={page.form.canWrite ? page.form.openCreate : undefined} />;
    case "empty-filtered":
      return <FeaturesEmptyFiltered onClear={page.filters.onClear} />;
    case "list":
      return <ListView page={page} building={view.building} />;
  }
}

function Sheet({ page }: { page: FeaturesPageModel }) {
  const { url, data } = page;
  if (!page.sheetOpen || !url.feature) return null;
  return (
    <FeatureSheet
      key={url.feature}
      projectId={data.projectId}
      specId={url.feature}
      summary={data.features.items.find((item) => item.specId === url.feature)}
      role={data.role}
      onClose={url.closeFeature}
      onGone={page.sheet.refetchList}
      onReturnFocus={page.sheet.returnFocus}
      onEdit={
        page.form.canWrite ? () => page.form.openEdit(url.feature as string, true) : undefined
      }
    />
  );
}

function FormSheet({ page }: { page: FeaturesPageModel }) {
  const { form, data, write } = page;
  if (!form.open || !data.head) return null;
  return (
    <FeatureFormSheet
      projectId={data.projectId}
      mode={form.mode}
      specId={form.specId}
      role={data.role}
      head={data.head}
      write={write}
      announce={page.announce}
      onClose={form.close}
      keepFocus={page.keepFocus}
    />
  );
}

/** Écran « Fonctionnalités » d'un projet, en lecture seule (design/screens/S-features.md). */
export function FeaturesPage({ projectId }: { projectId: string }) {
  const page = useFeaturesPage(projectId);
  const { head, projectName } = page.data;
  return (
    <div className="flex flex-col gap-4">
      <Header
        name={projectName}
        titleRef={page.titleRef}
        onCreate={page.form.canWrite ? page.form.openCreate : undefined}
      />
      {page.showVersion && head ? <VersionLine head={head} team={page.team} /> : null}
      <div
        role="status"
        aria-busy={page.region.busy || undefined}
        className="text-[13px] text-muted-foreground empty:hidden"
      >
        {page.region.text}
        {page.form.open ? null : (
          <WriteNotice
            write={page.write}
            role={page.data.role}
            hrefFor={page.sheet.hrefFor}
            onOpen={page.url.openFeature}
          />
        )}
      </div>
      {page.form.open ? null : (
        <WriteFailure write={page.write} role={page.data.role} onReopen={page.reopenDraft} />
      )}
      {page.showFilters ? (
        <FeaturesFilters
          status={page.url.status}
          priority={page.url.priority}
          onChange={page.filters.onChange}
          onClear={page.filters.onClear}
          statusRef={page.filters.statusRef}
        />
      ) : null}
      <Body page={page} />
      <Sheet page={page} />
      <FormSheet page={page} />
    </div>
  );
}
