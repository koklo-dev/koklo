"use client";

import type { Role } from "@koklo/contract";
import { useEffect, useRef } from "react";
import type { TabNumbers } from "./features-header-state.ts";
import { FEATURES_TABS, tabOfProposalKind } from "./features-tab.ts";
import { canWriteSpec } from "./roles.ts";
import type { useFeaturesUrl } from "./use-features-url.ts";
import { useProposalLaunch } from "./use-proposal-launch.ts";
import { useProposalStatus } from "./use-proposal-status.ts";

interface ProposalSources {
  role: Role | undefined;
  head: { status: string } | null;
}

/** Propositions à relire par onglet : la clé d'un groupe est `type` ou `type:zone`. */
export function pendingByTab(groups: ReadonlyArray<{ key: string; pending: number }>): TabNumbers {
  const sums = Object.fromEntries(FEATURES_TABS.map((tab) => [tab, 0])) as TabNumbers;
  for (const group of groups)
    sums[tabOfProposalKind(group.key.split(":")[0] ?? "")] += group.pending;
  return sums;
}

/**
 * Propositions de l'agent : bouton, modale et état du dernier lancement, pour l'équipe qui écrit sur une spec lue
 * seulement. Au chargement, un lancement à relire ouvre la relecture une fois (`replaceState`), jamais deux.
 */
export function useProposals(
  projectId: string,
  url: ReturnType<typeof useFeaturesUrl>,
  data: ProposalSources,
) {
  const enabled = canWriteSpec(data.role) && data.head?.status === "ready";
  const status = useProposalStatus(projectId, enabled);
  const launch = useProposalLaunch(projectId, status, { enabled, onLaunched: url.openReview });
  const checked = useRef(false);
  const { autoOpenReview } = url;
  const { loaded, active, counts } = status;
  useEffect(() => {
    if (!enabled || !loaded || checked.current) return;
    checked.current = true;
    if (!active && counts.pending > 0 && !url.review) autoOpenReview();
  }, [enabled, loaded, active, counts.pending, url.review, autoOpenReview]);
  return {
    enabled,
    status,
    launch,
    reviewing: enabled && Boolean(url.review),
    pendingByTab: pendingByTab(status.groups),
  };
}
