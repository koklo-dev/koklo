"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";
import { DELIVERABLE } from "./proposal-labels.ts";
import type { ProposalGroupOutput, ProposalListOutput } from "./proposal-types.ts";

/** Rythme de lecture tant que le lancement tourne : le serveur n'expose pas de flux (B319 f). */
export const PROPOSAL_POLL_MS = 2000;
const ACTIVE = ["queued", "running"];

export const isActiveLaunch = (status: string | undefined): boolean =>
  status !== undefined && ACTIVE.includes(status);

export interface ProposalCounts {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
}

export function countsOf(groups: readonly ProposalGroupOutput[]): ProposalCounts {
  const sum = (pick: (group: ProposalGroupOutput) => number) =>
    groups.reduce((total, group) => total + pick(group), 0);
  return {
    total: sum((g) => g.total),
    accepted: sum((g) => g.accepted),
    rejected: sum((g) => g.rejected),
    pending: sum((g) => g.pending),
  };
}

/** Entrée de `proposal.list` du dernier lancement ; `status` et `group` ne servent qu'aux lectures de la relecture. */
export const listInput = (
  projectId: string,
  over: { status?: "pending" | "all"; group?: string; limit: number; cursor?: string },
) => ({ projectId, deliverable: DELIVERABLE, groupBy: "type_zone" as const, ...over });

/**
 * Dernier lancement et comptes par groupe (une seule ligne lue) : sonde toutes les 2 s tant que le lancement est
 * en file ou en cours, s'arrête à `done`, `failed` et `canceled`.
 */
export function useProposalStatus(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.proposal.list.queryOptions({
      input: listInput(projectId, { status: "all", limit: 1 }),
      refetchInterval: (state: { state: { data?: ProposalListOutput } }) =>
        isActiveLaunch(state.state.data?.launch?.status) ? PROPOSAL_POLL_MS : false,
    }),
    enabled,
  });
  const groups = query.data?.groups ?? [];
  return {
    query,
    launch: query.data?.launch ?? null,
    groups,
    counts: countsOf(groups),
    active: isActiveLaunch(query.data?.launch?.status),
    loaded: query.data !== undefined,
  };
}
