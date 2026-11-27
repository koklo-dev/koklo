"use client";

import { Button, Icon, type IconName, Skeleton } from "@koklo/ui";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { architectureTargetOf } from "../lib/architecture-upstream.ts";
import { specPath } from "../lib/shell-routes.ts";
import type { TechnicalHeaderAction } from "../lib/technical-header-state.ts";
import { TECHNICAL_ERROR_TITLE } from "../lib/technical-labels.ts";
import { withTechnicalUrl } from "../lib/technical-tab.ts";
import { type TechnicalPageModel, useTechnicalPage } from "../lib/use-technical-page.ts";
import { SpecBody } from "./features-body.tsx";
import { ProposeEntry } from "./features-header-action.tsx";
import { StatusBlock } from "./features-status-block.tsx";
import { TechnicalClientView } from "./technical-client-view.tsx";
import { TechnicalDocumentTab } from "./technical-document-tab.tsx";
import { TechnicalReady } from "./technical-empty.tsx";
import { TechnicalEnvironmentSheet } from "./technical-environment-sheet.tsx";
import { TechnicalEnvironmentsTab } from "./technical-environments-tab.tsx";
import { TechnicalGenerating } from "./technical-generating.tsx";
import { TechnicalHeader } from "./technical-header.tsx";
import {
  TechnicalProposeDialog,
  TechnicalReviewBar,
  TechnicalReviewView,
} from "./technical-review-view.tsx";
import { TechnicalStackSheet } from "./technical-stack-sheet.tsx";
import { TechnicalStackTab } from "./technical-stack-tab.tsx";
import { TechnicalUpstreamAlert } from "./technical-upstream-alert.tsx";

const BUTTON = "h-11 w-full md:h-9 md:w-auto";

/** « Proposer les mises à jour » : demande préremplie sur les éléments modifiés, partagée avec le bandeau. */
function proposeUpdatesOf(page: TechnicalPageModel): (() => void) | undefined {
  const { propose, upstream, form, available } = page;
  if (!propose.enabled || !form.canWrite || available === false) return undefined;
  const ids = upstream.changes.map((change) => change.id).join(", ");
  return () =>
    propose.launch.prefill("complete", `Mettre le cahier technique à jour d'après ${ids}`);
}

interface ActionSpec {
  label: string;
  icon: IconName;
  primary?: boolean;
  /** Ouvre un formulaire : le focus lui revient à la fermeture. */
  opens?: boolean;
  run: (page: TechnicalPageModel) => void;
}

const openForm = (tab: "stack" | "environments") => (page: TechnicalPageModel) => {
  page.write.dismiss();
  page.url.openCreateOn(tab);
};

/** Boutons de l'en-tête (maquette 14 l.774-815), hors le bouton partagé de l'agent. */
const ACTIONS: Record<Exclude<TechnicalHeaderAction, "propose">, ActionSpec> = {
  add: {
    label: "Ajouter",
    icon: "add",
    opens: true,
    // En relecture, l'ajout suit l'onglet ouvert.
    run: (page) => openForm(page.url.tab === "environments" ? "environments" : "stack")(page),
  },
  "create-stack": { label: "Nouveau choix", icon: "add", opens: true, run: openForm("stack") },
  "create-environment": {
    label: "Nouvel environnement",
    icon: "add",
    opens: true,
    run: openForm("environments"),
  },
  repropose: {
    label: "Reproposer",
    icon: "wand_stars",
    primary: true,
    run: (page) => page.propose.launch.setOpen(true),
  },
  "propose-updates": {
    label: "Proposer les mises à jour",
    icon: "wand_stars",
    primary: true,
    run: (page) => proposeUpdatesOf(page)?.(),
  },
};

function ActionButton({
  action,
  page,
}: {
  action: TechnicalHeaderAction;
  page: TechnicalPageModel;
}) {
  if (action === "propose") {
    return <ProposeEntry propose={page.propose} onReview={page.url.openReview} />;
  }
  const spec = ACTIONS[action];
  return (
    <Button
      type="button"
      variant={spec.primary ? "default" : "outline"}
      {...(spec.opens ? { "data-new-feature": true } : {})}
      className={BUTTON}
      onClick={() => spec.run(page)}
    >
      <Icon name={spec.icon} size={20} />
      {spec.label}
    </Button>
  );
}

const TABS = {
  stack: TechnicalStackTab,
  environments: TechnicalEnvironmentsTab,
  document: TechnicalDocumentTab,
};

function TabContent({ page }: { page: TechnicalPageModel }) {
  const Tab = TABS[page.url.tab === "review" ? "stack" : page.url.tab];
  return <Tab page={page} />;
}

/** Prêt quand rien n'est écrit et que l'agent peut proposer ; sinon l'onglet, avec son propre état vide. */
function Empty({ page }: { page: TechnicalPageModel }) {
  if (page.propose.enabled && page.form.canWrite && page.url.tab !== "document") {
    return (
      <TechnicalReady
        agent={
          <ProposeEntry
            propose={page.propose}
            onReview={page.url.openReview}
            idleLabel="Proposer le cahier technique"
          />
        }
        onCreate={() => openForm("stack")(page)}
      />
    );
  }
  return <TabContent page={page} />;
}

