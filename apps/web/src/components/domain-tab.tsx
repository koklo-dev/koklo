"use client";

import type { ReactNode } from "react";
import { type HeaderAction, tabNumbers } from "../lib/features-header-state.ts";
import type { FeaturesTab } from "../lib/features-tab.ts";
import type { DomainTab as Tab } from "../lib/use-domain-data.ts";
import type { DomainPageModel } from "../lib/use-domain-page.ts";
import { useDomainPage } from "../lib/use-domain-page.ts";
import { SpecBody } from "./features-body.tsx";
import { FeaturesHeader } from "./features-header.tsx";
import { type ClientEntry, HeaderActionButton, useHeaderState } from "./features-header-action.tsx";
import { ProposeDialog } from "./features-propose.tsx";
import { ReviewView } from "./features-review-view.tsx";
import { StatusBlock } from "./features-status-block.tsx";
import { FlowFormSheet } from "./flow-form-sheet.tsx";
import { FlowsEmpty, FlowsList, FlowsNoResults, FlowsSkeleton } from "./flows-tab.tsx";
import { PageBody } from "./page-body.tsx";
import { RoleFormSheet } from "./role-form-sheet.tsx";
import { RolesEmpty, RolesList, RolesSkeleton } from "./roles-tab.tsx";
import { RuleFormSheet } from "./rule-form-sheet.tsx";
import { RulesEmpty, RulesList, RulesNoResults, RulesSkeleton } from "./rules-tab.tsx";

const FORMS = { rules: RuleFormSheet, roles: RoleFormSheet, flows: FlowFormSheet } as const;

const ERROR_TITLES: Record<Tab, string> = {
  rules: "Impossible de charger les règles métier",
  roles: "Impossible de charger les rôles et permissions",
  flows: "Impossible de charger les parcours",
};

/** Vue de chaque onglet selon l'état principal : squelette, vide, sans résultat, liste. */
function viewsOf(
  page: DomainPageModel,
): Record<"skeleton" | "empty" | "emptyFiltered" | "list", ReactNode> {
  if (page.tab === "rules") {
    return {
      skeleton: <RulesSkeleton />,
      empty: <RulesEmpty page={page} />,
      emptyFiltered: <RulesNoResults page={page} />,
      list: <RulesList page={page} />,
    };
  }
  if (page.tab === "flows") {
    return {
      skeleton: <FlowsSkeleton />,
      empty: <FlowsEmpty page={page} />,
      emptyFiltered: <FlowsNoResults page={page} />,
      list: <FlowsList page={page} />,
    };
  }
  return {
    skeleton: <RolesSkeleton />,
    empty: <RolesEmpty page={page} />,
    emptyFiltered: <RolesList page={page} />,
    list: <RolesList page={page} />,
  };
}

function Body({ page }: { page: DomainPageModel }) {
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
      errorTitle={ERROR_TITLES[page.tab]}
      {...viewsOf(page)}
    />
  );
}

function FormSheet({ page }: { page: DomainPageModel }) {
  const { form, data, write } = page;
  if (!form.open || !data.head) return null;
  const Form = FORMS[page.tab];
  return (
    <Form
      projectId={data.projectId}
      mode={form.mode}
      specId={form.specId}
      role={data.role}
      head={data.head}
      write={write}
      statusText={page.region.panelText}
      announce={page.announce}
      onClose={form.close}
      keepFocus={{ current: write.phase === "saved" }}
    />
  );
}

/** Actions de l'en-tête de l'onglet : les secondaires, puis la primaire (« Nouvelle règle », « Nouveau rôle », « Nouveau parcours »). */
function headerActions(
  page: DomainPageModel,
  actions: ReadonlyArray<HeaderAction>,
  client: ClientEntry,
) {
  const button = (action: (typeof actions)[number]) => (
    <HeaderActionButton
      key={action}
      action={action}
      tab={page.tab}
      propose={page.propose}
      onCreate={page.form.openCreate}
      onReview={page.url.openReview}
      client={client}
    />
  );
  const secondary = actions.filter((action) => action !== "create").map(button);
  return {
    ...(secondary.length > 0 ? { secondaryActions: secondary } : {}),
    ...(actions.includes("create") ? { primaryAction: button("create") } : {}),
  };
}

/** Onglet Règles métier, Rôles et permissions ou Parcours du cahier fonctionnel (design/screens/S-spec-functional.md). */
export function DomainTab({ projectId, tab }: { projectId: string; tab: Tab & FeaturesTab }) {
  const page = useDomainPage(projectId, tab);
  const { head, projectName } = page.data;
  const header = useHeaderState(page.propose, projectId, {
    team: page.team,
    role: page.data.role,
    canWrite: page.form.canWrite,
    viewKind: page.data.view.kind,
    total: head?.counts[tab],
    tab,
    counts: head?.counts && tabNumbers(head.counts),
  });
  return (
    <>
      <FeaturesHeader
        projectId={projectId}
        name={projectName}
        titleRef={page.titleRef}
        status={header.status}
        statusLabel={header.statusLabel}
        summary={header.summary}
        tabCounts={header.tabCounts}
        reviewing={page.propose.reviewing}
        {...headerActions(page, header.actions, header.client)}
        tab={tab}
        head={head ?? undefined}
        team={page.team}
      />
      {page.propose.reviewing ? (
        <ReviewView
          projectId={projectId}
          branch={head?.branch}
          tab={tab}
          propose={page.propose}
          onLeave={page.url.closeReview}
        />
      ) : (
        <PageBody>
          <div className="flex flex-col gap-4">
            <StatusBlock
              formOpen={page.form.open}
              region={page.region}
              write={page.write}
              role={page.data.role}
              hrefFor={page.hrefFor}
              onOpen={page.url.openFeature}
              onReopen={page.reopenDraft}
              proposeNotice={page.propose.enabled ? page.propose.launch.notice : undefined}
            />
            <Body page={page} />
            {page.propose.enabled ? <ProposeDialog launch={page.propose.launch} /> : null}
            <FormSheet page={page} />
          </div>
        </PageBody>
      )}
    </>
  );
}
