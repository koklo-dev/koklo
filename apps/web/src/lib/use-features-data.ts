"use client";

import { useEffect } from "react";
import type { FeaturePriority, FeatureStatus, FeatureValidation } from "./feature-labels.ts";
import { deriveFeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { useDeepLink, useFeatures } from "./use-features.ts";
import { useSpecSources } from "./use-spec-sources.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

interface Filters {
  status: FeatureStatus | undefined;
  priority: FeaturePriority | undefined;
  validation: FeatureValidation | undefined;
  q: string | undefined;
  /** Fiche ouverte (`?sel=`) : à l'ouverture de l'écran, la liste s'ouvre sur la page qui la contient. */
  selected: string | undefined;
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

const LIST_KEYS = [() => orpc.spec.listFeatures.key()] as const;

/**
 * Données de l'écran des fonctionnalités : `spec.head` d'abord, `repo.list` seulement s'il est vide et que le
 * rôle le permet, la liste seulement quand quelque chose est indexé et lisible.
 */
export function useFeaturesData(projectId: string, filters: Filters) {
  const sources = useSpecSources(projectId, LIST_KEYS);
  const { role, head, headData, repos } = sources;
  const { features, around } = useFeaturesList(projectId, filters, { enabled: sources.readable });
  const redirecting = useUnauthorizedRedirect(
    head.query.error ?? repos.error ?? features.query.error,
  );
  const view = deriveFeaturesView({
    valid: sources.valid,
    roleKnown: sources.roleKnown,
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
    projectName: sources.projectName,
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
