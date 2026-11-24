"use client";

import { ProposalReviewBanner } from "@koklo/ui";
import { SAVE_FAILURE_SUFFIX } from "../lib/proposal-labels.ts";
import { useProposalActions } from "../lib/use-proposal-actions.ts";
import { useProposalReview } from "../lib/use-proposal-review.ts";
import type { useProposals } from "../lib/use-proposals.ts";
import { ProposeDialog } from "./features-propose.tsx";
import { dataSummary, FeaturesReview, saveProp } from "./features-review.tsx";

const SUBTITLE = "Modèle de données, d'après le cahier fonctionnel";
const PLACEHOLDER = "ex. « ajoute l'historique des prix des prestations »";

/** Relecture : en bandes pleine largeur sous les onglets (maquette 11 l.112-158), sans le cadre de page. */
export function DataReviewView({
  projectId,
  branch,
  propose,
  onLeave,
}: {
  projectId: string;
  branch: string | undefined;
  propose: ReturnType<typeof useProposals>;
  onLeave: () => void;
}) {
  return (
    <>
      <FeaturesReview projectId={projectId} branch={branch} tab="data" onLeave={onLeave} />
      {propose.enabled ? (
        <ProposeDialog launch={propose.launch} subtitle={SUBTITLE} placeholder={PLACEHOLDER} />
      ) : null}
    </>
  );
}

/**
 * Bandeau de la relecture sur les onglets Diagramme, Tables et Jeux d'exemple (09 §3.3) : le décompte, « Enregistrer N
 * dans la spec » et « Quitter la relecture » restent à portée pendant qu'on lit le modèle proposé.
 */
export function DataReviewBar({
  projectId,
  branch,
  statusText,
  onLeave,
}: {
  projectId: string;
  branch: string | undefined;
  /** Texte d'état de la page (chargement, écriture) : la région d'état du bandeau est la seule de la vue. */
  statusText: string;
  onLeave: () => void;
}) {
  const review = useProposalReview(projectId, true, "data");
  const actions = useProposalActions(projectId, review, branch);
  const { counts } = review;
  if (counts.total === 0) return null;
  return (
    <div>
      <ProposalReviewBanner
        counts={counts}
        {...saveProp(review, actions)}
        saving={actions.saving}
        saveProgress={actions.saveProgress}
        onLeave={onLeave}
        summaryText={`${dataSummary(counts)}${review.saveFailure ? SAVE_FAILURE_SUFFIX : ""}`}
      />
      <div role="status" className="sr-only">
        {[actions.announcement || actions.summary, statusText].filter(Boolean).join(" ")}
      </div>
    </div>
  );
}
