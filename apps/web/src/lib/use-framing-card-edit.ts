"use client";

import { useEffect, useState } from "react";
import { proposalFieldId } from "./framing-ids.ts";
import type { FramingProposal } from "./framing-types.ts";
import {
  type EditValues,
  fromEditValues,
  toEditValues,
  validateEdit,
} from "./framing-validation.ts";
import type { ProposalActions } from "./use-framing-proposals.ts";

/**
 * Édition locale d'une carte (S-framing §3.5) : valeurs en cours, erreurs montrées après une tentative
 * d'acceptation refusée (le focus va au premier champ en erreur) et focus rendu à « Modifier » à la fermeture.
 */
export function useCardEdit(proposal: FramingProposal, actions: ProposalActions) {
  const [edit, setEdit] = useState<EditValues | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [returned, setReturned] = useState(0);
  const issues = edit && attempt > 0 ? validateEdit(edit) : [];
  const first = issues[0]?.field;
  // biome-ignore lint/correctness/useExhaustiveDependencies: le focus suit chaque tentative refusée
  useEffect(() => {
    if (attempt > 0 && first) document.getElementById(proposalFieldId(proposal.id, first))?.focus();
  }, [attempt]);

  const close = () => {
    setEdit(null);
    setAttempt(0);
    setReturned((n) => n + 1);
  };
  return {
    edit,
    issues,
    /** Nombre de fermetures : le bouton « Modifier » reprend le focus à chaque changement. */
    returned,
    setEdit,
    open: () => setEdit(toEditValues(proposal.value)),
    /** Accepter une proposition invalide ouvre l'édition et montre les erreurs, sans l'accepter. */
    tryAccept: () => {
      const values = edit ?? toEditValues(proposal.value);
      if (validateEdit(values).length > 0) {
        setEdit(values);
        setAttempt((n) => n + 1);
        return;
      }
      setEdit(null);
      setAttempt(0);
      actions.accept(proposal, fromEditValues(values));
    },
    finish: () => {
      if (edit) actions.edit(proposal, fromEditValues(edit));
      close();
    },
    revert: () => {
      actions.edit(proposal, proposal.original);
      close();
    },
    close,
  };
}
