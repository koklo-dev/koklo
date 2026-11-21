"use client";

import type { adrSummarySchema } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { errorCode } from "./api-error.ts";
import type { AdrPeriod, AdrStatusParam } from "./architecture-tab.ts";
import { orpc } from "./orpc.ts";

export type ArchitectureDecisionRow = z.infer<typeof adrSummarySchema>;

/** Pages de 50 décisions (B583, comme les composants et les flux). */
export const DECISIONS_PAGE_SIZE = 50;

const DAY = 86_400_000;
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Début de la période choisie (B583) : 30 ou 90 derniers jours, ou le 1er janvier de l'année en cours. */
export function periodStart(period: AdrPeriod, now: Date = new Date()): string {
  if (period === "annee") return `${now.getUTCFullYear()}-01-01`;
  return isoDay(new Date(now.getTime() - (period === "30j" ? 30 : 90) * DAY));
}

interface Options {
  projectId: string;
  q: string | undefined;
  status: AdrStatusParam | undefined;
  component: string | undefined;
  period: AdrPeriod | undefined;
  /** Décision à amener dans la page (lien direct `?d=`). */
  around: string | undefined;
  enabled: boolean;
}

/**
 * Décisions (`spec.architecture.adr.list`) : curseur opaque, `total` du serveur, filtres côté serveur, facettes de
 * statut pour la barre de compte, `around` pour un lien direct.
 */
export function useArchitectureDecisions(options: Options) {
  const { projectId, q, status, component, period, around, enabled } = options;
  const from = period ? periodStart(period) : undefined;
  const query = useInfiniteQuery({
    ...orpc.spec.architecture.adr.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: DECISIONS_PAGE_SIZE,
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
        ...(component ? { component } : {}),
        ...(from ? { from } : {}),
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
    items: pages.flatMap((page) => page.items) as ArchitectureDecisionRow[],
    total: pages.at(-1)?.total ?? 0,
    facets: (pages.at(-1)?.facets?.status ?? {}) as Partial<Record<AdrStatusParam, number>>,
    stale,
    hasNext: Boolean(query.hasNextPage) && !stale,
    hasPrevious: Boolean(query.hasPreviousPage) && !stale,
    aroundMissing: Boolean(around) && query.isError && errorCode(query.error) === "NOT_FOUND",
  };
}

export type ArchitectureDecisions = ReturnType<typeof useArchitectureDecisions>;

/** Fiche d'une décision (`spec.architecture.adr.byId`) : sections, conséquences, alternatives, liens. */
export function useArchitectureDecision(projectId: string, adrId: string | undefined) {
  return useQuery({
    ...orpc.spec.architecture.adr.byId.queryOptions({ input: { projectId, adrId: adrId ?? "" } }),
    enabled: adrId !== undefined,
  });
}

/** Nombre de décisions (`total` d'une page d'une ligne) : le résumé et l'onglet Décisions de l'en-tête le comptent. */
export function useDecisionCount(projectId: string, enabled: boolean): number | undefined {
  const query = useQuery({
    ...orpc.spec.architecture.adr.list.queryOptions({ input: { projectId, limit: 1 } }),
    enabled,
  });
  return query.data?.total;
}
