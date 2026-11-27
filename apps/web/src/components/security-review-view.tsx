"use client";

import { DIALOG_PLACEHOLDER, DIALOG_SUBTITLE } from "../lib/security-labels.ts";
import type { SecurityPageModel } from "../lib/use-security-page.ts";
import { ArchitectureReviewBar } from "./architecture-review-view.tsx";
import { ProposeDialog } from "./features-propose.tsx";
import { FeaturesReview, securitySummary } from "./features-review.tsx";

/** Fenêtre « Proposer avec l'agent » de la sécurité : une seule instance par vue. */
export function SecurityProposeDialog({ page }: { page: SecurityPageModel }) {
  if (!page.propose.enabled) return null;
  return (
    <ProposeDialog
      launch={page.propose.launch}
      subtitle={DIALOG_SUBTITLE}
      placeholder={DIALOG_PLACEHOLDER}
    />
  );
}

/** Relecture : groupes Menaces, Données, Droits, Exigences, Document (maquette 15 l.94-116). */
export function SecurityReviewView({ page }: { page: SecurityPageModel }) {
  return (
    <FeaturesReview
      projectId={page.projectId}
      branch={page.head?.branch}
      tab="security"
      onLeave={page.url.closeReview}
    />
  );
}

/** Bandeau de la relecture sur les autres onglets. */
export function SecurityReviewBar({ page }: { page: SecurityPageModel }) {
  return (
    <ArchitectureReviewBar
      projectId={page.projectId}
      branch={page.head?.branch}
      statusText={page.statusText}
      onLeave={page.url.closeReview}
      tab="security"
      summaryOf={securitySummary}
    />
  );
}
