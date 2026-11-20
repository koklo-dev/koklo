"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";
import { useFixturePager } from "./use-data-fixtures.ts";
import { useDebounced } from "./use-data-zones.ts";

/** Modèle de données validé (`clientSpace.dataModel`) : tables, positions et validation, sans rien de l'équipe. */
export function useClientDataModel(projectId: string) {
  return useQuery(orpc.clientSpace.dataModel.queryOptions({ input: { projectId } }));
}

/** Jeux d'exemple du modèle validé (`clientSpace.dataFixtures`), lus seulement quand il l'est. */
export function useClientFixtures(projectId: string, enabled: boolean) {
  return useQuery({
    ...orpc.clientSpace.dataFixtures.queryOptions({ input: { projectId } }),
    enabled,
  });
}

/** Lignes d'un jeu, 25, 50 ou 100 par page (`clientSpace.dataFixturePage`) ; la page précédente reste affichée pendant le changement. */
export function useClientFixtureRows(projectId: string, fixtureId: string) {
  const pager = useFixturePager();
  const query = useQuery({
    ...orpc.clientSpace.dataFixturePage.queryOptions({
      input: { projectId, fixtureId, page: pager.page, size: pager.size },
    }),
    enabled: pager.ready,
    placeholderData: keepPreviousData,
  });
  return { query, ...pager };
}

/** Zones du modèle validé (`clientSpace.dataZones`) : non validé, `available` faux et aucune zone. */
export function useClientZones(projectId: string) {
  return useQuery(orpc.clientSpace.dataZones.queryOptions({ input: { projectId } }));
}

/** Une zone ouverte (`clientSpace.dataZone`, vocabulaire client) ; rien n'est lu tant qu'aucune zone n'est ouverte. */
export function useClientZone(projectId: string, zone: string | null) {
  return useQuery({
    ...orpc.clientSpace.dataZone.queryOptions({ input: { projectId, zone: zone ?? "" } }),
    enabled: zone !== null,
  });
}

/** Recherche d'une table du modèle validé (`clientSpace.dataSearch`), mêmes règles que l'équipe (20 au plus, 200 ms). */
export function useClientSearch(projectId: string, text: string) {
  const q = useDebounced(text.trim());
  const query = useQuery({
    ...orpc.clientSpace.dataSearch.queryOptions({ input: { projectId, q } }),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
  return { q, items: q.length > 0 ? (query.data?.items ?? []) : [] };
}

/**
 * Commentaire du client sur une table (`comment.create`, cible `table`, B448). Le serveur reste l'autorité : le
 * business reçoit un refus. `send` résout à `true` quand le commentaire est enregistré ; l'échec se lit dans `failed`.
 */
export function useTableComment(projectId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...orpc.comment.create.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.comment.key() }),
  });
  return {
    pending: mutation.isPending,
    failed: mutation.isError,
    reset: mutation.reset,
    send: async (tableId: string, body: string): Promise<boolean> => {
      try {
        await mutation.mutateAsync({ projectId, targetKind: "table", targetRef: tableId, body });
        return true;
      } catch {
        return false;
      }
    },
  };
}
