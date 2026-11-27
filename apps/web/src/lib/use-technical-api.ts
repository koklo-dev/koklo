"use client";

import type {
  ClientNfr,
  ClientOperationSummary,
  NfrSummary,
  OperationDetail,
  OperationSummary,
} from "@koklo/contract";
import { NFR_PAGE_SIZE, OPERATION_PAGE_SIZE } from "@koklo/contract";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { orpc } from "./orpc.ts";
import { asSpecItem } from "./use-client-technical.ts";
import { useDeepLink } from "./use-features.ts";
import { CURSOR_PAGES, cursorOf, isAroundMissing, pagedListOf } from "./use-technical-data.ts";

/** Lectures des onglets API et Exigences (TK-116) : équipe (`spec.technical.*`) et client (`clientSpace.*`). */
export type OperationRowData = Omit<OperationSummary, "filePath">;
export type NfrCardData = Omit<NfrSummary, "filePath">;
export type OperationFicheData = Omit<OperationDetail, "filePath" | "commitSha">;

interface OperationFilters {
  projectId: string;
  q: string | undefined;
  zone: string | undefined;
  /** Opération de l'adresse : la liste s'ouvre sur sa page. */
  op: string | undefined;
  enabled: boolean;
}

const filtersOf = ({ q, zone }: Pick<OperationFilters, "q" | "zone">) => ({
  ...(q ? { q } : {}),
  ...(zone ? { zone } : {}),
});

/**
 * Exigence de l'adresse (lien direct ou élément enregistré) amenée dans la page ; introuvable, elle est ignorée.
 * Les cartes ne changent pas l'adresse : la suivre ne déplace pas la liste sous le lecteur.
 */
function useAskedRequirement(nfr: string | undefined) {
  const [lost, setLost] = useState<string | undefined>();
  const drop = useCallback(() => setLost(nfr), [nfr]);
  return { around: nfr === lost ? undefined : nfr, drop };
}

/** Élément demandé introuvable (lien périmé) : on repart de la première page. */
function useDropMissing(missing: boolean, drop: () => void) {
  useEffect(() => {
    if (missing) drop();
  }, [missing, drop]);
}

/** Opérations par pages de 50, tri zone puis nom, recherche et zone par le serveur. */
export function useOperations({ projectId, q, zone, op, enabled }: OperationFilters) {
  const { around, drop } = useDeepLink(op, `${q ?? ""}|${zone ?? ""}`);
  const query = useInfiniteQuery({
    ...orpc.spec.technical.ops.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: OPERATION_PAGE_SIZE,
        ...filtersOf({ q, zone }),
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  const missing = isAroundMissing(around, query);
  useDropMissing(missing, drop);
  return {
    ...list,
    items: list.items as OperationRowData[],
    zones: list.facet("zone"),
    aroundMissing: missing,
  };
}

export function useClientOperations({ projectId, q, zone, op, enabled }: OperationFilters) {
  const { around, drop } = useDeepLink(op, `${q ?? ""}|${zone ?? ""}`);
  const query = useInfiniteQuery({
    ...orpc.clientSpace.technicalOps.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: OPERATION_PAGE_SIZE,
        ...filtersOf({ q, zone }),
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  const missing = isAroundMissing(around, query);
  useDropMissing(missing, drop);
  return {
    ...list,
    items: (list.items as ClientOperationSummary[]).map(asSpecItem),
    zones: list.facet("zone"),
    aroundMissing: missing,
  };
}

export type OperationListModel = ReturnType<typeof useOperations | typeof useClientOperations>;

/** Total des opérations `zone.verbe` du projet (sans les anciens points REST) : en-tête et onglet. */
export function useOperationTotal(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.technical.ops.list.queryOptions({ input: { projectId, limit: 1 } }),
    enabled,
  });
  return query.data?.total;
}

/** Zones et permissions proposées par la feuille « Opération ». */
export function useOperationOptions(projectId: string) {
  return useQuery(orpc.spec.technical.ops.options.queryOptions({ input: { projectId } }));
}

interface RequirementFilters {
  projectId: string;
  /** Exigence de l'adresse (`?nfr=`). */
  nfr: string | undefined;
  enabled: boolean;
}

/** Exigences par pages de 50, tri catégorie puis identifiant. */
export function useRequirements({ projectId, nfr, enabled }: RequirementFilters) {
  const { around, drop } = useAskedRequirement(nfr);
  const query = useInfiniteQuery({
    ...orpc.spec.technical.nfr.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: NFR_PAGE_SIZE,
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  const missing = isAroundMissing(around, query);
  useDropMissing(missing, drop);
  return {
    ...list,
    items: list.items as NfrCardData[],
    categories: list.facet("category"),
    aroundMissing: missing,
  };
}

export function useClientRequirements({ projectId, nfr, enabled }: RequirementFilters) {
  const { around, drop } = useAskedRequirement(nfr);
  const query = useInfiniteQuery({
    ...orpc.clientSpace.technicalNfr.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: NFR_PAGE_SIZE,
        ...cursorOf(cursor, around),
      }),
      ...CURSOR_PAGES,
    }),
    enabled,
  });
  const list = pagedListOf(query);
  const missing = isAroundMissing(around, query);
  useDropMissing(missing, drop);
  return {
    ...list,
    items: (list.items as ClientNfr[]).map(asSpecItem),
    categories: list.facet("category"),
    aroundMissing: missing,
  };
}

export type RequirementListModel = ReturnType<
  typeof useRequirements | typeof useClientRequirements
>;
