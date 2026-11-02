import { Button } from "@koklo/ui";
import { useEffect, useRef } from "react";
import { priorityLabel } from "../lib/feature-labels.ts";
import { proposalCardId } from "../lib/framing-ids.ts";
import type { FramingProposal } from "../lib/framing-types.ts";
import { useCardEdit } from "../lib/use-framing-card-edit.ts";
import type { ProposalActions } from "../lib/use-framing-proposals.ts";
import {
  AiBadge,
  Criteria,
  Description,
  Duplicate,
  StatusBadge,
} from "./framing-proposal-parts.tsx";
import { ProposalEditor } from "./proposal-editor.tsx";

interface Props {
  projectId: string;
  proposal: FramingProposal;
  actions: ProposalActions;
  /** Un enregistrement est en cours : aucune action possible. */
  locked: boolean;
  announce: (text: string) => void;
}

type CardEdit = ReturnType<typeof useCardEdit>;

/**
 * Actions de la carte (S-framing §3.5) : le bouton cliqué devient « Reprendre » et garde le focus (même élément).
 * « Modifier » disparaît pendant l'édition et reprend le focus à sa fermeture.
 */
function Actions({
  proposal,
  actions,
  locked,
  card,
}: Omit<Props, "projectId" | "announce"> & { card: CardEdit }) {
  const { status } = proposal;
  const modify = useRef<HTMLButtonElement>(null);
  const { returned } = card;
  useEffect(() => {
    if (returned > 0) modify.current?.focus();
  }, [returned]);
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button
          type="button"
          className="h-11 md:h-9"
          disabled={locked}
          onClick={status === "accepted" ? () => actions.resume(proposal) : card.tryAccept}
        >
          {status === "accepted" ? "Reprendre" : "Accepter"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-9"
          disabled={locked}
          onClick={() => {
            if (status === "rejected") actions.resume(proposal);
            else actions.reject(proposal);
            if (card.edit) card.close();
          }}
        >
          {status === "rejected" ? "Reprendre" : "Rejeter"}
        </Button>
      </div>
      {card.edit ? null : (
        <Button
          ref={modify}
          type="button"
          variant="ghost"
          className="h-11 md:h-9"
          disabled={locked}
          onClick={card.open}
        >
          Modifier
        </Button>
      )}
    </div>
  );
}

/** Une proposition de l'IA : texte brut, statut, actions Accepter / Rejeter / Modifier et édition sur place. */
export function FramingProposalCard({ projectId, proposal, actions, locked, announce }: Props) {
  const { value, status } = proposal;
  const card = useCardEdit(proposal, actions);
  return (
    <li
      id={proposalCardId(proposal.id)}
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground outline-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold">
          {value.title || "Sans titre"}
        </h3>
        <StatusBadge status={status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span>{priorityLabel(value.priority)}</span>
        <AiBadge />
      </div>
      {proposal.duplicateOf ? (
        <Duplicate projectId={projectId} specId={proposal.duplicateOf} />
      ) : null}
      {card.edit ? (
        <ProposalEditor
          proposalId={proposal.id}
          values={card.edit}
          onChange={card.setEdit}
          issues={card.issues}
          announce={announce}
          onFinish={card.finish}
          onCancel={card.revert}
        />
      ) : (
        <>
          <Description text={value.description} />
          <Criteria criteria={value.criteria} />
        </>
      )}
      <Actions proposal={proposal} actions={actions} locked={locked} card={card} />
    </li>
  );
}
