"use client";

import type { StackSummary } from "@koklo/contract";
import { STACK_PAGE_SIZE } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import type { DocSection } from "./use-architecture-document.ts";

/** Pages d'une liste à curseur : même enchaînement pour les choix, les opérations et les exigences. */
export const CURSOR_PAGES = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
  getPreviousPageParam: (page: { previousCursor: string | null }) =>
    page.previousCursor ?? undefined,
  placeholderData: keepPreviousData,
};

/** Première page autour de l'élément de l'adresse, puis la page du curseur. */
export const cursorOf = (cursor: string | undefined, around: string | undefined) =>
  cursor ? { cursor } : around ? { around } : {};

interface ListPage {
  items: unknown[];
  total: number;
  offset: number;
  facets?: Record<string, Record<string, number>> | undefined;
}

interface PagedQuery<P> {
  data: { pages: P[] } | undefined;
  isPlaceholderData: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Ce qu'un écran lit d'une liste paginée : éléments chargés, total et facettes de la dernière page, suites. */
export function pagedListOf<P extends ListPage, Q extends PagedQuery<P>>(query: Q & PagedQuery<P>) {
  const pages = query.data?.pages ?? [];
  const stale = query.isPlaceholderData;
  const last = pages.at(-1);
  return {
    query: query as Q,
    items: pages.flatMap((page) => page.items) as P["items"],
    total: last?.total ?? 0,
    offset: pages[0]?.offset ?? 0,
    facet: (name: string): Record<string, number> => last?.facets?.[name] ?? {},
    stale,
    hasNext: Boolean(query.hasNextPage) && !stale,
    hasPrevious: Boolean(query.hasPreviousPage) && !stale,
  };
}

/** Un élément demandé par l'adresse mais introuvable : l'appelant repart de la première page. */
export const isAroundMissing = (
  around: string | undefined,
  query: { isError: boolean; error: unknown },
): boolean => Boolean(around) && query.isError && errorCode(query.error) === "NOT_FOUND";

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
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  return {
    ...list,
    items: list.items as StackSummary[],
    /** Comptes par couche de toute la recherche, et choix à trancher. */
    layers: list.facet("layer"),
    open: list.facet("status").open ?? 0,
    aroundMissing: isAroundMissing(around, query),
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
