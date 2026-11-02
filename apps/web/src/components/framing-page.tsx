"use client";

import { Button } from "@koklo/ui";
import { type FramingModel, useFramingPage } from "../lib/use-framing-page.ts";
import { ProjectNotFound } from "./features-empty.tsx";
import { FramingBriefStep } from "./framing-brief-step.tsx";
import { FramingHeader } from "./framing-header.tsx";
import { FramingIdeaStep } from "./framing-idea-step.tsx";
import { FramingDraftBanner, FramingForbidden, SpecNotice } from "./framing-notices.tsx";
import { FramingProposalsStep } from "./framing-proposals.tsx";
import { FramingSkeleton } from "./framing-skeleton.tsx";

function Workspace({ page }: { page: FramingModel }) {
  const { state, view } = page;
  return (
    <>
      <FramingDraftBanner page={page} />
      <SpecNotice page={page} />
      <FramingIdeaStep page={page} />
      {state.brief !== null ? <FramingBriefStep page={page} /> : null}
      {state.proposals.length > 0 || view.emptyResult ? <FramingProposalsStep page={page} /> : null}
    </>
  );
}

function Body({ page }: { page: FramingModel }) {
  switch (page.gate) {
    case "loading":
      return <FramingSkeleton />;
    case "not-found":
      return <ProjectNotFound />;
    case "forbidden":
      return <FramingForbidden projectId={page.projectId} />;
    case "ready":
      return <Workspace page={page} />;
  }
}

/** Écran de cadrage assisté d'un projet (design/screens/S-framing.md) : idée, brief, propositions, enregistrement. */
export function FramingPage({ projectId }: { projectId: string }) {
  const page = useFramingPage(projectId);
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-6">
      <FramingHeader projectId={projectId} name={page.access.projectName} />
      <div
        // Une seule région d'état dans le document : avancement, annonces et confirmations.
        role="status"
        aria-live="polite"
        aria-busy={page.gate === "loading" || undefined}
        className="text-[13px] text-muted-foreground empty:hidden"
      >
        {page.regionText}
      </div>
      {page.save.written ? (
        <Button asChild variant="outline" className="h-11 w-full md:h-9 md:w-auto md:self-start">
          <a href={`/projects/${projectId}/features`}>Voir la liste</a>
        </Button>
      ) : null}
      <Body page={page} />
    </div>
  );
}
