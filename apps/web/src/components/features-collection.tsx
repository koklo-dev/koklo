"use client";

import {
  Alert,
  AlertDescription,
  CountBar,
  Icon,
  InlineAlert,
  SpecCollection,
  VirtualList,
} from "@koklo/ui";
import { useEffect, useRef } from "react";
import type { FeaturesPageModel } from "../lib/use-features-page.ts";
import { FeatureSheet } from "./feature-sheet.tsx";
import { SpecBody } from "./features-body.tsx";
import { FeaturesAgentEmpty, FeaturesEmpty, FeaturesEmptyFiltered } from "./features-empty.tsx";
import { FeaturesFilters } from "./features-filters.tsx";
import { ProposeEntry } from "./features-header-action.tsx";
import { FeaturesList } from "./features-list.tsx";

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

function EmptyView({ page }: { page: FeaturesPageModel }) {
  return page.propose.enabled && page.form.canWrite ? (
    <FeaturesAgentEmpty
      agent={
        <ProposeEntry
          propose={page.propose}
          onReview={page.url.openReview}
          idleLabel="Proposer le fonctionnel"
        />
      }
      onCreate={page.form.openCreate}
    />
  ) : (
    <FeaturesEmpty onCreate={page.form.canWrite ? page.form.openCreate : undefined} />
  );
}

/** Corps de l'onglet Fonctionnalités : un seul état principal à la fois. */
function Body({ page }: { page: FeaturesPageModel }) {
  const { data } = page;
  return (
    <SpecBody
      view={data.view}
      projectId={data.projectId}
      role={data.role}
      team={page.team}
      expired={data.expired}
      retryLoad={data.retryLoad}
      refresh={data.refresh}
      refetchRepos={() => void data.repos.refetch()}
      repoCreated={page.repoCreated}
      errorTitle="Impossible de charger les fonctionnalités"
      skeleton={<Skeleton />}
      empty={<EmptyView page={page} />}
      emptyFiltered={<NoResults page={page} />}
      list={<ListView page={page} building={data.view.kind === "list" && data.view.building} />}
    />
  );
}

/** Fiche ancrée de la fonctionnalité choisie (`?sel=`), contenu de la région de `SpecCollection`. */
function Detail({ page }: { page: FeaturesPageModel }) {
  const { url, data } = page;
  if (!page.sheetOpen || !url.feature) return null;
  return (
    <FeatureSheet
      key={url.feature}
      projectId={data.projectId}
      specId={url.feature}
      summary={data.features.items.find((item) => item.specId === url.feature)}
      role={data.role}
      onGone={page.sheet.refetchList}
      onEdit={
        page.form.canWrite ? () => page.form.openEdit(url.feature as string, true) : undefined
      }
    />
  );
}

/** Filtres puis corps de la liste, dans la colonne de gauche de la collection ; la fiche est à droite. */
function ListColumn({ page }: { page: FeaturesPageModel }) {
  return (
    <>
      {page.showFilters ? (
        <FeaturesFilters
          status={page.url.status}
          priority={page.url.priority}
          validation={page.url.validation}
          onChange={page.filters.onChange}
          onClear={page.filters.onClear}
          statusRef={page.filters.statusRef}
          search={page.search}
        />
      ) : null}
      <Body page={page} />
    </>
  );
}

/** Fiche refermée (croix, Échap, Retour) : le focus revient au lien de la ligne d'origine, ou au titre de la page. */
function useReturnFocus(page: FeaturesPageModel): void {
  const { feature } = page.url;
  const previous = useRef<string | undefined>(undefined);
  const { returnFocus } = page.sheet;
  useEffect(() => {
    const closed = previous.current;
    previous.current = feature;
    if (closed && !feature) returnFocus(closed);
  }, [feature, returnFocus]);
}

/** Collection de la spec (maquette 10 l.179-221) : liste à gauche, fiche ancrée de `?sel=` à droite. */
export function Collection({ page }: { page: FeaturesPageModel }) {
  const open = page.sheetOpen && page.url.feature;
  useReturnFocus(page);
  return (
    <SpecCollection
      list={<ListColumn page={page} />}
      {...(open ? { detail: <Detail page={page} /> } : {})}
      detailLabel="Fiche de la fonctionnalité"
      onCloseDetail={page.url.closeFeature}
    />
  );
}