/** Changements d'architecture depuis la validation (À revoir). */
function UpstreamNotice({ page }: { page: TechnicalPageModel }) {
  const router = useRouter();
  const { upstream, projectId } = page;
  if (upstream.changes.length === 0 && upstream.items.length === 0) return null;
  const first = upstream.changes[0]?.id;
  return (
    <TechnicalUpstreamAlert
      upstream={upstream}
      version={page.validation?.sha}
      onSee={() =>
        router.push(
          first ? architectureTargetOf(projectId, first) : specPath(projectId, "architecture"),
        )
      }
      onPropose={proposeUpdatesOf(page)}
      closed={page.form.canWrite && page.available === false}
    />
  );
}

/** Avis au-dessus de l'onglet : à revoir, avancement de l'écriture, avis du lancement. */
function Notices({ page }: { page: TechnicalPageModel }) {
  const { view, url, form, write, role, projectId, propose } = page;
  const listed = view.kind === "list" || view.kind === "empty-filtered";
  const hrefFor = (specId: string) =>
    `${specPath(projectId, "technical")}${withTechnicalUrl("", { sel: specId })}`;
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 empty:hidden md:px-7 [&:not(:has(>*:not(:empty)))]:pt-0">
      <UpstreamNotice page={page} />
      <StatusBlock
        formOpen={form.open}
        region={{
          // La barre de compte de l'onglet Stack porte la région d'état de l'écran.
          countBar: listed && url.tab === "stack" && !form.open,
          busy: view.kind === "loading",
          text: page.statusText,
          srText: page.announcement,
        }}
        write={write}
        role={role}
        hrefFor={hrefFor}
        onOpen={(specId) => url.select(specId)}
        onReopen={page.reopenDraft}
        proposeNotice={propose.enabled ? propose.launch.notice : undefined}
      />
    </div>
  );
}

/** Corps hors relecture : un seul état principal à la fois (design/screens/S-spec-technical.md §4). */
function ListBody({ page }: { page: TechnicalPageModel }) {
  const { view, sources } = page;
  const framed = !["list", "empty", "empty-filtered"].includes(view.kind);
  const body = (
    <SpecBody
      view={view}
      projectId={page.projectId}
      role={page.role}
      team={page.team}
      expired={page.expired}
      retryLoad={page.retryLoad}
      refresh={page.refresh}
      refetchRepos={() => void sources.repos.refetch()}
      repoCreated={page.repoCreated}
      errorTitle={TECHNICAL_ERROR_TITLE}
      skeleton={<Skeleton aria-busy="true" className="h-64 rounded-xl" />}
      empty={<Empty page={page} />}
      emptyFiltered={<TabContent page={page} />}
      list={<TabContent page={page} />}
    />
  );
  return (
    <>
      <Notices page={page} />
      {framed ? <div className="px-4 py-6 md:px-8">{body}</div> : body}
    </>
  );
}

/** Relecture ouverte : génération, onglet Relecture, ou les onglets de lecture sous leur bandeau. */
function ReviewBody({ page }: { page: TechnicalPageModel }) {
  if (page.generating) return <TechnicalGenerating onLeave={page.url.closeReview} />;
  if (page.url.tab === "review") return <TechnicalReviewView page={page} />;
  return (
    <>
      <TechnicalReviewBar page={page} />
      <TabContent page={page} />
      <TechnicalProposeDialog page={page} />
    </>
  );
}

/** Feuille du formulaire : l'environnement (`ENV-`) ou le choix ; à la création, selon l'onglet. */
function FormSheet({ page }: { page: TechnicalPageModel }) {
  const { form, head, write, url } = page;
  if (!form.open || !head) return null;
  const environment = form.specId ? form.specId.startsWith("ENV-") : url.tab === "environments";
  const Sheet = environment ? TechnicalEnvironmentSheet : TechnicalStackSheet;
  return (
    <Sheet
      projectId={page.projectId}
      mode={form.mode}
      specId={form.specId}
      role={page.role}
      head={head}
      write={write}
      statusText={page.announcement}
      announce={page.announce}
      onClose={form.close}
      keepFocus={{ current: write.phase === "saved" }}
    />
  );
}

/** Écran de l'équipe : en-tête par état, puis liste ou relecture, fenêtre de l'agent et formulaire. */
function TeamTechnicalPage({ page }: { page: TechnicalPageModel }) {
  const { header, head, propose, url } = page;
  return (
    <>
      <TechnicalHeader
        projectId={page.projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        status={header.status}
        statusLabel={header.statusLabel}
        statusIcon={header.statusIcon}
        summary={header.summary}
        tabCounts={header.status === "ready" ? undefined : header.tabCounts}
        reviewing={propose.reviewing && !page.generating}
        secondaryActions={header.actions.map((action) => (
          <ActionButton key={action} action={action} page={page} />
        ))}
        tab={page.generating && url.tab === "review" ? "stack" : url.tab}
        head={head ?? undefined}
      />
      {propose.reviewing ? <ReviewBody page={page} /> : <ListBody page={page} />}
      {propose.reviewing ? null : <TechnicalProposeDialog page={page} />}
      <FormSheet page={page} />
    </>
  );
}

/**
 * Page Technique d'un projet (`/projects/<id>/spec/technical`, design/screens/S-spec-technical.md) : Prêt, Génération,
 * Relecture, Liste · équipe et À revoir, onglets Stack, Environnements et Document. Client et business : le cahier
 * validé, en lecture seule.
 */
export function TechnicalPage({ projectId }: { projectId: string }): ReactNode {
  const page = useTechnicalPage(projectId);
  if (page.sources.roleKnown && !page.team) {
    return (
      <TechnicalClientView
        projectId={projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        canComment={page.role === "client"}
      />
    );
  }
  return <TeamTechnicalPage page={page} />;
}
