"use client";

import type { ProjectOverview } from "@koklo/contract";
import { useState } from "react";
import { errorCode } from "../lib/api-error.ts";
import { absoluteLink } from "../lib/overview-labels.ts";
import { useProjectOverview } from "../lib/use-project-overview.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ProjectNotFound } from "./features-empty.tsx";
import { OverviewHeader } from "./overview-header.tsx";
import { OverviewMain } from "./overview-main.tsx";
import { OverviewNextStep, OverviewPhase, OverviewStats } from "./overview-phase.tsx";
import { OverviewSide } from "./overview-side.tsx";
import { OverviewError, OverviewSkeleton } from "./overview-states.tsx";
import { PageBody } from "./page-body.tsx";

const COPIED = "Lien copié";
const NOT_COPIED = "Impossible de copier le lien.";

/** Copie un lien absolu et l'annonce (`role="status"`) ; l'annonce se vide à la copie suivante. */
function useCopyLink() {
  const [notice, setNotice] = useState("");
  const copy = (href: string) => {
    setNotice("");
    navigator.clipboard
      .writeText(absoluteLink(href, window.location.origin))
      .then(() => setNotice(COPIED))
      .catch(() => setNotice(NOT_COPIED));
  };
  return { notice, copy };
}

function Loaded({ projectId, overview }: { projectId: string; overview: ProjectOverview }) {
  const { notice, copy } = useCopyLink();
  const team = overview.audience === "team";
  return (
    <PageBody>
      <div className="flex flex-col gap-6">
        <OverviewPhase overview={overview} />
        {overview.nextAction ? (
          <OverviewNextStep nextAction={overview.nextAction} onCopy={copy} />
        ) : null}
        <p role="status" className="text-meta text-muted-foreground empty:hidden">
          {notice}
        </p>
        <OverviewStats stats={overview.stats} />
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_460px]">
            <OverviewMain main={overview.main} projectId={projectId} team={team} />
          </div>
          <OverviewSide
            projectId={projectId}
            activity={overview.activity}
            people={overview.people}
          />
        </div>
      </div>
    </PageBody>
  );
}

function Body({
  projectId,
  query,
}: {
  projectId: string;
  query: ReturnType<typeof useProjectOverview>;
}) {
  const redirecting = useUnauthorizedRedirect(query.error);
  if (query.data) return <Loaded projectId={projectId} overview={query.data} />;
  if (query.isError && !redirecting) {
    return errorCode(query.error) === "NOT_FOUND" ? (
      <PageBody>
        <ProjectNotFound />
      </PageBody>
    ) : (
      <PageBody>
        <OverviewError onRetry={() => void query.refetch()} />
      </PageBody>
    );
  }
  return <OverviewSkeleton />;
}

/** Vue d'ensemble d'un projet (`/projects/<id>`, design/screens/S-overview.md) : un appel, quatre blocs et une colonne. */
export function OverviewPage({ projectId }: { projectId: string }) {
  const query = useProjectOverview(projectId);
  const shell = useProjectShell(projectId);
  return (
    <>
      <OverviewHeader projectId={projectId} name={shell.data?.name} overview={query.data} />
      <Body projectId={projectId} query={query} />
    </>
  );
}
