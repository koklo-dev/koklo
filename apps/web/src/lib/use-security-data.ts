"use client";

import {
  DATA_PAGE_SIZE,
  type SecurityContextOutput,
  type SecurityDataRow,
  THREAT_PAGE_SIZE,
  type ThreatSummary,
} from "@koklo/contract";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";
import type { SecurityCounts } from "./security-header-state.ts";
import type { ThreatFilter } from "./security-tab.ts";
import type { DocSection } from "./use-architecture-document.ts";
import { CURSOR_PAGES, cursorOf, isAroundMissing, pagedListOf } from "./use-technical-data.ts";

interface ThreatOptions {
  projectId: string;
  q: string | undefined;
  filter: ThreatFilter | undefined;
  /** Menace à amener dans la page (lien direct `?threat=`). */
  around: string | undefined;
  enabled: boolean;
}

/** Menaces (`security.threat.list`) : pages de 50 triées par surface, recherche et filtre côté serveur (B808). */
export function useThreatList({ projectId, q, filter, around, enabled }: ThreatOptions) {
  const query = useInfiniteQuery({
    ...orpc.security.threat.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: THREAT_PAGE_SIZE,
        ...(q ? { q } : {}),
        ...(filter ? { filter } : {}),
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  const last = query.data?.pages.at(-1);
  return {
    ...list,
    items: list.items as ThreatSummary[],
    /** Comptes de toute la tête par surface, et leurs titres. */
    surfaceCounts: list.facet("surface"),
    surfaces: last?.surfaces ?? [],
    aroundMissing: isAroundMissing(around, query),
  };
}
export type ThreatListModel = ReturnType<typeof useThreatList>;

interface DataOptions {
  projectId: string;
  q: string | undefined;
  undecided: boolean;
  around: string | undefined;
  enabled: boolean;
}

/** Données sensibles (`security.data.list`) : une ligne par entrée et par champ non classé, pages de 50. */
export function useDataList({ projectId, q, undecided, around, enabled }: DataOptions) {
  const query = useInfiniteQuery({
    ...orpc.security.data.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: DATA_PAGE_SIZE,
        ...(q ? { q } : {}),
        ...(undecided ? { undecided: true } : {}),
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  return {
    ...list,
    items: list.items as SecurityDataRow[],
    context: query.data?.pages.at(-1)?.context as SecurityContextOutput | undefined,
    aroundMissing: isAroundMissing(around, query),
  };
}
export type DataListModel = ReturnType<typeof useDataList>;

export function useThreatDetail(projectId: string, threatId: string) {
  return useQuery(orpc.security.threat.byId.queryOptions({ input: { projectId, threatId } }));
}

export function useRights(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.security.rights.get.queryOptions({ input: { projectId } }),
    enabled,
  });
}

export function useAsvs(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.security.asvs.report.queryOptions({ input: { projectId } }),
    enabled,
  });
}

export function useSecuritySummary(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.security.summary.get.queryOptions({ input: { projectId } }),
    enabled,
  });
}

/** Totaux de la tête, quels que soient la recherche et l'onglet : en-tête, onglets et état « Prêt » (B813). */
export function useSecurityTotals(projectId: string, enabled: boolean) {
  const threats = useQuery({
    ...orpc.security.threat.list.queryOptions({ input: { projectId, limit: 1 } }),
    enabled,
  });
  // La première page des données sert aussi à reconnaître les tables citées par une menace.
  const data = useQuery({
    ...orpc.security.data.list.queryOptions({ input: { projectId, limit: DATA_PAGE_SIZE } }),
    enabled,
  });
  const rights = useRights(projectId, enabled);
  const asvs = useAsvs(projectId, enabled);
  const summary = useSecuritySummary(projectId, enabled);
  return { threats, data, rights, asvs, summary };
}
export type SecurityTotals = ReturnType<typeof useSecurityTotals>;

/** Comptes de la page, une fois les quatre lectures arrivées. */
export function countsOf(totals: SecurityTotals): SecurityCounts | undefined {
  const { threats, data, rights, asvs } = totals;
  if (!threats.data || !data.data || !rights.data || !asvs.data) return undefined;
  const threat = threats.data.facets?.status ?? {};
  const fields = data.data.facets?.status ?? {};
  const todo = threat.todo ?? 0;
  return {
    threats: threat.total ?? 0,
    treated: (threat.total ?? 0) - todo,
    todo,
    todoHigh: threat.todoHigh ?? 0,
    rows: fields.total ?? 0,
    classified: fields.classified ?? 0,
    toDecide: (fields.unclassified ?? 0) + (fields.undecided ?? 0),
    scenarios: rights.data.abuseScenarios,
    level: asvs.data.level,
    answered: asvs.data.answered,
    total: asvs.data.total,
  };
}

/** Éléments écrits dans la sécurité : à zéro, la page est « Prêt ». Les champs non classés ne comptent pas. */
export function writtenCount(totals: SecurityTotals): number {
  const counts = countsOf(totals);
  if (!counts) return 0;
  const rules = totals.rights.data?.ownershipRules.length ?? 0;
  const summary = totals.summary.data?.available ? 1 : 0;
  return counts.threats + counts.classified + counts.total + rules + summary;
}

/** Document du dossier de sécurité (`spec.document.sections`), lu en Git, dans l'ordre de leur préfixe NN. */
export function useSecurityDocument(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.document.sections.queryOptions({
      input: { projectId, deliverable: "security" as const },
    }),
    enabled,
  });
  return {
    query,
    sections: (query.data?.sections ?? []) as DocSection[],
    loaded: query.data !== undefined,
  };
}
