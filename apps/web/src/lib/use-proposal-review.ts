"use client";

import type { ProposalReviewGroup, ProposalReviewItem } from "@koklo/ui";
import { PROPOSAL_FIRST_PAGE, PROPOSAL_GROUP_THRESHOLD, PROPOSAL_NEXT_PAGE } from "@koklo/ui";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type FeaturesTab, tabOfProposalKind } from "./features-tab.ts";
import { orpc } from "./orpc.ts";
import { refOf, subtitleOf } from "./proposal-labels.ts";
import { isSavable } from "./proposal-operations.ts";
import type { ProposalGroupOutput, ProposalOutput } from "./proposal-types.ts";
import {
  isActiveLaunch,
  listInput,
  PROPOSAL_POLL_MS,
  useProposalStatus,
} from "./use-proposal-status.ts";

export type ReviewFilter = "pending" | "all";
const FLAT_LIMIT = PROPOSAL_GROUP_THRESHOLD;
const BATCH_STALE_MS = 30_000;

/** Lots d'enregistrement échoués parmi ceux des propositions chargées (B320) : leurs propositions restent bloquées. */
function useFailedBatches(projectId: string, proposals: ProposalOutput[]): ReadonlySet<string> {
  const ids = [...new Set(proposals.flatMap((p) => (p.appliedBatchId ? [p.appliedBatchId] : [])))];
  const results = useQueries({
    queries: ids.map((batchId) => ({
      ...orpc.specBatch.get.queryOptions({ input: { projectId, batchId } }),
      staleTime: BATCH_STALE_MS,
    })),
  });
  const failed = new Set<string>();
  results.forEach((result, index) => {
    const status = result.data?.status;
    const id = ids[index];
    if (id && (status === "failed" || status === "conflict")) failed.add(id);
  });
  return failed;
}

/** Toutes les acceptées pas encore enregistrées du lancement (parcourt les pages de 100) : base du bouton « Enregistrer ». */
function useSavable(projectId: string, launchId: string | undefined, accepted: number) {
  const query = useQuery({
    queryKey: [...orpc.proposal.key(), "savable", projectId, launchId, accepted],
    enabled: accepted > 0 && launchId !== undefined,
    queryFn: async (): Promise<ProposalOutput[]> => {
      const all: ProposalOutput[] = [];
      let cursor: string | undefined;
      do {
        const page = await orpc.proposal.list.call(
          listInput(projectId, { status: "all", limit: 100, ...(cursor ? { cursor } : {}) }),
        );
        all.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return all.filter(isSavable);
    },
  });
  return query.data;
}

function itemOf(proposal: ProposalOutput, failed: ReadonlySet<string>): ProposalReviewItem {
  const blocked = proposal.appliedBatchId !== null && failed.has(proposal.appliedBatchId);
  return {
    id: proposal.id,
    ref: refOf(proposal),
    title: proposal.title,
    subtitle: subtitleOf(proposal),
    status: blocked ? "blocked" : proposal.status,
  };
}

function groupOf(
  group: ProposalGroupOutput,
  items: ProposalOutput[],
  options: { grouped: boolean; filter: ReviewFilter; failed: ReadonlySet<string> },
): ProposalReviewGroup {
  const matching = options.grouped && options.filter === "pending" ? group.pending : group.total;
  return {
    key: group.key,
    label: group.label,
    counts: { total: group.total, accepted: group.accepted, pending: group.pending },
    matching,
    items: items.map((item) => itemOf(item, options.failed)),
  };
}

/**
 * Lecture de la relecture : un groupe par `proposal.list` (`group`), `status: pending` par défaut au-delà de 30,
 * 8 éléments puis 20 de plus par groupe ; sonde toutes les 2 s tant que le lancement tourne.
 */
export function useProposalReview(
  projectId: string,
  enabled: boolean,
  tab: FeaturesTab = "features",
) {
  const status = useProposalStatus(projectId, enabled);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [shown, setShown] = useState<Record<string, number>>({});
  const { counts, active } = status;
  // Chaque onglet relit les propositions de son type (maquette 10 l.532) ; les comptes du bandeau restent ceux du lancement.
  const groups = status.groups.filter(
    (group) => tabOfProposalKind(group.key.split(":")[0] ?? "") === tab,
  );
  const grouped = counts.total > PROPOSAL_GROUP_THRESHOLD;
  const results = useQueries({
    queries: groups.map((group) => ({
      ...orpc.proposal.list.queryOptions({
        input: listInput(projectId, {
          group: group.key,
          status: grouped ? filter : "all",
          limit: grouped ? (shown[group.key] ?? PROPOSAL_FIRST_PAGE) : FLAT_LIMIT,
        }),
        refetchInterval: isActiveLaunch(status.launch?.status) ? PROPOSAL_POLL_MS : false,
      }),
      placeholderData: keepPreviousData,
      enabled,
    })),
  });
  const loaded = results.map((result) => result.data?.items ?? []);
  const proposals = loaded.flat();
  const failed = useFailedBatches(projectId, proposals);
  const savable = useSavable(projectId, status.launch?.id, counts.accepted);
  const view = groups.map((group, index) =>
    groupOf(group, loaded[index] ?? [], { grouped, filter, failed }),
  );
  const error = results.find((result) => result.isError)?.error ?? status.query.error;

  return {
    status,
    grouped,
    filter,
    setFilter,
    loadMore: (key: string) =>
      setShown((prev) => ({
        ...prev,
        [key]: (prev[key] ?? PROPOSAL_FIRST_PAGE) + PROPOSAL_NEXT_PAGE,
      })),
    groups: view,
    proposals,
    byId: (id: string | undefined) => proposals.find((proposal) => proposal.id === id),
    savable: savable ?? [],
    /** Comptes du bandeau : « acceptées » = celles qu'on peut encore enregistrer, quand elles sont connues. */
    counts: { ...counts, accepted: savable ? savable.length : counts.accepted },
    active,
    error,
    refetch: () => {
      void status.query.refetch();
      for (const result of results) void result.refetch();
    },
    failed,
  };
}

export type ProposalReviewModel = ReturnType<typeof useProposalReview>;
