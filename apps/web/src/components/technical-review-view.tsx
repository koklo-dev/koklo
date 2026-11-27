"use client";

import {
  TECHNICAL_DIALOG_PLACEHOLDER,
  TECHNICAL_DIALOG_SUBTITLE,
} from "../lib/technical-labels.ts";
import type { TechnicalPageModel } from "../lib/use-technical-page.ts";
import { ArchitectureReviewBar } from "./architecture-review-view.tsx";
import { ProposeDialog } from "./features-propose.tsx";
import { FeaturesReview, technicalSummary } from "./features-review.tsx";
import { LaunchReport } from "./launch-report-note.tsx";

/** Fenêtre « Proposer avec l'agent » du cahier technique : une seule instance par vue. */
export function TechnicalProposeDialog({ page }: { page: TechnicalPageModel }) {
  if (!page.propose.enabled) return null;
  return (
    <ProposeDialog
      launch={page.propose.launch}
      subtitle={TECHNICAL_DIALOG_SUBTITLE}
      placeholder={TECHNICAL_DIALOG_PLACEHOLDER}
    />
  );
}

/** Relecture : en bandes pleine largeur sous les onglets (maquette 14 l.111-170). */
export function TechnicalReviewView({ page }: { page: TechnicalPageModel }) {
  return (
    <>
      <FeaturesReview
        projectId={page.projectId}
        branch={page.head?.branch}
        tab="technical"
        notice={<LaunchReport launch={page.propose.status.launch} unit="étapes" />}
        onLeave={page.url.closeReview}
      />
      <TechnicalProposeDialog page={page} />
    </>
  );
}

/** Bandeau de la relecture sur les onglets Stack, Environnements et Document. */
export function TechnicalReviewBar({ page }: { page: TechnicalPageModel }) {
  return (
    <ArchitectureReviewBar
      projectId={page.projectId}
      branch={page.head?.branch}
      statusText={page.statusText}
      onLeave={page.url.closeReview}
      tab="technical"
      summaryOf={technicalSummary}
    />
  );
}
