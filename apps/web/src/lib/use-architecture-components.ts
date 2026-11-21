"use client";

import type { architectureComponentSummarySchema } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";

export type ArchitectureComponentRow = z.infer<typeof architectureComponentSummarySchema>;

/** Pages de 50 composants (08 §2.2, maquette 13 l.374 : « les 50 suivants se chargent »). */
export const COMPONENTS_PAGE_SIZE = 50;

interface Options {
  projectId: string;
  q: string | undefined;
  zone: string | undefined;
  /** Composant à amener dans la page (lien direct `?c=`). */
  around: string | undefined;
  enabled: boolean;
}

/**
 * Composants (`spec.architecture.components.list`) : curseur opaque, `total` du serveur, liste précédente gardée pendant
 * une recherche, `around` pour un lien direct, facettes de zone pour le filtre.
 */
export function useArchitectureComponents({ projectId, q, zone, around, enabled }: Options) {
  const query = useInfiniteQuery({
    ...orpc.spec.architecture.components.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: COMPONENTS_PAGE_SIZE,
        ...(q ? { q } : {}),
        ...(zone ? { zone } : {}),
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
    items: pages.flatMap((page) => page.items) as ArchitectureComponentRow[],
    total: pages.at(-1)?.total ?? 0,
    offset: pages[0]?.offset ?? 0,
    zones: Object.entries(pages.at(-1)?.facets?.zone ?? {}).map(([name, count]) => ({
      name,
      count,
    })),
    stale,
    hasNext: Boolean(query.hasNextPage) && !stale,
    hasPrevious: Boolean(query.hasPreviousPage) && !stale,
    aroundMissing: Boolean(around) && query.isError && errorCode(query.error) === "NOT_FOUND",
  };
}

export type ArchitectureComponents = ReturnType<typeof useArchitectureComponents>;
