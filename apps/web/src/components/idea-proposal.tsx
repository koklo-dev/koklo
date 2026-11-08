"use client";

import type { IdeaPage, IdeaProposal as Proposal } from "@koklo/contract";
import { ProposalDiff, Textarea } from "@koklo/ui";
import { useEffect, useRef, useState } from "react";
import type { IdeaProposalDecisions } from "../lib/use-idea-proposals.ts";
import { ProposalText } from "./idea-proposal-text.tsx";

/** Anciens blocs d'un remplacement : le Markdown est découpé en blocs séparés par une ligne vide. */
function replacedText(page: IdeaPage, proposal: Proposal): string {
  const blocks = page.contentMd.split(/\n{2,}/);
  const from = proposal.anchorBlockIndex ?? 0;
  const to = proposal.rangeEnd ?? from;
  return blocks.slice(from, to + 1).join("\n\n");
}

export interface IdeaProposalProps {
  proposal: Proposal;
  page: IdeaPage;
  decisions: IdeaProposalDecisions;
  stale: boolean;
  index: number;
  total: number;
  onNavigate: (index: number) => void;
  onAskAgain?: () => void;
}

/** Une proposition sur place : texte littéral, Modifier ouvre un champ de texte brut, jamais un lien actif. */
export function IdeaProposal({
  proposal,
  page,
  decisions,
  stale,
  index,
  total,
  onNavigate,
  onAskAgain,
}: IdeaProposalProps) {
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // « Modifier » ouvre le champ : le focus y va (WCAG 2.4.3). Échap le referme et rend le focus à « Modifier ».
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  const [draft, setDraft] = useState(proposal.contentMd);
  const op = proposal.op === "create_page" ? "append" : proposal.op;
  const isStale = stale || proposal.status === "stale";
  return (
    <ProposalDiff
      op={op}
      rationale={proposal.rationale}
      previous={
        op === "replace" ? <ProposalText markdown={replacedText(page, proposal)} /> : undefined
      }
      stale={isStale}
      busy={decisions.busyId === proposal.id}
      position={total > 1 ? { index, total, onNavigate } : undefined}
      onAskAgain={onAskAgain}
      onEdit={() => setEditing((open) => !open)}
      onReject={() => void decisions.decide(proposal, "reject")}
      onAccept={() => void decisions.decide(proposal, "accept", editing ? draft : undefined)}
    >
      {editing && !isStale ? (
        <Textarea
          mono
          ref={field}
          aria-label="Texte de la proposition"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            const frame = event.currentTarget.closest("section");
            setEditing(false);
            const edit = [...(frame?.querySelectorAll("button") ?? [])].find(
              (b) => b.textContent?.trim() === "Modifier",
            );
            edit?.focus();
          }}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={Math.min(12, draft.split("\n").length + 1)}
        />
      ) : (
        <ProposalText markdown={proposal.contentMd} />
      )}
    </ProposalDiff>
  );
}
