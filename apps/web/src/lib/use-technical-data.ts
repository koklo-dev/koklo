"use client";

import type { StackSummary } from "@koklo/contract";
import { STACK_PAGE_SIZE } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import type { DocSection } from "./use-architecture-document.ts";

interface StackOptions {
  projectId: string;
  q: string | undefined;
  /** Choix à amener dans la page (lien direct `?sel=`). */
  around: string | undefined;
  enabled: boolean;
}

/**
 * Choix de la stack (`spec.technical.stack.list`) : pages de 24 par curseur, recherche serveur, liste précédente gardée
 * pendant une recherche, `around` pour un lien direct.
 */
export function useTechnicalStack({ projectId, q, around, enabled }: StackOptions) {
  const query = useInfiniteQuery({
    ...orpc.spec.technical.stack.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: STACK_PAGE_SIZE,
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
    items: pages.flatMap((page) => page.items) as StackSummary[],
    total: pages.at(-1)?.total ?? 0,
    offset: pages[0]?.offset ?? 0,
    /** Comptes par couche de toute la recherche, et choix à trancher. */
    layers: (pages.at(-1)?.facets?.layer ?? {}) as Record<string, number>,
    open: pages.at(-1)?.facets?.status?.open ?? 0,
    stale,
    hasNext: Boolean(query.hasNextPage) && !stale,
    hasPrevious: Boolean(query.hasPreviousPage) && !stale,
    aroundMissing: Boolean(around) && query.isError && errorCode(query.error) === "NOT_FOUND",
  };
}

export type TechnicalStack = ReturnType<typeof useTechnicalStack>;

/** Total et choix à trancher de tout le projet, quelle que soit la recherche (en-tête et barre de compte). */
export function useStackTotals(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.technical.stack.list.queryOptions({ input: { projectId, limit: 1 } }),
    enabled,
  });
  return {
    query,
    total: query.data?.total,
    open: query.data?.facets?.status?.open ?? 0,
  };
}

/** Environnements, variables (noms seuls) et intégrations (`spec.technical.environments`). */
export function useTechnicalEnvironments(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.spec.technical.environments.queryOptions({ input: { projectId } }),
    enabled,
  });
}

export type TechnicalEnvironmentsQuery = ReturnType<typeof useTechnicalEnvironments>;

/** Document du cahier technique (`spec.document.sections`) : sections lues en Git, dans l'ordre de leur préfixe NN. */
export function useTechnicalDocument(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.document.sections.queryOptions({
      input: { projectId, deliverable: "technical" as const },
    }),
    enabled,
  });
  return {
    query,
    sections: (query.data?.sections ?? []) as DocSection[],
    loaded: query.data !== undefined,
  };
}
