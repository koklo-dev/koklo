"use client";

import type { ProposalDecision } from "@koklo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type AiErrorView, describeAiError } from "./ai-errors.ts";
import { conflictReason, errorCode, errorData } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import {
  ADDED_TEXT,
  ARRIVED_TEXT,
  GROUP_CHANGED_TEXT,
  refOf,
  SAVED_TEXT,
} from "./proposal-labels.ts";
import type { ProposalOutput } from "./proposal-types.ts";
import type { ProposalReviewModel } from "./use-proposal-review.ts";
import { useProposalSave } from "./use-proposal-save.ts";

const DECISION = { accepted: "accept", rejected: "reject", pending: "reset" } as const;
const DECISION_TEXT = {
  accepted: "acceptée",
  rejected: "rejetée",
  pending: "remise à relire",
} as const;
const APPLIED_TEXT =
  "Cette proposition est déjà enregistrée dans la spec : elle n'est plus modifiable.";

/** Annonces polies de l'arrivée des propositions : « 12 propositions arrivées », puis « 5 de plus arrivées · 17 au total ». */
function useArrivals(review: ProposalReviewModel, announce: (text: string) => void) {
  const { total } = review.counts;
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = total;
    if (!review.active || total === 0 || before === total) return;
    announce(before ? ADDED_TEXT(total - before, total) : ARRIVED_TEXT(total));
  }, [total, review.active, announce]);
}

/** Sélection : la proposition choisie, sinon la première à relire (puis la première tout court). */
function useSelection(review: ProposalReviewModel) {
  const [chosen, setChosen] = useState<string | undefined>();
  const all = review.groups.flatMap((group) => group.items);
  const selectedId =
    chosen && all.some((item) => item.id === chosen)
      ? chosen
      : (all.find((item) => item.status === "pending") ?? all[0])?.id;
  return { selectedId, select: setChosen };
}

interface Deps {
  projectId: string;
  review: ProposalReviewModel;
  announce: (text: string) => void;
  fail: (failure: unknown) => void;
  refresh: () => Promise<void>;
}

/** `proposal.decide` : accepter, rejeter, remettre à relire, ou accepter avec le contenu corrigé (`edited`). */
function useDecide({ projectId, review, announce, fail, refresh }: Deps) {
  const mutation = useMutation(orpc.proposal.decide.mutationOptions());
  return async (id: string, decision: ProposalDecision, edited?: Record<string, unknown>) => {
    try {
      await mutation.mutateAsync({
        projectId,
        proposalId: id,
        decision: DECISION[decision],
        ...(edited ? { edited } : {}),
      });
      const found = review.byId(id);
      announce(`${found ? refOf(found) : "Proposition"} ${DECISION_TEXT[decision]}`);
      await refresh();
    } catch (failure) {
      fail(failure);
    }
  };
}

/** « Accepter les N restantes » d'un groupe : le N affiché part au serveur, qui refuse un N périmé (409). */
function useAcceptGroup({ projectId, review, announce, fail, refresh }: Deps) {
  const mutation = useMutation(orpc.proposal.decideMany.mutationOptions());
  return async (key: string) => {
    const group = review.groups.find((candidate) => candidate.key === key);
    const launchId = review.status.launch?.id;
    if (!group || !launchId || !review.grouped) return;
    try {
      const out = await mutation.mutateAsync({
        projectId,
        launchId,
        group: key,
        decision: "accept",
        expectedPending: group.counts.pending,
      });
      announce(`${out.decided} propositions acceptées dans ${group.label}`);
      await refresh();
    } catch (failure) {
      if (errorCode(failure) !== "PROPOSAL_COUNT_CHANGED") return fail(failure);
      const actual = errorData(failure)?.actual;
      announce(GROUP_CHANGED_TEXT(typeof actual === "number" ? actual : 0));
      await refresh();
    }
  };
}

/** Demande de modification à l'agent : appel synchrone, la proposition reste à relire ; `proposal_applied` est un avis. */
function useRevise({ projectId, announce, refresh }: Deps) {
  const mutation = useMutation(orpc.ai.reviseProposal.mutationOptions());
  const [error, setError] = useState<AiErrorView | null>(null);
  const [busy, setBusy] = useState(false);
  const revise = async (id: string, instruction: string) => {
    setError(null);
    setBusy(true);
    try {
      await mutation.mutateAsync({ projectId, proposalId: id, instruction });
      announce("Proposition révisée par l'agent : relisez-la.");
      await refresh();
    } catch (failure) {
      if (conflictReason(failure) === "proposal_applied") announce(APPLIED_TEXT);
      else setError(describeAiError(failure));
    } finally {
      setBusy(false);
    }
  };
  return { revise, error, busy };
}

/** Enregistrement : le récapitulatif reste affiché, l'annonce le répète dans la région d'état. */
function useSaveAll(
  { projectId, review, announce }: Deps,
  branch: string | undefined,
  clearError: () => void,
) {
  const saver = useProposalSave({ projectId, branch });
  const [summary, setSummary] = useState("");
  const save = async () => {
    const launchId = review.status.launch?.id;
    if (!launchId) return;
    clearError();
    const result = await saver.save(launchId, review.savable);
    if (!result) return;
    const text = SAVED_TEXT(result.saved, result.left);
    setSummary(text);
    announce(text);
  };
  return { save, saving: saver.saving, summary };
}

/**
 * Décisions de la relecture : `proposal.decide`, `proposal.decideMany` (avec le N affiché), révision par l'agent
 * et enregistrement. Chaque action annonce son résultat dans l'unique région d'état de la vue.
 */
export function useProposalActions(
  projectId: string,
  review: ProposalReviewModel,
  branch: string | undefined,
) {
  const queryClient = useQueryClient();
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<unknown>(null);
  const selection = useSelection(review);
  useArrivals(review, setAnnouncement);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.proposal.key() });
  /** Échec d'une action écrite : `proposal_applied` est un avis, le reste une erreur d'écran. */
  const fail = (failure: unknown) => {
    if (conflictReason(failure) === "proposal_applied") setAnnouncement(APPLIED_TEXT);
    else setError(failure);
    void refresh();
  };
  const deps: Deps = { projectId, review, announce: setAnnouncement, fail, refresh };
  const decide = useDecide(deps);
  const acceptGroup = useAcceptGroup(deps);
  const revise = useRevise(deps);
  const saved = useSaveAll(deps, branch, () => setError(null));
  const guarded =
    <A extends unknown[]>(action: (...args: A) => Promise<unknown>) =>
    (...args: A) => {
      setError(null);
      return action(...args);
    };

  return {
    ...selection,
    announcement,
    error,
    reviseError: revise.error,
    reviseBusy: revise.busy,
    summary: saved.summary,
    saving: saved.saving,
    decide: guarded(decide),
    acceptGroup: guarded(acceptGroup),
    revise: revise.revise,
    save: saved.save,
    selected: review.byId(selection.selectedId) as ProposalOutput | undefined,
  };
}
