"use client";

import type { ProposalListOutput } from "@koklo/contract";
import { InlineAlert, ProposalReviewBanner } from "@koklo/ui";
import { CHECKS_NOTE, CHECKS_TITLE } from "../lib/architecture-labels.ts";
import { launchReportOf } from "../lib/launch-report.ts";
import { SAVE_FAILURE_SUFFIX } from "../lib/proposal-labels.ts";
import { useProposalActions } from "../lib/use-proposal-actions.ts";
import { useProposalReview } from "../lib/use-proposal-review.ts";
import type { useProposals } from "../lib/use-proposals.ts";
import { ProposeDialog } from "./features-propose.tsx";
import { architectureSummary, FeaturesReview, saveProp } from "./features-review.tsx";

const SUBTITLE = "Architecture, d'après le cahier fonctionnel et le modèle de données";
const PLACEHOLDER = "ex. « sépare l'envoi des SMS dans un service à part »";

interface Warning {
  code: string;
  entityId: string;
  message: string;
}

/** Avertissements d'architecture (B511) : visibles pendant la relecture, jamais bloquants. */
export function ArchitectureWarnings({ warnings }: { warnings: readonly Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mx-4 mt-4 md:mx-7">
      <InlineAlert variant="warning" icon="warning">
        <p className="font-semibold">
          {CHECKS_TITLE} · {warnings.length} · {CHECKS_NOTE}
        </p>
        <ul className="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5">
          {warnings.map((warning) => (
            <li key={`${warning.code}:${warning.entityId}:${warning.message}`}>
              {warning.message}
            </li>
          ))}
        </ul>
      </InlineAlert>
    </div>
  );
}

/**
 * Bilan du lancement en relecture (DESIGN §5.25, B619) : `role="note"`, aucune annonce ; neutre si terminé, avertissement
 * sinon. Absent tant que l'agent travaille ou si le lancement n'a pas de bilan.
 */
export function LaunchReport({ launch }: { launch: ProposalListOutput["launch"] | undefined }) {
  const report = launchReportOf(launch);
  if (!report) return null;
  const [summary, ...details] = report.lines;
  return (
    <div className="mx-4 mt-4 md:mx-7">
      <InlineAlert variant={report.variant} icon={report.icon} role="note">
        <p className="font-semibold">{summary}</p>
        {details.map((line) => (
          <p key={line} className="mt-1">
            {line}
          </p>
        ))}
      </InlineAlert>
    </div>
  );
}

/** Relecture : en bandes pleine largeur sous les onglets (maquette 13 l.111-170), sans le cadre de page. */
export function ArchitectureReviewView({
  projectId,
  branch,
  propose,
  warnings,
  onLeave,
}: {
  projectId: string;
  branch: string | undefined;
  propose: ReturnType<typeof useProposals>;
  warnings: readonly Warning[];
  onLeave: () => void;
}) {
  return (
    <>
      <FeaturesReview
        projectId={projectId}
        branch={branch}
        tab="architecture"
        notice={
          <>
            <LaunchReport launch={propose.status.launch} />
            <ArchitectureWarnings warnings={warnings} />
          </>
        }
        onLeave={onLeave}
      />
      {propose.enabled ? (
        <ProposeDialog launch={propose.launch} subtitle={SUBTITLE} placeholder={PLACEHOLDER} />
      ) : null}
    </>
  );
}

/**
 * Bandeau de la relecture sur les onglets Document et Composants (09 §3.3) : le décompte, « Enregistrer N dans la
 * spec » et « Quitter la relecture » restent à portée pendant qu'on lit l'architecture proposée.
 */
export function ArchitectureReviewBar({
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
  const review = useProposalReview(projectId, true, "architecture");
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
        summaryText={`${architectureSummary(counts)}${review.saveFailure ? SAVE_FAILURE_SUFFIX : ""}`}
      />
      <div role="status" className="sr-only">
        {[actions.announcement || actions.summary, statusText].filter(Boolean).join(" ")}
      </div>
    </div>
  );
}
