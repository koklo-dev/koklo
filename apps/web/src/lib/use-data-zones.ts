"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { orpc } from "./orpc.ts";

/** Anti-rebond de « Aller à une table » : la recherche part 200 ms après la dernière frappe (B483). */
export const SEARCH_DEBOUNCE_MS = 200;

/** Les zones du modèle (`spec.data.zones`) : une carte par zone, comptes et liens calculés par le serveur sur toute la tête. */
export function useDataZones(projectId: string) {
  return useQuery(orpc.spec.data.zones.queryOptions({ input: { projectId } }));
}

/** Une zone ouverte (`spec.data.zone`, 200 tables au plus) ; rien n'est lu tant qu'aucune zone n'est ouverte. */
export function useDataZone(projectId: string, zone: string | null) {
  return useQuery({
    ...orpc.spec.data.zone.queryOptions({ input: { projectId, zone: zone ?? "" } }),
    enabled: zone !== null,
  });
}

/** Valeur qui ne suit la saisie qu'après `delay` ms de calme. */
export function useDebounced<T>(value: T, delay = SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** Recherche d'une table par nom ou par champ sur toute la tête (`spec.data.search`, 20 au plus). */
export function useDataSearch(projectId: string, text: string) {
  const q = useDebounced(text.trim());
  const query = useQuery({
    ...orpc.spec.data.search.queryOptions({ input: { projectId, q } }),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
  return { q, query, items: q.length > 0 ? (query.data?.items ?? []) : [] };
}

/** Zone d'une table choisie par lien direct (`?sel=`) : la page de `tables.list` qui la contient, une ligne. */
export function useZoneOfTable(projectId: string, table: string | undefined, enabled: boolean) {
  const query = useQuery({
    ...orpc.spec.data.tables.list.queryOptions({
      input: { projectId, limit: 1, around: table ?? "" },
    }),
    enabled: enabled && table !== undefined,
    retry: false,
  });
  return query.data?.items.find((item) => item.specId === table)?.zone;
}
