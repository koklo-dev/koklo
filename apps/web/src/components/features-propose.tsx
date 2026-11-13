"use client";

import { PROPOSAL_INSTRUCTION_MAX } from "@koklo/contract";
import { AgentProposeButton, AgentProposePopover, InlineAlert } from "@koklo/ui";
import { NO_ACCESS } from "../lib/proposal-labels.ts";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import type { ProposalLaunch } from "../lib/use-proposal-launch.ts";
import { AiErrorNotice } from "./ai-error-notice.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const SUBTITLE = "Cahier fonctionnel, d'après le dossier d'idée figé";

/**
 * Bouton unique « Proposer avec l'agent » : `idle` ouvre la modale, `ready` ouvre la relecture sans modale,
 * `running` et `unavailable` ne lancent rien. Jamais de lancement direct.
 */
export function ProposeButton({
  launch,
  readyCount,
  onReview,
  className,
  idleLabel,
}: {
  launch: ProposalLaunch;
  readyCount: number;
  onReview: () => void;
  className?: string;
  idleLabel?: string;
}) {
  const { role } = useActiveOrganization();
  return (
    <AgentProposeButton
      state={launch.state}
      readyCount={readyCount}
      {...(launch.reason ? { reason: launch.reason } : {})}
      {...(canManage(role) ? { settingsHref: "/settings/ai" } : {})}
      className={className}
      {...(idleLabel ? { idleLabel } : {})}
      onClick={() => (launch.state === "ready" ? onReview() : launch.setOpen(true))}
    />
  );
}

/** Notices de la modale : lancement déjà en cours, échec du lancement (traduit, compte à rebours) ou des options. */
function Notices({ launch }: { launch: ProposalLaunch }) {
  const { call } = launch;
  const failure = call.error;
  return (
    <>
      {launch.notice ? (
        <InlineAlert variant="neutral" icon="schedule">
          {launch.notice}
        </InlineAlert>
      ) : null}
      {launch.optionsError ? (
        <ErrorNotice onRetry={launch.retryOptions}>
          Impossible de lire les choix de l'agent.
        </ErrorNotice>
      ) : null}
      {failure?.kind === "forbidden" ? <ErrorNotice>{NO_ACCESS}</ErrorNotice> : null}
      {failure && failure.kind !== "forbidden" ? (
        <AiErrorNotice view={failure} remaining={call.remaining} onRetry={launch.launch} />
      ) : null}
      <span role="status" className="sr-only">
        {call.announcement}
      </span>
    </>
  );
}

const INSTRUCTION_PLACEHOLDER =
  "ex. « Se concentrer sur la réservation, laisser de côté la facturation. »";

/** Modale de lancement : une seule instance par page, ouverte par l'état partagé du modèle. */
export function ProposeDialog({
  launch,
  subtitle = SUBTITLE,
  placeholder = INSTRUCTION_PLACEHOLDER,
}: {
  launch: ProposalLaunch;
  /** Livrable proposé : le cahier fonctionnel par défaut. */
  subtitle?: string;
  placeholder?: string;
}) {
  return (
    <AgentProposePopover
      open={launch.open}
      onOpenChange={launch.setOpen}
      subtitle={subtitle}
      options={launch.choices}
      value={launch.value ?? ""}
      onValueChange={launch.setChoice}
      instruction={launch.instruction}
      onInstructionChange={launch.setInstruction}
      instructionMax={PROPOSAL_INSTRUCTION_MAX}
      instructionPlaceholder={placeholder}
      reads={launch.reads}
      onLaunch={launch.launch}
      loading={launch.optionsLoading}
      launchDisabled={!launch.value || launch.call.waiting || launch.call.pending !== null}
      notice={<Notices launch={launch} />}
    />
  );
}
