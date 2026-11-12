"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { FeaturePriority, FeatureStatus, FeatureValidation } from "./feature-labels.ts";
import { deriveFeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos } from "./roles.ts";
import { useActiveOrganization } from "./use-active-organization.ts";
import { useDeepLink, useFeatures } from "./use-features.ts";
import { useSpecHead } from "./use-spec-head.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Filters {
  status: FeatureStatus | undefined;
  priority: FeaturePriority | undefined;
  validation: FeatureValidation | undefined;
  q: string | undefined;
  /** Fiche ouverte (`?sel=`) : à l'ouverture de l'écran, la liste s'ouvre sur la page qui la contient. */
  selected: string | undefined;
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

/** La liste, ouverte sur la page de la fiche d'un lien direct tant que les filtres sont ceux de l'ouverture. */
function useFeaturesList(projectId: string, filters: Filters, options: { enabled: boolean }) {
  const { selected, ...search } = filters;
  const deepLink = useDeepLink(
    selected,
    `${search.status}|${search.priority}|${search.validation}|${search.q}`,
  );
  const features = useFeatures({ projectId, ...search, around: deepLink.around, ...options });
  const { aroundMissing } = features;
  const dropAround = deepLink.drop;
  useEffect(() => {
    if (aroundMissing) dropAround();
  }, [aroundMissing, dropAround]);
  return { features, around: deepLink.around };
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
  const { features, around } = useFeaturesList(projectId, filters, {
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
    filtered: Boolean(filters.status || filters.priority || filters.validation || filters.q),
    head: head.query,
    repos,
    features: {
      ...features.query,
      // Un `around` inconnu n'est pas un projet introuvable : la liste se relit sans lui.
      isError: features.query.isError && !features.aroundMissing,
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
    around,
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
