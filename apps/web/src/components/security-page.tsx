"use client";

import { Button, Icon, type IconName, InlineAlert, Skeleton } from "@koklo/ui";
import { type ReactNode, useId } from "react";
import type { SecurityHeaderAction } from "../lib/security-header-state.ts";
import { SECURITY_ERROR_TITLE, updateInstruction } from "../lib/security-labels.ts";
import { securityFormOf, securityTargetOf, withSecurityUrl } from "../lib/security-tab.ts";
import { specPath } from "../lib/shell-routes.ts";
import { type SecurityPageModel, useSecurityPage } from "../lib/use-security-page.ts";
import { useInPlaceToast } from "../lib/use-security-writes.ts";
import { SpecBody } from "./features-body.tsx";
import { ProposeEntry } from "./features-header-action.tsx";
import { StatusBlock } from "./features-status-block.tsx";
import { SecurityClientView } from "./security-client-view.tsx";
import { SecurityDataTab } from "./security-data-tab.tsx";
import { SecurityDocumentTab } from "./security-document-tab.tsx";
import { SecurityReady } from "./security-empty.tsx";
import { SecurityGenerating } from "./security-generating.tsx";
import { SecurityHeader, securityTabsOf } from "./security-header.tsx";
import { SecurityRequirementsTab } from "./security-requirements-tab.tsx";
import {
  SecurityProposeDialog,
  SecurityReviewBar,
  SecurityReviewView,
} from "./security-review-view.tsx";
import { SecurityRightsTab } from "./security-rights-tab.tsx";
import { SecuritySensitiveSheet } from "./security-sensitive-sheet.tsx";
import { SecuritySummaryTab } from "./security-summary-tab.tsx";
import { SecurityThreatSheet } from "./security-threat-sheet.tsx";
import { SecurityThreatsTab } from "./security-threats-tab.tsx";
import { SecurityUpstreamAlert } from "./security-upstream-alert.tsx";

const BUTTON = "h-11 w-full md:h-9 md:w-auto";

/** « Proposer les mises à jour » : demande préremplie sur les éléments modifiés, partagée avec le bandeau. */
function proposeUpdatesOf(page: SecurityPageModel): (() => void) | undefined {
  const { propose, upstream, form, available } = page;
  if (!propose.enabled || !form.canWrite || available === false) return undefined;
  const ids = upstream.changes.map((change) => change.id).join(", ");
  return () => propose.launch.prefill("threats", updateInstruction(ids));
}

const createThreat = (page: SecurityPageModel) => {
  page.write.dismiss();
  page.url.openCreateOn("threats");
};

interface ActionSpec {
  label: string;
  icon: IconName;
  primary?: boolean;
  /** Ouvre un formulaire : le focus lui revient à la fermeture. */
  opens?: boolean;
  run: (page: SecurityPageModel) => void;
}

/** Boutons de l'en-tête (maquette 15 l.654-659), hors le bouton partagé de l'agent et « Valider ». */
const ACTIONS: Record<Exclude<SecurityHeaderAction, "propose" | "validate">, ActionSpec> = {
  "create-threat": { label: "Nouvelle menace", icon: "add", opens: true, run: createThreat },
  add: { label: "Ajouter", icon: "add", opens: true, run: createThreat },
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

/** « Valider » (B804) : désactivé avec sa raison dans le résumé ; une fois validé, le focus va au titre. */
function ValidateButton({ page, reasonId }: { page: SecurityPageModel; reasonId: string }) {
  const { validate, header, titleRef } = page;
  const run = async () => {
    if (await validate.validate()) titleRef.current?.focus();
  };
  return (
    <Button
      type="button"
      className={BUTTON}
      aria-describedby={header.validateBlocked ? reasonId : undefined}
      disabled={header.validateBlocked || validate.pending}
      onClick={() => void run()}
    >
      <Icon name="verified" size={20} />
      Valider
    </Button>
  );
}

function ActionButton({
  action,
  page,
  reasonId,
}: {
  action: SecurityHeaderAction;
  page: SecurityPageModel;
  reasonId: string;
}) {
  if (action === "propose") {
    return <ProposeEntry propose={page.propose} onReview={page.url.openReview} />;
  }
  if (action === "validate") return <ValidateButton page={page} reasonId={reasonId} />;
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
  threats: SecurityThreatsTab,
  data: SecurityDataTab,
  rights: SecurityRightsTab,
  reqs: SecurityRequirementsTab,
  summary: SecuritySummaryTab,
  doc: SecurityDocumentTab,
};

function TabContent({ page }: { page: SecurityPageModel }) {
  const Tab = TABS[page.url.tab === "review" ? "threats" : page.url.tab];
  return <Tab page={page} />;
}

/** Prêt quand rien n'est écrit et que l'agent peut proposer ; sinon l'onglet, avec son propre état vide. */
function Empty({ page }: { page: SecurityPageModel }) {
  if (page.propose.enabled && page.form.canWrite && page.url.tab !== "doc") {
    return (
      <SecurityReady
        agent={<ProposeEntry propose={page.propose} onReview={page.url.openReview} />}
        onCreate={() => createThreat(page)}
      />
    );
  }
  return <TabContent page={page} />;
}

/** Avis au-dessus de l'onglet : refus de validation, à revoir, avancement de l'écriture, avis du lancement. */
function Notices({ page }: { page: SecurityPageModel }) {
  const { view, url, form, write, role, projectId, propose, upstream } = page;
  // La barre de compte des menaces porte la région d'état de l'écran.
  const counted = view.kind === "list" && url.tab === "threats" && !form.open;
  const hrefFor = (specId: string) =>
    `${specPath(projectId, "security")}${withSecurityUrl("", securityTargetOf(specId))}`;
  const stale = upstream.changes.length > 0 || upstream.items.length > 0;
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 empty:hidden md:px-7 [&:not(:has(>*:not(:empty)))]:pt-0">
      {page.validate.error ? (
        <InlineAlert variant="error" icon="error">
          {page.validate.error}
        </InlineAlert>
      ) : null}
      {stale ? (
        <SecurityUpstreamAlert
          upstream={upstream}
          version={page.validation?.sha}
          onPropose={proposeUpdatesOf(page)}
          closed={form.canWrite && page.available === false}
        />
      ) : null}
      <StatusBlock
        formOpen={form.open}
        region={{
          countBar: counted,
          busy: view.kind === "loading",
          text: page.statusText,
          srText: page.announcement,
        }}
        write={write}
        role={role}
        hrefFor={hrefFor}
        onOpen={url.openElement}
        onReopen={page.reopenDraft}
        proposeNotice={propose.enabled ? propose.launch.notice : undefined}
      />
    </div>
  );
}

