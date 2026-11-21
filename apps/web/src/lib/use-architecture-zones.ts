"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";
import { useDebounced } from "./use-data-zones.ts";

/** Les zones de l'architecture (`spec.architecture.zones`) : comptes, aperçu et liens calculés par le serveur. */
export function useArchitectureZones(projectId: string, enabled = true) {
  return useQuery({
    ...orpc.spec.architecture.zones.queryOptions({ input: { projectId } }),
    enabled,
  });
}

/** Une zone ouverte (`spec.architecture.zone`, 200 composants au plus) ; rien n'est lu tant qu'aucune zone n'est ouverte. */
export function useArchitectureZone(projectId: string, zone: string | null) {
  return useQuery({
    ...orpc.spec.architecture.zone.queryOptions({ input: { projectId, zone: zone ?? "" } }),
    enabled: zone !== null,
  });
}

/** Toutes les zones d'une architecture qui tient dans un cadre (25 composants au plus) : un détail par zone. */
export function useAllZoneDetails(projectId: string, zones: readonly string[], enabled: boolean) {
  const results = useQueries({
    queries: zones.map((zone) => ({
      ...orpc.spec.architecture.zone.queryOptions({ input: { projectId, zone } }),
      enabled,
    })),
  });
  return {
    details: results.flatMap((result) => (result.data ? [result.data] : [])),
    pending: enabled && results.some((result) => result.isPending),
    failed: results.some((result) => result.isError),
    retry: () => results.forEach((result) => void result.refetch()),
  };
}

/** « Aller à un composant… » : recherche sur toute la tête (`spec.architecture.search`, 20 au plus), 200 ms de calme. */
export function useArchitectureSearch(projectId: string, text: string) {
  const q = useDebounced(text.trim());
  const query = useQuery({
    ...orpc.spec.architecture.search.queryOptions({ input: { projectId, q } }),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
  const items = q.length > 0 ? (query.data?.items ?? []) : [];
  return {
    q,
    query,
    items: items.map((item) => ({ id: item.specId, name: item.name, zone: item.zone })),
  };
}

/** Zone d'un composant choisi par lien direct (`?sel=`) : la page de `components.list` qui le contient, une ligne. */
export function useZoneOfComponent(projectId: string, id: string | undefined, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.architecture.components.list.queryOptions({
      input: { projectId, limit: 1, around: id ?? "" },
    }),
    enabled: enabled && id?.startsWith("C-") === true,
    retry: false,
  });
  return query.data?.items.find((item) => item.specId === id)?.zone;
}
