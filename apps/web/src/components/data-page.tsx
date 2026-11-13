"use client";

import { Button, Icon, Skeleton } from "@koklo/ui";
import type { ReactNode } from "react";
import type { DataHeaderAction } from "../lib/data-header-state.ts";
import { withDataUrl } from "../lib/data-tab.ts";
import { specPath } from "../lib/shell-routes.ts";
import { type DataPageModel, useDataPage } from "../lib/use-data-page.ts";
import { DataDiagramTab } from "./data-diagram-tab.tsx";
import { DataEmptyPlain, DataLocked, DataReady } from "./data-empty.tsx";
import { DataFixturesTab } from "./data-fixtures-tab.tsx";
import { DataGenerating } from "./data-generating.tsx";
import { DataHeader } from "./data-header.tsx";
import { DataReviewBar, DataReviewView } from "./data-review-view.tsx";
import { DataTablesTab } from "./data-tables-tab.tsx";
import { SpecBody } from "./features-body.tsx";
import { ProposeEntry } from "./features-header-action.tsx";
import { ProposeDialog } from "./features-propose.tsx";
import { StatusBlock } from "./features-status-block.tsx";
import { PageBody } from "./page-body.tsx";
import { TableFormSheet } from "./table-form-sheet.tsx";

const BUTTON = "h-11 w-full md:h-9 md:w-auto";

/** Bouton d'une action de l'en-tête (maquette 11 l.598) ; `create` est en contour (maquette 11 l.595) ; l'agent reste le seul bouton primaire. */
function ActionButton({ action, page }: { action: DataHeaderAction; page: DataPageModel }) {
  switch (action) {
    case "propose":
      return <ProposeEntry propose={page.propose} onReview={page.url.openReview} />;
    case "repropose":
      return (
        <Button
          type="button"
          variant="outline"
          className={BUTTON}
          onClick={() => page.propose.launch.setOpen(true)}
        >
          <Icon name="wand_stars" size={20} />
          Reproposer
        </Button>
      );
    case "add":
      return (
        <Button
          type="button"
          variant="outline"
          data-new-feature
          className={BUTTON}
          onClick={page.form.openCreate}
        >
          <Icon name="add" size={20} />
          Ajouter une table
        </Button>
      );
    case "create":
      return (
        <Button
          type="button"
          variant="outline"
          data-new-feature
          className={BUTTON}
          onClick={page.form.openCreate}
        >
          <Icon name="add" size={20} />
          Ajouter une table
        </Button>
      );
  }
}

function headerActions(page: DataPageModel) {
  const { actions } = page.header;
  const button = (action: DataHeaderAction) => (
    <ActionButton key={action} action={action} page={page} />
  );
  return { secondaryActions: actions.map(button) };
}

/** Contenu de l'onglet Diagramme, Tables ou Jeux d'exemple. */
function TabContent({ page }: { page: DataPageModel }) {
  if (page.url.tab === "tables") return <DataTablesTab page={page} />;
  if (page.url.tab === "fixtures") return <DataFixturesTab page={page} />;
  return <DataDiagramTab page={page} />;
}

function Empty({ page }: { page: DataPageModel }) {
  const counts = page.head?.counts;
  if (page.propose.enabled && page.form.canWrite && counts) {
    return (
      <DataReady
        agent={
          <ProposeEntry
            propose={page.propose}
            onReview={page.url.openReview}
            idleLabel="Proposer le modèle de données"
          />
        }
        counts={counts}
        onCreate={page.form.openCreate}
      />
    );
  }
  return <DataEmptyPlain canWrite={page.form.canWrite} onCreate={page.form.openCreate} />;
}

