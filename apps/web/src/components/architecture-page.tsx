"use client";

import { Button, Icon, InlineAlert, Skeleton } from "@koklo/ui";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ArchitectureHeaderAction } from "../lib/architecture-header-state.ts";
import { withArchitectureUrl } from "../lib/architecture-tab.ts";
import { upstreamTargetOf } from "../lib/architecture-upstream.ts";
import { launchDetailOf } from "../lib/launch-report.ts";
import { specPath } from "../lib/shell-routes.ts";
import { type ArchitecturePageModel, useArchitecturePage } from "../lib/use-architecture-page.ts";
import { ArchitectureClientView } from "./architecture-client-view.tsx";
import { ArchitectureComponentSheet } from "./architecture-component-sheet.tsx";
import { ArchitectureComponentsTab } from "./architecture-components-tab.tsx";
import { ArchitectureDecisionSheet } from "./architecture-decision-sheet.tsx";
import { ArchitectureDecisionsTab } from "./architecture-decisions-tab.tsx";
import { ArchitectureDocumentTab } from "./architecture-document-tab.tsx";
import { ArchitectureEmptyPlain, ArchitectureReady } from "./architecture-empty.tsx";
import { ArchitectureFlowSheet } from "./architecture-flow-sheet.tsx";
import { ArchitectureFlowsTab } from "./architecture-flows-tab.tsx";
import { ArchitectureGenerating } from "./architecture-generating.tsx";
import { ArchitectureHeader } from "./architecture-header.tsx";
import { ArchitectureReviewBar, ArchitectureReviewView } from "./architecture-review-view.tsx";
import { ArchitectureSchemaTab } from "./architecture-schema-tab.tsx";
import { ArchitectureUpstreamAlert } from "./architecture-upstream-alert.tsx";
import { SpecBody } from "./features-body.tsx";
import { ProposeEntry } from "./features-header-action.tsx";
import { ProposeDialog } from "./features-propose.tsx";
import { StatusBlock } from "./features-status-block.tsx";
import { PageBody } from "./page-body.tsx";

const BUTTON = "h-11 w-full md:h-9 md:w-auto";

/** « Proposer les mises à jour » : demande préremplie sur les éléments amont modifiés (B580), partagée avec le bandeau. */
function proposeUpdatesOf(page: ArchitecturePageModel): (() => void) | undefined {
  const { propose, upstream } = page;
  return propose.enabled && page.form.canWrite
    ? () =>
        propose.launch.prefill(
          "complete",
          `Mettre l'architecture à jour d'après ${upstream.ids.join(", ")}`,
        )
    : undefined;
}

/** Bouton d'une action de l'en-tête (maquette 13 l.859-866) ; l'agent reste le seul bouton primaire. */
function ActionButton({
  action,
  page,
}: {
  action: ArchitectureHeaderAction;
  page: ArchitecturePageModel;
}) {
  switch (action) {
    case "propose":
      return <ProposeEntry propose={page.propose} onReview={page.url.openReview} />;
    case "propose-updates":
      return (
        <Button type="button" className={BUTTON} onClick={() => proposeUpdatesOf(page)?.()}>
          <Icon name="wand_stars" size={20} />
          Proposer les mises à jour
        </Button>
      );
    case "repropose":
      return (
        <Button type="button" className={BUTTON} onClick={() => page.propose.launch.setOpen(true)}>
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
          Ajouter
        </Button>
      );
    default:
      return <WriteButton action={action} page={page} />;
  }
}

