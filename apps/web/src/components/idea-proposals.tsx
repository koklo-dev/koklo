"use client";

import type { IdeaPage, IdeaProposal as Proposal } from "@koklo/contract";
import { DecisionNotice, InlineAlert } from "@koklo/ui";
import { type ReactNode, useCallback, useMemo } from "react";
import { editorOf, focusWhenReady, undoButtonOf } from "../lib/idea-focus.ts";
import type { ProposalSlot } from "../lib/idea-proposal-slots.ts";
import type { IdeaProposalDecisions } from "../lib/use-idea-proposals.ts";
import { IdeaProposal } from "./idea-proposal.tsx";

const blockOf = (proposal: Proposal): number =>
  proposal.op === "append"
    ? Number.MAX_SAFE_INTEGER
    : (proposal.rangeEnd ?? proposal.anchorBlockIndex ?? 0);

/** Propositions de contenu de la page ouverte (celles d'une nouvelle page vivent dans l'arborescence). */
export function pageProposals(proposals: Proposal[]): Proposal[] {
  return proposals
    .filter((p) => p.op !== "create_page" && (p.status === "pending" || p.status === "stale"))
    .sort((a, b) => blockOf(a) - blockOf(b));
}

interface Props {
  proposals: Proposal[];
  page: IdeaPage;
  decisions: IdeaProposalDecisions;
  /** La page a été modifiée pendant la session : le serveur a périmé les propositions. */
  stale: boolean;
  onAskAgain?: (proposal: Proposal) => void;
  children: (slots: ProposalSlot[], renderSlot: (id: string) => ReactNode) => ReactNode;
}

const frameOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-proposal-slot="${id}"] section`);

function focusProposal(id: string) {
  focusWhenReady(() => frameOf(id));
}

/**
 * Après une décision, le cadre décidé disparaît et le focus tomberait sur <body> (WCAG 2.4.3) : il va au bouton
 * « Annuler » de la trace, sinon à la proposition voisine, sinon à l'éditeur.
 */
function focusAfterDecision(
  proposalId: string,
  neighbourId: string | undefined,
  undoable: boolean,
) {
  focusWhenReady(() => {
    if (frameOf(proposalId)) return null; // la relecture n'a pas encore retiré le cadre
    const undo = undoable ? undoButtonOf(proposalId) : null;
    return undo ?? (neighbourId ? frameOf(neighbourId) : null) ?? editorOf();
  });
}

/** Éditeur + propositions sur place + traces de décision (« acceptée par vous », Annuler) + erreur. */
export function IdeaProposals({ proposals, page, decisions, stale, onAskAgain, children }: Props) {
  const shown = useMemo(() => pageProposals(proposals), [proposals]);
  const slots = useMemo(() => shown.map((p) => ({ id: p.id, blockIndex: blockOf(p) })), [shown]);
  const renderSlot = useCallback(
    (id: string) => {
      const index = shown.findIndex((p) => p.id === id);
      const proposal = shown[index];
      if (!proposal) return null;
      const neighbour = (shown[index + 1] ?? shown[index - 1])?.id;
      const withFocus: IdeaProposalDecisions = {
        ...decisions,
        decide: async (target, decision, contentMd) => {
          const done = await decisions.decide(target, decision, contentMd);
          if (done)
            focusAfterDecision(
              target.id,
              neighbour,
              target.op !== "create_page" || decision === "reject",
            );
          return done;
        },
      };
      return (
        <IdeaProposal
          proposal={proposal}
          page={page}
          decisions={withFocus}
          stale={stale}
          index={index}
          total={shown.length}
          onNavigate={(next) => focusProposal(shown[next]?.id ?? id)}
          onAskAgain={onAskAgain ? () => onAskAgain(proposal) : undefined}
        />
      );
    },
    [shown, page, decisions, stale, onAskAgain],
  );
  const notices = decisions.notices.filter((n) => n.pageId === page.id);
  return (
    <>
      {children(slots, renderSlot)}
      {decisions.error ? (
        <InlineAlert variant="warning" icon="warning">
          {decisions.error}
        </InlineAlert>
      ) : null}
      {notices.map((notice) => (
        <DecisionNotice
          key={notice.proposalId}
          data-notice-id={notice.proposalId}
          onUndo={
            notice.undoable
              ? () => void decisions.undo(notice).then(() => focusProposal(notice.proposalId))
              : undefined
          }
        >
          {notice.text}
        </DecisionNotice>
      ))}
    </>
  );
}
