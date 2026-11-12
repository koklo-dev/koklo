"use client";

import { type HeaderAction, tabNumbers } from "../lib/features-header-state.ts";
import type { FeaturesPageModel } from "../lib/use-features-page.ts";
import { useFeaturesPage } from "../lib/use-features-page.ts";
import { FeatureFormSheet } from "./feature-form-sheet.tsx";
import { Collection } from "./features-collection.tsx";
import { FeaturesHeader } from "./features-header.tsx";
import { type ClientEntry, HeaderActionButton, useHeaderState } from "./features-header-action.tsx";
import { ProposeDialog } from "./features-propose.tsx";
import { ReviewView } from "./features-review-view.tsx";
import { StatusBlock } from "./features-status-block.tsx";
import { PageBody } from "./page-body.tsx";

/** Le client lit une simple date de mise à jour ; l'équipe lit l'identifiant de la spec dans l'en-tête de projet. */
function UpdatedLine({ indexedAt }: { indexedAt: string }) {
  const date = new Date(indexedAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return <p className="text-xs text-muted-foreground">Mise à jour le {date}</p>;
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

/** Actions de l'en-tête : les secondaires, puis la primaire (« Nouvelle fonctionnalité »). */
function headerActions(
  page: FeaturesPageModel,
  actions: ReadonlyArray<HeaderAction>,
  client: ClientEntry,
) {
  const button = (action: (typeof actions)[number]) => (
    <HeaderActionButton
      key={action}
      action={action}
      tab="features"
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

/** Corps de l'onglet Fonctionnalités : liste, filtres, fiche, formulaire et relecture (design/screens/S-spec-functional.md). */
export function FeaturesListTab({ projectId }: { projectId: string }) {
  const page = useFeaturesPage(projectId);
  const { head, projectName } = page.data;
  const header = useHeaderState(page.propose, projectId, {
    team: page.team,
    role: page.data.role,
    canWrite: page.form.canWrite,
    viewKind: page.data.view.kind,
    total: head?.counts.features,
    tab: "features",
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
        tabCount={header.tabCount}
        tabCounts={header.tabCounts}
        reviewing={page.propose.reviewing}
        {...headerActions(page, header.actions, header.client)}
        tab="features"
        head={head ?? undefined}
        team={page.team}
      />
      {page.propose.reviewing ? (
        <ReviewView
          projectId={projectId}
          branch={head?.branch}
          tab="features"
          propose={page.propose}
          onLeave={page.url.closeReview}
        />
      ) : (
        <PageBody>
          <div className="flex flex-col gap-4">
            {page.showVersion && head && !page.team ? (
              <UpdatedLine indexedAt={head.indexedAt} />
            ) : null}
            <StatusBlock
              formOpen={page.form.open}
              region={page.region}
              write={page.write}
              role={page.data.role}
              hrefFor={page.sheet.hrefFor}
              onOpen={page.url.openFeature}
              onReopen={page.reopenDraft}
              proposeNotice={page.propose.enabled ? page.propose.launch.notice : undefined}
            />
            <Collection page={page} />
            {page.propose.enabled ? <ProposeDialog launch={page.propose.launch} /> : null}
            <FormSheet page={page} />
          </div>
        </PageBody>
      )}
    </>
  );
}
