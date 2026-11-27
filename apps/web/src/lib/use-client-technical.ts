"use client";

import { STACK_PAGE_SIZE } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";

/** Cahier technique validé vu du client (`clientSpace.technical*`) : rien tant qu'il n'est pas validé. */
export function useClientTechnical(projectId: string) {
  return useQuery(orpc.clientSpace.technical.queryOptions({ input: { projectId } }));
}

/** Choix du cahier validé, pages de 24 par curseur ; `around` amène le choix de l'adresse. */
export function useClientStack(projectId: string, around: string | undefined, enabled: boolean) {
  const query = useInfiniteQuery({
    ...orpc.clientSpace.technicalStack.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: STACK_PAGE_SIZE,
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
    // `id` côté client : la fiche et les cartes lisent `specId`, sans chemin de fichier.
    items: pages.flatMap((page) => page.items).map(({ id, ...rest }) => ({ ...rest, specId: id })),
    total: pages.at(-1)?.total ?? 0,
    layers: (pages.at(-1)?.facets?.layer ?? {}) as Record<string, number>,
    open: pages.at(-1)?.facets?.status?.open ?? 0,
    stale,
    hasNext: Boolean(query.hasNextPage) && !stale,
    hasPrevious: Boolean(query.hasPreviousPage) && !stale,
  };
}

export function useClientEnvironments(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.clientSpace.technicalEnvironments.queryOptions({ input: { projectId } }),
    enabled,
  });
}

/** Sections du document validé : sans chemin ; l'adresse les désigne par leur identifiant sans « DOC- ». */
export function useClientDocument(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.clientSpace.technicalDocument.queryOptions({ input: { projectId } }),
    enabled,
  });
  return {
    query,
    sections: (query.data?.sections ?? []).map((section) => ({
      ...section,
      slug: section.specId.replace(/^DOC-/, ""),
    })),
    loaded: query.data !== undefined,
  };
}

/** Questions et réponses d'une section (`comment.list`). */
export function useSectionComments(projectId: string, specId: string) {
  return useQuery(
    orpc.comment.list.queryOptions({
      input: { projectId, targetKind: "tech_section" as const, targetRef: specId, limit: 50 },
    }),
  );
}
