"use client";

import type { ProposalReviewGroup, ProposalReviewItem, ProposalStatus } from "@koklo/ui";
import { PROPOSAL_FIRST_PAGE, PROPOSAL_GROUP_THRESHOLD, PROPOSAL_NEXT_PAGE } from "@koklo/ui";
import { keepPreviousData, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type FeaturesTab, tabOfProposalKind } from "./features-tab.ts";
import { orpc } from "./orpc.ts";
import { type Deliverable, refOf, subtitleOf } from "./proposal-labels.ts";
import { markerOf } from "./proposal-marks.ts";
import { technicalTitleOf } from "./proposal-technical.ts";
import type { ProposalGroupOutput, ProposalOutput } from "./proposal-types.ts";
import { NO_CASCADE, useSavable } from "./use-proposal-savable.ts";
import {
  isActiveLaunch,
  listInput,
  PROPOSAL_POLL_MS,
  useProposalStatus,
} from "./use-proposal-status.ts";

/** Livrable relu par un écran à part : il relit tous les types de son lancement. */
const DELIVERABLE_OF_TAB: Record<string, Deliverable> = {
  data: "data",
  architecture: "architecture",
  technical: "technical",
  security: "security",
};

/** Onglet de la relecture : un onglet du cahier fonctionnel ou la relecture entière d'un autre livrable. */
export type ReviewTab = FeaturesTab | "data" | "architecture" | "technical" | "security";

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

function statusOf(proposal: ProposalOutput, failed: ReadonlySet<string>): ProposalStatus {
  if (proposal.discardReason === "already_present") return "present";
  const blocked = proposal.appliedBatchId !== null && failed.has(proposal.appliedBatchId);
  return blocked ? "blocked" : proposal.status;
}

function itemOf(proposal: ProposalOutput, failed: ReadonlySet<string>): ProposalReviewItem {
  return {
    id: proposal.id,
    ref: refOf(proposal),
    title: technicalTitleOf(proposal),
    subtitle: subtitleOf(proposal),
    status: statusOf(proposal, failed),
  };
}

/**
 * Badge du menu (B704) : la liste règle les déjà présentes côté serveur ; dès qu'elle en rend une encore inconnue
 * de l'écran, la lecture des livrables est relue pour retirer ces propositions du badge.
 */
function useDeliverablesRefresh(present: number) {
  const queryClient = useQueryClient();
  const known = useRef(0);
  useEffect(() => {
    if (present <= known.current) return;
    known.current = present;
    void queryClient.invalidateQueries({ queryKey: orpc.spec.deliverables.key() });
  }, [present, queryClient]);
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

/** Éléments affichés par groupe : 8 au départ, 20 de plus à chaque « Afficher 20 de plus ». */
function useShown() {
  const [shown, setShown] = useState<Record<string, number>>({});
  const loadMore = (key: string) =>
    setShown((prev) => ({
      ...prev,
      [key]: (prev[key] ?? PROPOSAL_FIRST_PAGE) + PROPOSAL_NEXT_PAGE,
    }));
  return { shown, loadMore };
}

interface GroupReads {
  projectId: string;
  enabled: boolean;
  deliverable: Deliverable;
  groups: readonly ProposalGroupOutput[];
  grouped: boolean;
  filter: ReviewFilter;
  shown: Record<string, number>;
  launchStatus: string | undefined;
}

/** Une lecture `proposal.list` par groupe : toutes à plat sous 30, sinon la page affichée du groupe, filtrée. */
function useGroupReads(reads: GroupReads) {
  const { projectId, enabled, deliverable, groups, grouped, filter, shown, launchStatus } = reads;
  return useQueries({
    queries: groups.map((group) => ({
      ...orpc.proposal.list.queryOptions({
        input: listInput(
          projectId,
          {
            group: group.key,
            status: grouped ? filter : "all",
            limit: grouped ? (shown[group.key] ?? PROPOSAL_FIRST_PAGE) : FLAT_LIMIT,
          },
          deliverable,
        ),
        refetchInterval: isActiveLaunch(launchStatus) ? PROPOSAL_POLL_MS : false,
      }),
      placeholderData: keepPreviousData,
      enabled,
    })),
  });
}

/** Relit le lancement et chaque groupe chargé. */
const refetchAll = (reads: readonly { refetch: () => Promise<unknown> }[]) => {
  for (const read of reads) void read.refetch();
};

/** Un livrable à part relit tous ses groupes ; un onglet du cahier ne relit que ses types. */
const inTab = (groupKey: string, tab: ReviewTab): boolean =>
  Object.hasOwn(DELIVERABLE_OF_TAB, tab) || tabOfProposalKind(groupKey.split(":")[0] ?? "") === tab;

/**
 * Lecture de la relecture : un groupe par `proposal.list` (`group`), `status: pending` par défaut au-delà de 30,
 * 8 éléments puis 20 de plus par groupe ; sonde toutes les 2 s tant que le lancement tourne.
 */
export function useProposalReview(
  projectId: string,
  enabled: boolean,
  tab: ReviewTab = "features",
) {
  const deliverable: Deliverable = DELIVERABLE_OF_TAB[tab as string] ?? "functional";
  const status = useProposalStatus(projectId, enabled, deliverable);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const { shown, loadMore } = useShown();
  const { counts, active } = status;
  useDeliverablesRefresh(counts.present);
  // Chaque onglet relit les propositions de son type (maquette 10 l.532) ; les comptes du bandeau restent ceux du lancement.
  const groups = status.groups.filter((group) => inTab(group.key, tab));
  const grouped = counts.total > PROPOSAL_GROUP_THRESHOLD;
  const results = useGroupReads({
    projectId,
    enabled,
    deliverable,
    groups,
    grouped,
    filter,
    shown,
    launchStatus: status.launch?.status,
  });
  const loaded = results.map((result) => (result.data?.items ?? []).map(markerOf(deliverable)));
  const proposals = loaded.flat();
  const loadedFailed = useFailedBatches(projectId, proposals);
  const savedSet = useSavable(projectId, status.launch?.id, counts.accepted, deliverable);
  const failed = new Set([...loadedFailed, ...(savedSet?.failed ?? [])]);
  const savable = savedSet?.proposals;
  const view = groups.map((group, index) =>
    groupOf(group, loaded[index] ?? [], { grouped, filter, failed }),
  );
  const error = results.find((result) => result.isError)?.error ?? status.query.error;

  return {
    status,
    grouped,
    filter,
    setFilter,
    loadMore,
    groups: view,
    proposals,
    byId: (id: string | undefined) => proposals.find((proposal) => proposal.id === id),
    savable: savable ?? [],
    /** Relations et champs `ref` retirés avec les tables rejetées (Données, B392). */
    cascade: savedSet?.cascade ?? NO_CASCADE,
    /** Comptes du bandeau : « acceptées » = celles qu'on peut encore enregistrer, quand elles sont connues. */
    counts: { ...counts, accepted: savable ? savable.length : counts.accepted },
    active,
    error,
    refetch: () => refetchAll([status.query, ...results]),
    failed,
    /** Enregistrement échoué à reprendre (alerte et « Réessayer l'enregistrement », B674). */
    saveFailure: savedSet?.failure ?? null,
  };
}

export type ProposalReviewModel = ReturnType<typeof useProposalReview>;
