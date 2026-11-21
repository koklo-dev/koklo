"use client";

import type { architectureFlowSummarySchema } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { orpc } from "./orpc.ts";

export type ArchitectureFlowRow = z.infer<typeof architectureFlowSummarySchema>;

/** Pages de 50 flux (B543, maquette 13 l.407-412). */
export const FLOWS_PAGE_SIZE = 50;

/**
 * Flux (`spec.architecture.flows.list`) : curseur opaque, `total` du serveur, `around` amène le flux d'un lien direct
 * (`?f=P-…`) dans la première page.
 */
export function useArchitectureFlows(
  projectId: string,
  around: string | undefined,
  enabled: boolean,
) {
  const query = useInfiniteQuery({
    ...orpc.spec.architecture.flows.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: FLOWS_PAGE_SIZE,
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
    items: pages.flatMap((page) => page.items) as ArchitectureFlowRow[],
    total: pages.at(-1)?.total ?? 0,
    stale: query.isPlaceholderData,
    hasNext: Boolean(query.hasNextPage) && !query.isPlaceholderData,
    hasPrevious: Boolean(query.hasPreviousPage) && !query.isPlaceholderData,
  };
}

export type ArchitectureFlows = ReturnType<typeof useArchitectureFlows>;

/** Détail d'un flux (`spec.architecture.flows.byId`) : participants, éléments, liens. */
export function useArchitectureFlow(projectId: string, flowId: string | undefined) {
  return useQuery({
    ...orpc.spec.architecture.flows.byId.queryOptions({
      input: { projectId, flowId: flowId ?? "" },
    }),
    enabled: flowId !== undefined,
  });
}

/** Source d'un flux : le YAML du dépôt (ou généré) ou son Mermaid (`spec.architecture.source`). */
export function useFlowSource(
  projectId: string,
  flowId: string,
  format: "yaml" | "mermaid",
  enabled: boolean,
) {
  return useQuery({
    ...orpc.spec.architecture.source.queryOptions({
      input: { projectId, target: { kind: "flow", id: flowId }, format },
    }),
    enabled,
  });
}

/** Source d'un composant (YAML) ou du schéma (Mermaid). */
export function useArchitectureSource(
  projectId: string,
  target: { kind: "component"; id: string } | { kind: "schema" },
  enabled: boolean,
) {
  return useQuery({
    ...orpc.spec.architecture.source.queryOptions({ input: { projectId, target } }),
    enabled,
  });
}

/** Nombre de flux (`total` d'une page d'une ligne) : le résumé et l'onglet Flux de l'en-tête le comptent. */
export function useFlowCount(projectId: string, enabled: boolean): number | undefined {
  const query = useQuery({
    ...orpc.spec.architecture.flows.list.queryOptions({ input: { projectId, limit: 1 } }),
    enabled,
  });
  return query.data?.total;
}