/** Corps hors relecture : un seul état principal à la fois (design/screens/S-spec-data.md §4). */
function ListBody({ page }: { page: DataPageModel }) {
  const { view, role, sources } = page;
  const hrefFor = (specId: string) =>
    `${specPath(page.projectId, "data")}${withDataUrl("", { tab: "tables", sel: specId })}`;
  return (
    <PageBody>
      <div className="flex flex-col gap-4">
        <StatusBlock
          formOpen={page.form.open}
          region={{
            countBar: page.region.showCount,
            busy: page.region.busy,
            text: page.region.text,
          }}
          write={page.write}
          role={role}
          hrefFor={hrefFor}
          onOpen={page.url.openTable}
          onReopen={page.reopenDraft}
          proposeNotice={page.propose.enabled ? page.propose.launch.notice : undefined}
        />
        <SpecBody
          view={view}
          projectId={page.projectId}
          role={role}
          team={page.team}
          expired={page.expired}
          retryLoad={page.retryLoad}
          refresh={page.refresh}
          refetchRepos={() => void sources.repos.refetch()}
          repoCreated={page.repoCreated}
          errorTitle="Impossible de charger le modèle de données"
          skeleton={<Skeleton aria-busy="true" className="h-64 rounded-xl" />}
          empty={<Empty page={page} />}
          emptyFiltered={<TabContent page={page} />}
          list={<TabContent page={page} />}
        />
      </div>
    </PageBody>
  );
}

/** Relecture ouverte : génération, onglet Relecture, ou le modèle proposé dans les trois onglets de lecture. */
function ReviewBody({ page }: { page: DataPageModel }) {
  const { url, propose, head } = page;
  if (page.generating) return <DataGenerating onLeave={url.closeReview} />;
  if (url.tab === "review") {
    return (
      <DataReviewView
        projectId={page.projectId}
        branch={head?.branch}
        propose={propose}
        onLeave={url.closeReview}
      />
    );
  }
  return (
    <>
      <DataReviewBar
        projectId={page.projectId}
        branch={head?.branch}
        statusText={page.region.text}
        onLeave={url.closeReview}
      />
      <PageBody>
        <TabContent page={page} />
      </PageBody>
    </>
  );
}

function FormSheet({ page }: { page: DataPageModel }) {
  const { form, head, write } = page;
  if (!form.open || !head) return null;
  return (
    <TableFormSheet
      projectId={page.projectId}
      mode={form.mode}
      specId={form.specId}
      role={page.role}
      head={head}
      write={write}
      statusText={page.region.panelText}
      announce={page.announce}
      onClose={form.close}
      keepFocus={{ current: write.phase === "saved" }}
    />
  );
}

/** Onglet actif : en génération, la Relecture n'existe pas encore (maquette 11 l.621) ; on lit le Diagramme. */
const activeTabOf = (page: DataPageModel) =>
  page.generating && page.url.tab === "review" ? "diagram" : page.url.tab;

/**
 * Écran Données d'un projet (`/projects/<id>/spec/data`, design/screens/S-spec-data.md) : Prêt, Génération, Relecture
 * et Liste · équipe, onglets Relecture, Diagramme, Tables et Jeux d'exemple. Client et business : « réservée à l'équipe ».
 */
export function DataPage({ projectId }: { projectId: string }): ReactNode {
  const page = useDataPage(projectId);
  const locked = page.sources.roleKnown && !page.team;
  const { header, head } = page;
  return (
    <>
      <DataHeader
        projectId={projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        status={header.status}
        statusLabel={header.statusLabel}
        statusIcon={header.statusIcon}
        summary={header.summary}
        tabCounts={header.tabCounts}
        reviewing={page.propose.reviewing && !page.generating}
        {...(locked ? {} : headerActions(page))}
        tab={activeTabOf(page)}
        head={head ?? undefined}
        team={page.team}
      />
      {locked ? (
        <DataLocked />
      ) : page.propose.reviewing ? (
        <ReviewBody page={page} />
      ) : (
        <ListBody page={page} />
      )}
      {locked ? null : <ProposeDialogs page={page} />}
      {locked ? null : <FormSheet page={page} />}
    </>
  );
}

/** Modale de lancement : une seule instance par page, hors de la vue de relecture qui porte la sienne. */
function ProposeDialogs({ page }: { page: DataPageModel }) {
  if (!page.propose.enabled || (page.url.tab === "review" && !page.generating)) return null;
  return (
    <ProposeDialog
      launch={page.propose.launch}
      subtitle="Modèle de données, d'après le cahier fonctionnel"
      placeholder="ex. « ajoute l'historique des prix des prestations »"
    />
  );
}
