"use client";

import type { IdeaListOutput } from "@koklo/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { orpc } from "./orpc.ts";

/**
 * Écritures de l'arborescence (créer, renommer, réordonner, supprimer, restaurer, statut). Chaque succès relit la
 * liste, jamais le contenu ; l'ordre est posé tout de suite dans le cache puis confirmé (ou défait) par la relecture.
 */
export function useIdeaActions(projectId: string) {
  const client = useQueryClient();
  const listKey = orpc.idea.list.queryOptions({ input: { projectId } }).queryKey;
  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: listKey }),
    [client, listKey],
  );
  const options = { onSuccess: refresh };
  const create = useMutation(orpc.idea.page.create.mutationOptions(options));
  const rename = useMutation(orpc.idea.page.rename.mutationOptions(options));
  const remove = useMutation(orpc.idea.page.delete.mutationOptions(options));
  const restore = useMutation(orpc.idea.page.restore.mutationOptions(options));
  const setStatus = useMutation(orpc.idea.setStatus.mutationOptions(options));
  const reorderMutation = useMutation(
    orpc.idea.page.reorder.mutationOptions({ onSettled: refresh }),
  );
  const reorder = useCallback(
    (pageIds: string[]) => {
      client.setQueryData<IdeaListOutput>(listKey, (current) => {
        if (!current) return current;
        const byId = new Map(current.pages.map((page) => [page.id, page]));
        const pages = pageIds.flatMap((id, position) => {
          const page = byId.get(id);
          return page ? [{ ...page, position }] : [];
        });
        return { ...current, pages };
      });
      return reorderMutation.mutateAsync({ projectId, pageIds });
    },
    [client, listKey, projectId, reorderMutation],
  );
  return {
    create,
    rename,
    remove,
    restore,
    setStatus,
    reorder,
    reorderFailed: reorderMutation.isError,
  };
}
