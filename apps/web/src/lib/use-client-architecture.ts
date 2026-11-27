"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AdrStatusParam } from "./architecture-tab.ts";
import { orpc } from "./orpc.ts";

/** Pages de 50 décisions et de 50 flux de la vue client (B590). */
export const CLIENT_PAGE_SIZE = 50;

/** Composants de l'architecture validée (`clientSpace.architecture`) : 100 au plus, `available` faux tant qu'elle n'est pas validée. */
export function useClientArchitecture(projectId: string) {
  return useQuery(orpc.clientSpace.architecture.queryOptions({ input: { projectId } }));
}

/** Décisions du client (`clientSpace.adrs`), pages de 50 par curseur. */
export function useClientDecisions(
  projectId: string,
  around: string | undefined,
  enabled: boolean,
  filters: { q?: string | undefined; status?: AdrStatusParam | undefined } = {},
) {
  const { q, status } = filters;
  const query = useInfiniteQuery({
    ...orpc.clientSpace.adrs.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: CLIENT_PAGE_SIZE,
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
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
  return {
    query,
    items: pages.flatMap((page) => page.items),
    total: pages.at(-1)?.total ?? 0,
    stale: query.isPlaceholderData,
    hasNext: Boolean(query.hasNextPage) && !query.isPlaceholderData,
    hasPrevious: Boolean(query.hasPreviousPage) && !query.isPlaceholderData,
  };
}

export type ClientDecisions = ReturnType<typeof useClientDecisions>;

export function useClientDecision(projectId: string, adrId: string | undefined) {
  return useQuery({
    ...orpc.clientSpace.adr.queryOptions({ input: { projectId, adrId: adrId ?? "" } }),
    enabled: adrId !== undefined,
  });
}

/** Flux du client (`clientSpace.archFlows`), pages de 50 par curseur. */
export function useClientFlows(projectId: string, around: string | undefined, enabled: boolean) {
  const query = useInfiniteQuery({
    ...orpc.clientSpace.archFlows.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: CLIENT_PAGE_SIZE,
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
  return {
    query,
    items: pages.flatMap((page) => page.items),
    total: pages.at(-1)?.total ?? 0,
    stale: query.isPlaceholderData,
    hasNext: Boolean(query.hasNextPage) && !query.isPlaceholderData,
    hasPrevious: Boolean(query.hasPreviousPage) && !query.isPlaceholderData,
  };
}

export type ClientFlows = ReturnType<typeof useClientFlows>;

export function useClientFlow(projectId: string, flowId: string | undefined) {
  return useQuery({
    ...orpc.clientSpace.archFlow.queryOptions({ input: { projectId, flowId: flowId ?? "" } }),
    enabled: flowId !== undefined,
  });
}

export type ClientCommentTarget = {
  kind: "component" | "adr" | "archflow" | "stack" | "environments" | "tech_section";
  ref: string;
};

/** « Commenter » un élément de la spec (B582, TK-115) : `comment.create`, cible vérifiée par le serveur. */
export function useArchitectureComment(projectId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...orpc.comment.create.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.comment.key() }),
  });
  return {
    pending: mutation.isPending,
    failed: mutation.isError,
    reset: mutation.reset,
    send: async (target: ClientCommentTarget, body: string): Promise<boolean> => {
      try {
        await mutation.mutateAsync({
          projectId,
          targetKind: target.kind,
          targetRef: target.ref,
          body,
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
