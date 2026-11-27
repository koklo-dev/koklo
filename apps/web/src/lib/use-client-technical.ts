"use client";

import { STACK_PAGE_SIZE } from "@koklo/contract";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";
import { CURSOR_PAGES, cursorOf, pagedListOf } from "./use-technical-data.ts";

/** `id` côté client : les cartes, les lignes et les fiches lisent `specId`, sans chemin de fichier. */
export const asSpecItem = <T extends { id: string }>({ id, ...rest }: T) => ({
  ...rest,
  specId: id,
});

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
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  return {
    ...list,
    items: list.items.map(asSpecItem),
    layers: list.facet("layer"),
    open: list.facet("status").open ?? 0,
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
