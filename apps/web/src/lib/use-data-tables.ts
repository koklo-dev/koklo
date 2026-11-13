"use client";

import type { dataTableSummarySchema } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";

export type DataTableRow = z.infer<typeof dataTableSummarySchema>;

/** Pages de 50 tables (08 §2.2, maquette 11 l.422 : « les 50 suivantes se chargent »). */
export const TABLES_PAGE_SIZE = 50;

interface Options {
  projectId: string;
  q: string | undefined;
  zone: string | undefined;
  /** Table à amener dans la page (lien direct `?sel=`). */
  around: string | undefined;
  enabled: boolean;
}

/**
 * Tables du modèle (`spec.data.tables.list`) : curseur opaque, `total` du serveur, liste précédente gardée pendant une
 * recherche, `around` pour un lien direct, facettes de zone pour le filtre.
 */
export function useDataTables({ projectId, q, zone, around, enabled }: Options) {
  const query = useInfiniteQuery({
    ...orpc.spec.data.tables.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: TABLES_PAGE_SIZE,
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
    items: pages.flatMap((page) => page.items) as DataTableRow[],
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

export type DataTables = ReturnType<typeof useDataTables>;
