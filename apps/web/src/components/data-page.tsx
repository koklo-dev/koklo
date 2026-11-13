"use client";

import { Button, Icon, InlineAlert, Skeleton } from "@koklo/ui";
import type { ReactNode } from "react";
import type { DataHeaderAction } from "../lib/data-header-state.ts";
import { withDataUrl } from "../lib/data-tab.ts";
import { specPath } from "../lib/shell-routes.ts";
import { type DataPageModel, useDataPage } from "../lib/use-data-page.ts";
import { DataClientView } from "./data-client-view.tsx";
import { DataDiagramTab } from "./data-diagram-tab.tsx";
import { DataEmptyPlain, DataReady } from "./data-empty.tsx";
import { DataFixturesTab } from "./data-fixtures-tab.tsx";
import { DataGenerating } from "./data-generating.tsx";
import { DataHeader } from "./data-header.tsx";
import { DataReviewBar, DataReviewView } from "./data-review-view.tsx";
import { DataTablesTab } from "./data-tables-tab.tsx";
import { DataUpstreamAlert } from "./data-upstream-alert.tsx";
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
    case "validate":
      return (
        <Button
          type="button"
          className={BUTTON}
          disabled={page.validate.pending}
          onClick={() => void page.validate.validate()}
        >
          <Icon name="verified" size={20} />
          Valider le modèle
        </Button>
      );
    case "create":
      return (
        <Button
          type="button"
          // Validé : « Ajouter une table » devient le bouton primaire (maquette 11 l.595).
          variant={page.header.status === "validated" ? "default" : "outline"}
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

/** Échec de « Valider le modèle » et impact amont d'un livrable « À revoir » (B449, B450). */
function ValidationNotices({ page }: { page: DataPageModel }) {
  const { validate, upstream, propose } = page;
  const onPropose =
    propose.enabled && page.form.canWrite
      ? () =>
          propose.launch.prefill(
            "complete",
            `Mettre le modèle à jour d'après ${upstream.join(", ")}`,
          )
      : undefined;
  return (
    <>
      {validate.error ? (
        <InlineAlert variant="error" icon="error">
          {validate.error}
        </InlineAlert>
      ) : null}
      {page.team && upstream.length > 0 ? (
        <DataUpstreamAlert ids={upstream} {...(onPropose ? { onPropose } : {})} />
      ) : null}
    </>
  );
}

/** Corps hors relecture : un seul état principal à la fois (design/screens/S-spec-data.md §4). */
function ListBody({ page }: { page: DataPageModel }) {
  const { view, role, sources } = page;
  const hrefFor = (specId: string) =>
    `${specPath(page.projectId, "data")}${withDataUrl("", { tab: "tables", sel: specId })}`;
  return (
    <PageBody>
      <div className="flex flex-col gap-4">
        <ValidationNotices page={page} />
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

/** Écran de l'équipe : en-tête par état, puis liste ou relecture, modales et formulaire. */
function TeamDataPage({ page }: { page: DataPageModel }) {
  const { header, head } = page;
  return (
    <>
      <DataHeader
        projectId={page.projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        status={header.status}
        statusLabel={header.statusLabel}
        statusIcon={header.statusIcon}
        summary={header.summary}
        tabCounts={header.tabCounts}
        reviewing={page.propose.reviewing && !page.generating}
        {...headerActions(page)}
        tab={activeTabOf(page)}
        head={head ?? undefined}
        team={page.team}
      />
      {page.propose.reviewing ? <ReviewBody page={page} /> : <ListBody page={page} />}
      <ProposeDialogs page={page} />
      <FormSheet page={page} />
    </>
  );
}

/**
 * Écran Données d'un projet (`/projects/<id>/spec/data`, design/screens/S-spec-data.md) : Prêt, Génération, Relecture
 * et Liste · équipe, onglets Relecture, Diagramme, Tables et Jeux d'exemple. Client et business lisent le modèle validé
 * dans la vue en lecture seule (TK-109, B447) ; le client y commente.
 */
export function DataPage({ projectId }: { projectId: string }): ReactNode {
  const page = useDataPage(projectId);
  if (page.sources.roleKnown && !page.team) {
    return (
      <DataClientView
        projectId={projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        canComment={page.role === "client"}
      />
    );
  }
  return <TeamDataPage page={page} />;
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
