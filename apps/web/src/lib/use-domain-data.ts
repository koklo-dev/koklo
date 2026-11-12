"use client";

import { useEffect } from "react";
import type { RuleTypeFilter } from "./features-url.ts";
import { deriveFeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { useDeepLink } from "./use-features.ts";
import { useFunctionalList } from "./use-functional-list.ts";
import { useRolesMatrix } from "./use-roles-matrix.ts";
import { useSpecSources } from "./use-spec-sources.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export type DomainTab = "rules" | "roles" | "flows";

interface Filters {
  type: RuleTypeFilter | undefined;
  q: string | undefined;
  /** Élément ouvert (`?sel=`) : à l'ouverture de l'écran, la liste s'ouvre sur la page qui le contient. */
  selected: string | undefined;
}

const LIST_KEYS = [
  () => orpc.spec.functional.key(),
  () => orpc.spec.roles.key(),
  () => orpc.spec.item.key(),
] as const;

/**
 * Données d'un onglet Règles métier, Rôles et permissions ou Parcours : le même socle que les fonctionnalités
 * (`spec.head`, dépôts, état principal de l'écran), puis la liste paginée (règles, parcours) ou la matrice (rôles).
 */
export function useDomainData(projectId: string, tab: DomainTab, filters: Filters) {
  const sources = useSpecSources(projectId, LIST_KEYS);
  const { role, head, headData, repos, readable } = sources;
  const deepLink = useDeepLink(filters.selected, `${filters.type}|${filters.q}`);
  const functional = useFunctionalList({
    projectId,
    tab: tab === "flows" ? "flows" : "rules",
    type: filters.type,
    q: filters.q,
    around: deepLink.around,
    enabled: readable && tab !== "roles",
  });
  const matrix = useRolesMatrix({ projectId, q: filters.q, enabled: readable && tab === "roles" });
  const dropAround = deepLink.drop;
  const { aroundMissing } = functional;
  useEffect(() => {
    if (aroundMissing) dropAround();
  }, [aroundMissing, dropAround]);

  const list = tab === "roles" ? matrix : functional;
  const itemCount = tab === "roles" ? matrix.roles.length : functional.items.length;
  const redirecting = useUnauthorizedRedirect(head.query.error ?? repos.error ?? list.query.error);
  const view = deriveFeaturesView({
    valid: sources.valid,
    roleKnown: sources.roleKnown,
    role,
    redirecting,
    filtered: Boolean(filters.q || (tab === "rules" && filters.type)),
    head: head.query,
    repos,
    features: {
      ...list.query,
      isError: list.query.isError && !aroundMissing,
      itemCount,
      fetching: list.query.isFetching,
    },
  });
  return {
    view,
    projectId,
    role,
    head: headData ?? null,
    projectName: sources.projectName,
    functional,
    matrix,
    around: deepLink.around,
    repos,
    expired: head.expired,
    retryLoad: () => void (headData === undefined ? head.query.refetch() : list.query.refetch()),
    refresh: () => {
      head.restart();
      void head.query.refetch();
    },
  };
}

export type DomainData = ReturnType<typeof useDomainData>;