/** Corps hors relecture : un seul état principal à la fois (design/screens/S-spec-security.md §4). */
function ListBody({ page }: { page: SecurityPageModel }) {
  const { view, sources } = page;
  const framed = !["list", "empty"].includes(view.kind);
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
      errorTitle={SECURITY_ERROR_TITLE}
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
function ReviewBody({ page }: { page: SecurityPageModel }) {
  if (page.generating) return <SecurityGenerating onLeave={page.url.closeReview} />;
  if (page.url.tab === "review") return <SecurityReviewView page={page} />;
  return (
    <>
      <SecurityReviewBar page={page} />
      <TabContent page={page} />
    </>
  );
}

/** Feuille du formulaire : celle de l'élément modifié ; à la création, celle de l'onglet. */
function FormSheet({ page }: { page: SecurityPageModel }) {
  const { form, head, write, url } = page;
  if (!form.open || !head) return null;
  const props = {
    projectId: page.projectId,
    mode: form.mode,
    specId: form.specId,
    role: page.role,
    head,
    write,
    statusText: page.announcement,
    announce: page.announce,
    onClose: form.close,
    keepFocus: { current: write.phase === "saved" },
  };
  if (securityFormOf(form.specId, url.tab) === "threat") return <SecurityThreatSheet {...props} />;
  const deciding = url.data !== undefined && (form.specId ?? url.data) === url.data;
  return (
    <SecuritySensitiveSheet
      {...props}
      field={form.mode === "create" ? url.data : undefined}
      focusField={deciding ? "retention" : undefined}
    />
  );
}

/** Écran de l'équipe : en-tête par état, puis liste ou relecture, fenêtre de l'agent et formulaire. */
function TeamSecurityPage({ page }: { page: SecurityPageModel }) {
  const { header, head, propose, url } = page;
  const reasonId = useId();
  useInPlaceToast(page);
  const reviewing = propose.reviewing && !page.generating;
  const active = page.generating && url.tab === "review" ? "threats" : url.tab;
  return (
    <>
      <SecurityHeader
        projectId={page.projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        status={header.status}
        statusLabel={header.statusLabel}
        statusIcon={header.statusIcon}
        summary={header.summary}
        summaryId={reasonId}
        actions={header.actions.map((action) => (
          <ActionButton key={action} action={action} page={page} reasonId={reasonId} />
        ))}
        tabs={securityTabsOf(
          page.projectId,
          active,
          header.status === "ready" ? {} : (header.tabCounts ?? {}),
          reviewing,
        )}
        head={head ?? undefined}
      />
      {propose.reviewing ? <ReviewBody page={page} /> : <ListBody page={page} />}
      <SecurityProposeDialog page={page} />
      <FormSheet page={page} />
    </>
  );
}

/**
 * Page Sécurité d'un projet (`/projects/<id>/spec/security`, design/screens/S-spec-security.md) : Prêt, Génération,
 * Relecture, Liste · équipe, Validé et À revoir ; client et business : le résumé validé seul.
 */
export function SecurityPage({ projectId }: { projectId: string }): ReactNode {
  const page = useSecurityPage(projectId);
  if (page.sources.roleKnown && !page.team) {
    return (
      <SecurityClientView
        projectId={projectId}
        name={page.sources.projectName}
        titleRef={page.titleRef}
        acting={page.role === "client"}
      />
    );
  }
  return <TeamSecurityPage page={page} />;
}
