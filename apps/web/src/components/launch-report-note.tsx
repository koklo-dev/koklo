"use client";

import type { ProposalListOutput } from "@koklo/contract";
import { InlineAlert } from "@koklo/ui";
import {
  emptyReportOf,
  type LaunchReportView,
  launchReportOf,
  type ReportUnit,
} from "../lib/launch-report.ts";
import type { useProposals } from "../lib/use-proposals.ts";

/** Bilan d'un lancement (DESIGN §5.25) : `role="note"`, aucune annonce ; les noms d'étapes passent à la ligne. */
function Note({ report }: { report: LaunchReportView }) {
  const [summary, ...details] = report.lines;
  return (
    <InlineAlert variant={report.variant} icon={report.icon} role="note" className="break-words">
      <p className="font-semibold">{summary}</p>
      {details.map((line) => (
        <p key={line} className="mt-1">
          {line}
        </p>
      ))}
    </InlineAlert>
  );
}

/**
 * Bilan en relecture, au-dessus des groupes (B619) : neutre si terminé, avertissement sinon. Absent tant que l'agent
 * travaille ou si le lancement n'a pas de bilan.
 */
export function LaunchReport({
  launch,
  unit,
}: {
  launch: ProposalListOutput["launch"] | undefined;
  unit?: ReportUnit;
}) {
  const report = launchReportOf(launch, unit);
  if (!report) return null;
  return (
    <div className="mx-4 mt-4 md:mx-7">
      <Note report={report} />
    </div>
  );
}

/**
 * Bilan du Technique et de la Sécurité quand plus rien n'est à relire (état vide ou « Prêt », B850) : seulement pour qui
 * peut proposer.
 */
export function SettledLaunchReport({ propose }: { propose: ReturnType<typeof useProposals> }) {
  const { enabled, status } = propose;
  const report = enabled && status.counts.pending === 0 ? emptyReportOf(status.launch) : null;
  return report ? <Note report={report} /> : null;
}
