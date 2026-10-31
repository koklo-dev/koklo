"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { FeaturePriority, FeatureStatus } from "./feature-labels.ts";
import { deriveFeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos } from "./roles.ts";
import { useActiveOrganization } from "./use-active-organization.ts";
import { useFeatures } from "./use-features.ts";
import { useSpecHead } from "./use-spec-head.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Filters {
  status: FeatureStatus | undefined;
  priority: FeaturePriority | undefined;
}

/** Relit la liste quand la version indexée change (fin de préparation, nouvelle version). */
function useListRefresh(head: { status: string; commitSha: string } | null | undefined): void {
  const queryClient = useQueryClient();
  const previous = useRef<string | null>(null);
  const signature = head ? `${head.status}:${head.commitSha}` : null;
  useEffect(() => {
    const before = previous.current;
    previous.current = signature;
    if (
      before !== null &&
      signature !== null &&
      before !== signature &&
      !before.startsWith("failed")
    ) {
      void queryClient.invalidateQueries({ queryKey: orpc.spec.listFeatures.key() });
    }
  }, [signature, queryClient]);
}

/**
 * Données de l'écran des fonctionnalités : `spec.head` d'abord, `repo.list` seulement s'il est vide et que le
 * rôle le permet, la liste seulement quand quelque chose est indexé et lisible.
 */
export function useFeaturesData(projectId: string, filters: Filters) {
  const valid = UUID.test(projectId);
  const { role, organizations, session } = useActiveOrganization();
  const project = useQuery(orpc.project.list.queryOptions());
  const pollEmpty = useRef(true);
  const head = useSpecHead(projectId, { enabled: valid, pollEmpty });
  const headData = head.query.data;

  const repos = useQuery({
    ...orpc.repo.list.queryOptions({ input: { projectId } }),
    enabled: valid && headData === null && canReadRepos(role),
  });
  const features = useFeatures({
    projectId,
    ...filters,
    enabled: valid && Boolean(headData) && headData?.status !== "failed",
  });
  // Une fois établi qu'aucun dépôt de spec n'existe, rien à attendre : on ne relit plus `spec.head`.
  pollEmpty.current = !(repos.data && !repos.data.some((repo) => repo.role === "spec"));
  useListRefresh(headData);

  const redirecting = useUnauthorizedRedirect(
    head.query.error ?? repos.error ?? features.query.error,
  );
  const view = deriveFeaturesView({
    valid,
    roleKnown: !organizations.isPending && !session.isPending,
    role,
    redirecting,
    filtered: Boolean(filters.status || filters.priority),
    head: head.query,
    repos,
    features: {
      ...features.query,
      itemCount: features.items.length,
      fetching: features.query.isFetching,
    },
  });

  return {
    view,
    projectId,
    role,
    head: headData ?? null,
    projectName: project.data?.find((candidate) => candidate.id === projectId)?.name,
    features,
    repos,
    expired: head.expired,
    /** « Réessayer » de l'erreur de chargement : relit ce qui a échoué (`spec.head`, sinon la liste). */
    retryLoad: () =>
      void (headData === undefined ? head.query.refetch() : features.query.refetch()),
    refresh: () => {
      head.restart();
      void head.query.refetch();
    },
  };
}
