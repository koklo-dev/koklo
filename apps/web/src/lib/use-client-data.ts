"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "./orpc.ts";
import { FIXTURE_PAGE_SIZE } from "./use-data-fixtures.ts";

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

/** Lignes d'un jeu, 25 par page (`clientSpace.dataFixtureRows`) ; la page précédente reste affichée pendant le changement. */
export function useClientFixtureRows(projectId: string, fixtureId: string) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    ...orpc.clientSpace.dataFixtureRows.queryOptions({
      input: { projectId, fixtureId, page, size: FIXTURE_PAGE_SIZE },
    }),
    placeholderData: keepPreviousData,
  });
  return { query, page, setPage };
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
