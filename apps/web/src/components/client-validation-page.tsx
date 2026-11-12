"use client";

import { InlineAlert, Skeleton, ValidationBanner } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { errorCode } from "../lib/api-error.ts";
import { bannerCopy, progressSummary } from "../lib/client-validation-labels.ts";
import { type FeaturesTab, readFeaturesTab } from "../lib/features-tab.ts";
import { orpc } from "../lib/orpc.ts";
import { useClientProgress } from "../lib/use-client-space.ts";
import { useReviewActions } from "../lib/use-review-actions.ts";
import { ClientRolesTab, ClientRulesTab } from "./client-block-tab.tsx";
import { ClientFeaturesTab } from "./client-features-tab.tsx";
import { ClientFlowsTab } from "./client-flows-tab.tsx";
import { ClientValidationHeader, FinishError } from "./client-validation-header.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { ProjectNotFound } from "./features-empty.tsx";
import { PageBody } from "./page-body.tsx";

type Progress = NonNullable<ReturnType<typeof useClientProgress>["data"]>;
type Actions = ReturnType<typeof useReviewActions>;

function TabBody({
  projectId,
  tab,
  progress,
  updatedAt,
  actions,
}: {
  projectId: string;
  tab: FeaturesTab;
  progress: Progress;
  updatedAt: number;
  actions: Actions;
}) {
  const clientName = progress.clientFirstName ?? "Le client";
  if (tab === "features") {
    return (
      <ClientFeaturesTab
        projectId={projectId}
        progress={progress}
        progressUpdatedAt={updatedAt}
        clientName={clientName}
        actions={actions}
      />
    );
  }
  if (tab === "flows") {
    return (
      <ClientFlowsTab projectId={projectId} canValidate={progress.canValidate} actions={actions} />
    );
  }
  const Block = tab === "rules" ? ClientRulesTab : ClientRolesTab;
  return <Block projectId={projectId} canValidate={progress.canValidate} actions={actions} />;
}

/** Bandeau d'attente, éléments modifiés depuis la validation, refus du serveur. */
function Notices({ progress, refusal }: { progress: Progress; refusal: string | undefined }) {
  const copy = bannerCopy(progress);
  return (
    <>
      <ValidationBanner tone={copy.tone} title={copy.title} progress={progressSummary(progress)}>
        {copy.text}
      </ValidationBanner>
      {progress.changed > 0 ? (
        <InlineAlert variant="warning" icon="schedule">
          {progress.changed === 1
            ? "1 élément a changé depuis votre validation."
            : `${progress.changed} éléments ont changé depuis votre validation.`}
        </InlineAlert>
      ) : null}
      <FinishError text={refusal} />
    </>
  );
}

/**
 * Cahier fonctionnel vu par le client (`/projects/<id>/spec/functional`, TK-104) : les fonctionnalités et les parcours
 * un par un, les règles et les rôles en bloc ; aussi lu par le business (sans action) et par l'équipe sans client (D1).
 * Droits vérifiés par le serveur : l'écran ne propose que ce qu'il accepterait.
 */
export function ClientValidationPage({ projectId }: { projectId: string }) {
  const search = useSearchParams();
  const tab = readFeaturesTab(search.toString());
  const progress = useClientProgress(projectId);
  const actions = useReviewActions(projectId);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const projects = useQuery(orpc.project.list.queryOptions());
  const name = projects.data?.find((project) => project.id === projectId)?.name;
  const data = progress.data;
  return (
    <>
      <ClientValidationHeader
        projectId={projectId}
        name={name}
        titleRef={titleRef}
        tab={tab}
        progress={data}
        actions={actions}
        clientView={search.get("vue") === "client"}
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          {progress.isError && errorCode(progress.error) === "NOT_FOUND" ? (
            <ProjectNotFound />
          ) : null}
          {progress.isError && errorCode(progress.error) !== "NOT_FOUND" ? (
            <ErrorNotice
              title="Impossible de charger le cahier"
              onRetry={() => void progress.refetch()}
            >
              Le cahier n'a pas pu être lu.
            </ErrorNotice>
          ) : null}
          {progress.isPending ? <Skeleton aria-busy="true" className="h-64 rounded-xl" /> : null}
          {data ? (
            <>
              <Notices progress={data} refusal={actions.errorFor("deliverable", "functional")} />
              <TabBody
                projectId={projectId}
                tab={tab}
                progress={data}
                updatedAt={progress.dataUpdatedAt}
                actions={actions}
              />
            </>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}
