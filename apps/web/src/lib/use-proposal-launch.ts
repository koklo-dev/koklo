"use client";

import { PROPOSAL_INSTRUCTION_MAX } from "@koklo/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import {
  DELIVERABLE,
  MODE_TEXTS,
  optionCountLabel,
  UNAVAILABLE_REASONS,
} from "./proposal-labels.ts";
import { useAiCall } from "./use-ai-call.ts";
import type { ProposalCounts } from "./use-proposal-status.ts";

export type ProposeState = "idle" | "open" | "running" | "ready" | "unavailable";
type Mode = "complete" | "criteria" | "update" | "all";

const IN_PROGRESS_TEXT = "Une génération est déjà en cours pour ce livrable.";

/** Choix de la modale, dans l'ordre du serveur ; une option à compte nul n'est jamais montrée. */
function useLaunchOptions(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.ai.proposeOptions.queryOptions({ input: { projectId, deliverable: DELIVERABLE } }),
    enabled,
  });
  const data = query.data;
  const choices = (data?.options ?? [])
    .filter((option) => option.count !== 0)
    .map((option) => ({
      id: option.id,
      title: MODE_TEXTS[option.id]?.title ?? option.id,
      description: MODE_TEXTS[option.id]?.description,
      ...(option.count !== undefined
        ? { count: option.count, countLabel: optionCountLabel(option.id, option.count) }
        : {}),
    }));
  return {
    choices,
    reads: (data?.reads ?? []).map((read) => read.label),
    available: data?.available !== false,
    reason: data?.reason ? UNAVAILABLE_REASONS[data.reason] : undefined,
    loading: query.isPending && enabled,
    failed: query.isError,
    retry: () => void query.refetch(),
  };
}

/** Lancement : un 409 `PROPOSAL_IN_PROGRESS` n'est pas une erreur (bouton « en cours » et avis), le reste passe par `useAiCall`. */
function useLaunchCall(projectId: string, onLaunched: () => void, onClose: () => void) {
  const queryClient = useQueryClient();
  const call = useAiCall();
  const mutation = useMutation(orpc.ai.proposeDeliverable.mutationOptions());
  const [notice, setNotice] = useState("");
  const [inProgress, setInProgress] = useState(false);
  const launch = (mode: string, instruction: string) => {
    setNotice("");
    const trimmed = instruction.trim();
    call.run(
      "propose",
      () =>
        mutation
          .mutateAsync({
            projectId,
            deliverable: DELIVERABLE,
            mode: mode as Mode,
            ...(trimmed ? { instruction: trimmed.slice(0, PROPOSAL_INSTRUCTION_MAX) } : {}),
          })
          .catch((error: unknown) => {
            if (errorCode(error) === "PROPOSAL_IN_PROGRESS") return null;
            throw error;
          }),
      (output) => {
        if (output === null) {
          setNotice(IN_PROGRESS_TEXT);
          setInProgress(true);
        }
        onClose();
        void queryClient.invalidateQueries({ queryKey: orpc.proposal.key() });
        // Un 409 n'a rien lancé : la page reste sur la liste, où l'avis et le bouton « en cours » sont visibles.
        if (output !== null) onLaunched();
      },
    );
  };
  return { call, launch, notice, inProgress, clearNotice: () => setNotice(""), setInProgress };
}

/** Le 409 pose « en cours » jusqu'à ce que la lecture ait vu le lancement actif puis terminé. */
function useInProgressRelease(active: boolean, release: () => void) {
  const seen = useRef(false);
  useEffect(() => {
    if (active) seen.current = true;
    else if (seen.current) {
      seen.current = false;
      release();
    }
  }, [active, release]);
}

const stateOf = (flags: {
  open: boolean;
  running: boolean;
  pending: number;
  unavailable: boolean;
}): ProposeState => {
  if (flags.open) return "open";
  if (flags.running) return "running";
  if (flags.pending > 0) return "ready";
  return flags.unavailable ? "unavailable" : "idle";
};

/**
 * Options du lancement (comptes calculés par le serveur), choix et consigne de la modale, lancement et état du
 * bouton. Jamais de lancement direct : le bouton ouvre la modale, « Lancer » appelle `ai.proposeDeliverable`.
 */
export function useProposalLaunch(
  projectId: string,
  status: { active: boolean; counts: ProposalCounts },
  options: { enabled: boolean; onLaunched: () => void },
) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [keyMissing, setKeyMissing] = useState(false);
  const list = useLaunchOptions(projectId, options.enabled);
  const run = useLaunchCall(projectId, options.onLaunched, () => setOpen(false));
  const { call } = run;
  const value = list.choices.find((c) => c.id === choice)?.id ?? list.choices[0]?.id;
  useInProgressRelease(status.active, () => run.setInProgress(false));
  // L'échec « clé absente » (code déjà traduit par ai-errors) rend le bouton indisponible pour la session.
  const missing = call.error?.kind === "not_configured";
  useEffect(() => {
    if (missing) setKeyMissing(true);
  }, [missing]);

  return {
    state: stateOf({
      open,
      running: status.active || run.inProgress,
      pending: status.counts.pending,
      unavailable: !list.available || keyMissing,
    }),
    reason: keyMissing ? UNAVAILABLE_REASONS.not_configured : list.reason,
    open,
    setOpen: (next: boolean) => {
      setOpen(next);
      if (next) {
        run.clearNotice();
        call.clear();
      }
    },
    choices: list.choices,
    value,
    setChoice,
    instruction,
    setInstruction,
    reads: list.reads,
    optionsLoading: list.loading,
    optionsError: list.failed,
    retryOptions: list.retry,
    launch: () => {
      if (value && !status.active) run.launch(value, instruction);
    },
    call,
    notice: run.notice,
  };
}

export type ProposalLaunch = ReturnType<typeof useProposalLaunch>;
