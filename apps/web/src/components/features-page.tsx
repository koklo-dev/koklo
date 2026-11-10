"use client";

import {
  Alert,
  AlertDescription,
  CountBar,
  EmptyState,
  Icon,
  InlineAlert,
  VirtualList,
} from "@koklo/ui";
import { useSearchParams } from "next/navigation";
import { readFeaturesTab } from "../lib/features-tab.ts";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { canManage } from "../lib/roles.ts";
import { type FeaturesPageModel, useFeaturesPage } from "../lib/use-features-page.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FeatureFormSheet } from "./feature-form-sheet.tsx";
import { FeatureSheet } from "./feature-sheet.tsx";
import { FeaturesEmpty, FeaturesEmptyFiltered, ProjectNotFound } from "./features-empty.tsx";
import { FeaturesFilters } from "./features-filters.tsx";
import { FeaturesHeader } from "./features-header.tsx";
import { FeaturesList } from "./features-list.tsx";
import { PageBody } from "./page-body.tsx";
import { WriteFailure, WriteNotice } from "./saved-notice.tsx";
import { SpecIndexFailed } from "./spec-index-failed.tsx";
import { SpecPreparing } from "./spec-preparing.tsx";
import { SpecRepoMissing } from "./spec-repo-missing.tsx";

/** Huit lignes de 52 px comme celles de la liste, dans le même cadre : la mise en page ne bouge pas à l'arrivée. */
function Skeleton() {
  return (
    <div data-testid="features-skeleton" aria-hidden="true" aria-busy="true">
      <VirtualList
        label="Chargement des fonctionnalités"
        items={[]}
        total={0}
        getItemKey={() => ""}
        renderItem={() => null}
        className="h-auto"
        framed
        loadingRows={8}
      />
    </div>
  );
}

/** Le client lit une simple date de mise à jour ; l'équipe lit l'identifiant de la spec dans l'en-tête de projet. */
function UpdatedLine({ indexedAt }: { indexedAt: string }) {
  const date = new Date(indexedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return <p className="text-xs text-muted-foreground">Mise à jour le {date}</p>;
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
  const { features } = page.data;
  return (
    <div className="flex flex-col gap-4">
      {building ? <BuildingNotice /> : null}
      {page.outsideFilters ? (
        <InlineAlert
          variant="neutral"
          icon="search_off"
          action={{ label: "Effacer les filtres", onClick: page.filters.onClear }}
        >
          Cette fonctionnalité n'apparaît pas avec les filtres actuels.
        </InlineAlert>
      ) : null}
      <FeaturesList
        items={features.items}
        total={features.total}
        offset={features.offset}
        stale={features.stale}
        selected={page.url.feature}
        centerOn={page.data.around}
        hrefFor={page.sheet.hrefFor}
        onOpen={page.url.openFeature}
        footer={page.footer}
        announcement={page.region.countText}
        showCount={page.region.showCount}
      />
    </div>
  );
}

/** Recherche ou filtres sans résultat : la barre de compte porte l'annonce, l'état vide propose la sortie. */
function NoResults({ page }: { page: FeaturesPageModel }) {
  return (
    <div className="flex flex-col gap-4">
      {page.region.showCount ? (
        <CountBar
          total={0}
          loaded={0}
          noun={{ one: "fonctionnalité", other: "fonctionnalités" }}
          sort="identifiant"
          {...(page.url.q ? { query: page.url.q } : {})}
          busy={page.data.features.stale}
          {...(page.region.countText ? { announcement: page.region.countText } : {})}
        />
      ) : null}
      <FeaturesEmptyFiltered
        q={page.url.q}
        projectTotal={page.data.head?.counts.features}
        onClearSearch={page.search.clear}
        onClearFilters={page.filters.onClear}
      />
    </div>
  );
}

/** Corps de l'écran : un seul état principal à la fois (design/screens/S-features.md §4). */
function Body({ page }: { page: FeaturesPageModel }) {
  const { view, role, retryLoad, refresh } = page.data;
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
          canCreate={canManage(role)}
          onFinish={page.repoCreated.onFinish}
          created={page.repoCreated.created}
        />
      );
    case "neutral":
    case "preparing":
      return <Preparing page={page} />;
    case "empty":
      return (
        <FeaturesEmpty
          projectId={page.data.projectId}
          onCreate={page.form.canWrite ? page.form.openCreate : undefined}
        />
      );
    case "empty-filtered":
      return <NoResults page={page} />;
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
      statusText={page.region.panelText}
      announce={page.announce}
      onClose={form.close}
      keepFocus={page.keepFocus}
    />
  );
}

/** Corps de l'onglet Fonctionnalités : liste, filtres, fiche et formulaire (design/screens/S-features.md). */
function FeaturesTab({ projectId }: { projectId: string }) {
  const page = useFeaturesPage(projectId);
  const { head, projectName } = page.data;
  return (
    <>
      <FeaturesHeader
        projectId={projectId}
        name={projectName}
        titleRef={page.titleRef}
        onCreate={page.form.canWrite ? page.form.openCreate : undefined}
        tab="features"
        head={head ?? undefined}
        team={page.team}
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          {page.showVersion && head && !page.team ? (
            <UpdatedLine indexedAt={head.indexedAt} />
          ) : null}
          <div
            // Une seule région d'état dans le document : sous le formulaire modal, c'est celle du panneau ; avec la
            // barre de compte, c'est la sienne (elle annonce aussi les avis d'écriture que ce bloc affiche).
            role={page.form.open || page.region.countBar ? undefined : "status"}
            aria-busy={page.region.busy || undefined}
            className="text-meta text-muted-foreground empty:hidden"
          >
            {page.form.open ? null : (
              <>
                {page.region.countBar ? null : page.region.text}
                <WriteNotice
                  write={page.write}
                  role={page.data.role}
                  hrefFor={page.sheet.hrefFor}
                  onOpen={page.url.openFeature}
                />
              </>
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
              search={page.search}
            />
          ) : null}
          <Body page={page} />
          <Sheet page={page} />
          <FormSheet page={page} />
        </div>
      </PageBody>
    </>
  );
}

const SOON_TABS = {
  rules: "Les règles métier arrivent dans une prochaine version.",
  roles: "Les rôles et permissions arrivent dans une prochaine version.",
  flows: "Les parcours arrivent dans une prochaine version.",
} as const;

/** Onglets pas encore livrés : l'en-tête reste, le corps est un `EmptyState` « Bientôt » (aucune lecture de spec). */
function SoonTab({ projectId, tab }: { projectId: string; tab: keyof typeof SOON_TABS }) {
  const shell = useProjectShell(projectId);
  return (
    <>
      <FeaturesHeader
        projectId={projectId}
        name={shell.data?.name}
        titleRef={null}
        onCreate={undefined}
        tab={tab}
        head={undefined}
        team={false}
      />
      <PageBody>
        <EmptyState
          icon="schedule"
          title="Bientôt"
          description={SOON_TABS[tab]}
          className="mx-auto max-w-xl"
        />
      </PageBody>
    </>
  );
}

/**
 * Cahier fonctionnel d'un projet (`/projects/<id>/spec/functional?tab=`) : l'onglet Fonctionnalités est l'écran
 * en lecture et en écriture ; les trois autres sont « Bientôt ». Un `tab` inconnu ouvre les fonctionnalités.
 */
export function FeaturesPage({ projectId }: { projectId: string }) {
  const tab = readFeaturesTab(useSearchParams().toString());
  return tab === "features" ? (
    <FeaturesTab projectId={projectId} />
  ) : (
    <SoonTab projectId={projectId} tab={tab} />
  );
}
