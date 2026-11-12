"use client";

import type { FunctionalItem } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { errorCode } from "./api-error.ts";
import type { RuleTypeFilter } from "./features-url.ts";
import { orpc } from "./orpc.ts";

/** Pages de 24 règles ou de 6 parcours (08 §1.1, maquette 10 : « Charger la suite »). */
export const FUNCTIONAL_PAGE_SIZE = { rules: 24, flows: 6 } as const;

interface Options {
  projectId: string;
  tab: "rules" | "flows";
  type: RuleTypeFilter | undefined;
  q: string | undefined;
  /** Élément à amener dans la page (lien direct `?sel=`). */
  around: string | undefined;
  enabled: boolean;
}

/**
 * Règles métier ou parcours d'un projet (`spec.functional.list`) : même mécanique que les fonctionnalités (curseur
 * opaque, `total` du serveur, liste précédente gardée pendant une recherche, `around` pour un lien direct).
 */
export function useFunctionalList({ projectId, tab, type, q, around, enabled }: Options) {
  const query = useInfiniteQuery({
    ...orpc.spec.functional.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        tab,
        limit: FUNCTIONAL_PAGE_SIZE[tab],
        ...(tab === "rules" && type ? { type } : {}),
        ...(q ? { q } : {}),
        ...(cursor ? { cursor } : around ? { around } : {}),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      getPreviousPageParam: (page) => page.previousCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
    enabled,
  });
  const pages = query.data?.pages ?? [];
  const stale = query.isPlaceholderData;
  return {
    query,
    items: pages.flatMap((page) => page.items) as FunctionalItem[],
    total: pages.at(-1)?.total ?? 0,
    offset: pages[0]?.offset ?? 0,
    stale,
    hasNext: Boolean(query.hasNextPage) && !stale,
    hasPrevious: Boolean(query.hasPreviousPage) && !stale,
    aroundMissing: Boolean(around) && query.isError && errorCode(query.error) === "NOT_FOUND",
  };
}