/** Boutons d'écriture de l'en-tête : valider, puis créer un composant, une décision ou un flux. */
function WriteButton({
  action,
  page,
}: {
  action: "validate" | "create-decision" | "create-flow" | "create";
  page: ArchitecturePageModel;
}) {
  switch (action) {
    case "validate":
      return (
        <Button
          type="button"
          className={BUTTON}
          disabled={page.validate.pending}
          onClick={() => void page.validate.validate()}
        >
          <Icon name="verified" size={20} />
          Valider l'architecture
        </Button>
      );
    case "create-decision":
      return (
        <Button
          type="button"
          variant="outline"
          data-new-feature
          className={BUTTON}
          onClick={() => {
            page.write.dismiss();
            page.url.openCreateDecision();
          }}
        >
          <Icon name="add" size={20} />
          Nouvelle décision
        </Button>
      );
    case "create-flow":
      return (
        <Button
          type="button"
          variant="outline"
          data-new-feature
          className={BUTTON}
          onClick={() => {
            page.write.dismiss();
            page.url.openCreateFlow();
          }}
        >
          <Icon name="add" size={20} />
          Nouveau flux
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
          Nouveau composant
        </Button>
      );
  }
}

/** Contenu de l'onglet Schéma, Document, Composants ou Flux. */
function TabContent({ page }: { page: ArchitecturePageModel }) {
  switch (page.url.tab) {
    case "schema":
      return <ArchitectureSchemaTab page={page} />;
    case "document":
      return <ArchitectureDocumentTab page={page} />;
    case "flows":
      return <ArchitectureFlowsTab page={page} />;
    case "decisions":
      return <ArchitectureDecisionsTab page={page} />;
    default:
      return <ArchitectureComponentsTab page={page} />;
  }
}

function Empty({ page }: { page: ArchitecturePageModel }) {
  if (page.propose.enabled && page.form.canWrite) {
    return (
      <ArchitectureReady
        agent={
          <ProposeEntry
            propose={page.propose}
            onReview={page.url.openReview}
            idleLabel="Proposer l'architecture"
          />
        }
        onCreate={page.form.openCreate}
      />
    );
  }
  return <ArchitectureEmptyPlain canWrite={page.form.canWrite} onCreate={page.form.openCreate} />;
}

/** Échec de « Valider l'architecture » et impact amont d'un livrable « À revoir » (B578 à B580). */
function ValidationNotices({ page }: { page: ArchitecturePageModel }) {
  const router = useRouter();
  const { validate, upstream } = page;
  const first = upstream.ids[0];
  const onPropose = proposeUpdatesOf(page);
  return (
    <>
      {validate.error ? (
        <InlineAlert variant="error" icon="error">
          {validate.error}
        </InlineAlert>
      ) : null}
      {page.team && first ? (
        <ArchitectureUpstreamAlert
          ids={upstream.ids}
          concerned={[...upstream.components, ...upstream.flows]}
          version={page.validation?.sha}
          onSee={() => router.push(upstreamTargetOf(page.projectId, first))}
          onPropose={onPropose}
        />
      ) : null}
    </>
  );
}

/** Corps hors relecture : un seul état principal à la fois (design/screens/S-spec-architecture.md §4). */
function ListBody({ page }: { page: ArchitecturePageModel }) {
  const { view, role, sources } = page;
  const hrefFor = (specId: string) =>
    `${specPath(page.projectId, "architecture")}${withArchitectureUrl("", { tab: "components", c: specId })}`;
  const status = (
    <StatusBlock
      formOpen={page.form.open}
      region={{
        countBar: page.region.showCount,
        busy: page.region.busy,
        text: page.region.text,
        srText: page.region.srText,
      }}
      write={page.write}
      role={role}
      hrefFor={hrefFor}
      onOpen={page.url.openComponent}
      onReopen={page.reopenDraft}
      proposeNotice={page.propose.enabled ? page.propose.launch.notice : undefined}
    />
  );
  const notices = <ValidationNotices page={page} />;
  const body = (
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
      errorTitle="Impossible de charger l'architecture"
      skeleton={<Skeleton aria-busy="true" className="h-64 rounded-xl" />}
      empty={<Empty page={page} />}
      emptyFiltered={<TabContent page={page} />}
      list={<TabContent page={page} />}
    />
  );
  // Le Document est pleine largeur (maquette 13 l.241) : colonnes jusqu'au bord et jusqu'en bas, hors du cadre de page.
  if (page.url.tab === "document" && (view.kind === "list" || view.kind === "empty-filtered")) {
    return (
      <>
        <PageBody>
          {notices}
          {status}
        </PageBody>
        {body}
      </>
    );
  }
  return (
    <PageBody>
      <div className="flex flex-col gap-4">
        {notices}
        {status}
        {body}
      </div>
    </PageBody>
  );
}

