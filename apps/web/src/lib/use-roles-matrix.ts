"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "./orpc.ts";

interface Options {
  projectId: string;
  /** Filtre « Filtrer les actions » (adresse `?q=`). */
  q: string | undefined;
  enabled: boolean;
}

interface Toggles {
  q: string | undefined;
  /** Groupes que l'utilisateur a ouverts : leurs actions se lisent par un appel dédié (`group`). */
  requested: string[];
  /** Groupes ouverts d'office (moins de 5 actions) que l'utilisateur a refermés. */
  collapsed: string[];
}

const without = (list: string[], resource: string): string[] =>
  list.filter((item) => item !== resource);

/**
 * Matrice « Qui peut faire quoi » (`spec.roles.matrix`) : les rôles, les groupes par ressource et les actions des
 * groupes ouverts. Ouvrir un groupe de plus de 5 actions lit ses actions (`group`) ; la fermeture est locale.
 * Un autre filtre repart de zéro.
 */
export function useRolesMatrix({ projectId, q, enabled }: Options) {
  const [state, setState] = useState<Toggles>({ q, requested: [], collapsed: [] });
  const toggles = state.q === q ? state : { q, requested: [], collapsed: [] };
  const base = useQuery({
    ...orpc.spec.roles.matrix.queryOptions({ input: { projectId, ...(q ? { q } : {}) } }),
    placeholderData: keepPreviousData,
    enabled,
  });
  const extra = useQueries({
    queries: toggles.requested.map((group) => ({
      ...orpc.spec.roles.matrix.queryOptions({ input: { projectId, group, ...(q ? { q } : {}) } }),
      enabled,
    })),
  });
  const data = base.data;
  const actions = [
    ...(data?.actions ?? []),
    ...extra.flatMap((result) => result.data?.actions ?? []),
  ].filter(
    (action, index, all) => all.findIndex((other) => other.specId === action.specId) === index,
  );
  const groups = (data?.groups ?? []).map((group) => ({
    ...group,
    open:
      !toggles.collapsed.includes(group.resource) &&
      (group.open || toggles.requested.includes(group.resource)),
  }));
  return {
    query: base,
    roles: data?.roles ?? [],
    groups,
    actions,
    total: data?.total ?? 0,
    stale: base.isPlaceholderData,
    toggleGroup: (resource: string, open: boolean) =>
      setState(() =>
        open
          ? {
              ...toggles,
              collapsed: without(toggles.collapsed, resource),
              requested: toggles.requested.includes(resource)
                ? toggles.requested
                : [...toggles.requested, resource],
            }
          : { ...toggles, collapsed: [...toggles.collapsed, resource] },
      ),
    refetch: () => {
      void base.refetch();
      for (const result of extra) void result.refetch();
    },
  };
}
