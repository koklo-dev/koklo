"use client";

import { useMemo } from "react";
import { statusChangeText } from "./framing-labels.ts";
import type { FramingProposal, ProposalStatus, ProposedFeature } from "./framing-types.ts";
import { isValidProposal } from "./framing-validation.ts";
import type { Change, FramingPatch } from "./use-framing-state.ts";
import type { ViewModel } from "./use-framing-view.ts";

const replaceIn = (
  list: FramingProposal[],
  id: string,
  next: (proposal: FramingProposal) => FramingProposal,
): FramingProposal[] => list.map((proposal) => (proposal.id === id ? next(proposal) : proposal));

/** Compteurs de la barre d'enregistrement : seules les acceptées valides comptent. */
function summarize(proposals: FramingProposal[]) {
  const accepted = proposals.filter(
    (proposal) => proposal.status === "accepted" && isValidProposal(proposal.value),
  );
  return {
    accepted,
    rejected: proposals.filter((proposal) => proposal.status === "rejected").length,
    allDuplicates: proposals.length > 0 && proposals.every((proposal) => proposal.duplicateOf),
  };
}

/** Succès de l'enregistrement : les acceptées sont retirées, les rejetées jetées, les « À relire » gardées. */
export const afterSave = (proposals: FramingProposal[]): FramingProposal[] =>
  proposals.filter((proposal) => proposal.status === "to_review");

/**
 * Changements d'état d'une proposition (S-framing §3.5) : rien n'est accepté par défaut ; chaque changement est
 * annoncé dans la région d'état. La valeur éditée est toujours celle qu'on enregistre.
 */
export function useFramingProposals(proposals: FramingProposal[], change: Change, view: ViewModel) {
  const summary = useMemo(() => summarize(proposals), [proposals]);
  const update = (id: string, next: (proposal: FramingProposal) => FramingProposal) =>
    change((current): FramingPatch => ({ proposals: replaceIn(current.proposals, id, next) }));

  const setStatus = (
    proposal: FramingProposal,
    status: ProposalStatus,
    value?: ProposedFeature,
  ) => {
    update(proposal.id, (current) => ({ ...current, status, value: value ?? current.value }));
    const text = { accepted: "acceptée", rejected: "rejetée" } as const;
    if (status !== "to_review") {
      view.patch({ notice: statusChangeText((value ?? proposal.value).title, text[status]) });
    } else view.patch({ notice: "" });
  };

  return {
    ...summary,
    accept: (proposal: FramingProposal, value?: ProposedFeature) =>
      setStatus(proposal, "accepted", value),
    reject: (proposal: FramingProposal) => setStatus(proposal, "rejected"),
    resume: (proposal: FramingProposal) => setStatus(proposal, "to_review"),
    /** « Terminer la modification » : la valeur éditée remplace l'actuelle ; une proposition devenue invalide repasse à relire. */
    edit: (proposal: FramingProposal, value: ProposedFeature) =>
      update(proposal.id, (current) => ({
        ...current,
        value,
        status:
          current.status === "accepted" && !isValidProposal(value) ? "to_review" : current.status,
      })),
  };
}

export type ProposalActions = ReturnType<typeof useFramingProposals>;