/** Relecture ouverte : génération, onglet Relecture, ou l'architecture proposée dans les onglets de lecture. */
function ReviewBody({ page }: { page: ArchitecturePageModel }) {
  const { url, propose, head } = page;
  if (page.generating) {
    return (
      <ArchitectureGenerating
        onLeave={url.closeReview}
        detail={launchDetailOf(propose.status.launch)}
      />
    );
  }
  if (url.tab === "review") {
    return (
      <ArchitectureReviewView
        projectId={page.projectId}
        branch={head?.branch}
        propose={propose}
        warnings={page.checks.warnings}
        onLeave={url.closeReview}
      />
    );
  }
  return (
    <>
      <ArchitectureReviewBar
        projectId={page.projectId}
        branch={head?.branch}
        statusText={page.region.text}
        onLeave={url.closeReview}
      />
      {url.tab === "document" ? (
        <TabContent page={page} />
      ) : (
        <PageBody>
          <TabContent page={page} />
        </PageBody>
      )}
    </>
  );
}

/** Feuille du formulaire : la décision (`ADR-`), le flux (`P-`) ou le composant ; à la création, selon l'onglet. */
function sheetOf(specId: string | undefined, tab: string) {
  if (specId?.startsWith("ADR-") || (!specId && tab === "decisions"))
    return ArchitectureDecisionSheet;
  if (specId?.startsWith("P-") || (!specId && tab === "flows")) return ArchitectureFlowSheet;
  return ArchitectureComponentSheet;
}

function FormSheet({ page }: { page: ArchitecturePageModel }) {
  const { form, head, write } = page;
  if (!form.open || !head) return null;
  const Sheet = sheetOf(form.specId, page.url.tab);
  return (
    <Sheet
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

/** Modale de lancement : une seule instance par page, hors de la vue de relecture qui porte la sienne. */
function ProposeDialogs({ page }: { page: ArchitecturePageModel }) {
  if (!page.propose.enabled || (page.url.tab === "review" && !page.generating)) return null;
  return (
    <ProposeDialog
      launch={page.propose.launch}
      subtitle="Architecture, d'après le cahier fonctionnel et le modèle de données"
      placeholder="ex. « sépare l'envoi des SMS dans un service à part »"
    />
  );
}

/** Onglet actif : en génération, la Relecture n'existe pas encore (maquette 13 l.859) ; on lit les Composants. */
const activeTabOf = (page: ArchitecturePageModel) =>
  page.generating && page.url.tab === "review" ? "components" : page.url.tab;

/** Écran de l'équipe : en-tête par état, puis liste ou relecture, modales et formulaire. */
function TeamArchitecturePage({ page }: { page: ArchitecturePageModel }) {
  const { header, head } = page;
  return (
    <>
      <ArchitectureHeader
        projectId={page.projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        status={header.status}
        statusLabel={header.statusLabel}
        statusIcon={header.statusIcon}
        summary={header.summary}
        tabCounts={header.tabCounts}
        reviewing={page.propose.reviewing && !page.generating}
        secondaryActions={header.actions.map((action) => (
          <ActionButton key={action} action={action} page={page} />
        ))}
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
 * Écran Architecture d'un projet (`/projects/<id>/spec/architecture`, design/screens/S-spec-architecture.md) : Prêt,
 * Génération, Relecture et Liste · équipe, onglets Relecture, Document et Composants. Client et business : vue en lecture seule du livrable validé (TK-113, B581).
 */
export function ArchitecturePage({ projectId }: { projectId: string }): ReactNode {
  const page = useArchitecturePage(projectId);
  if (page.sources.roleKnown && !page.team) {
    return (
      <ArchitectureClientView
        projectId={projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        canComment={page.role === "client"}
      />
    );
  }
  return <TeamArchitecturePage page={page} />;
}
