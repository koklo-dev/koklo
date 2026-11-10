"use client";

import type { CreationStatus } from "@koklo/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { orpc } from "./orpc.ts";

/** Sondage de `project.creationStatus` tant que le worker travaille (S-projects v7 §4.2). */
export const CREATION_POLL_MS = 3000;

export const isCreationOngoing = (status: CreationStatus | null | undefined): boolean =>
  status?.status === "pending" || status?.status === "running";

/**
 * État d'une création, relu toutes les 3 s tant qu'elle est en cours (le sondage s'arrête à `succeeded`,
 * `failed` ou `skipped`). Le point de départ est celui de la carte : une carte rechargée repart de l'état serveur.
 * Une création terminée (ou sans ligne) rafraîchit la liste : la carte devient une carte normale.
 */
export function useCreationStatus(projectId: string, initial: CreationStatus) {
  const queryClient = useQueryClient();
  const query = useQuery(
    orpc.project.creationStatus.queryOptions({
      input: { projectId },
      initialData: initial,
      staleTime: CREATION_POLL_MS,
      refetchInterval: (current: { state: { data: CreationStatus | null | undefined } }) =>
        isCreationOngoing(current.state.data) ? CREATION_POLL_MS : false,
    }),
  );
  const status = query.data === undefined ? initial : query.data;
  const settled = status === null || status.status === "succeeded";
  useEffect(() => {
    if (!settled) return;
    void queryClient.invalidateQueries({ queryKey: orpc.project.cards.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.project.recent.key() });
  }, [settled, queryClient]);
  return { status: status ?? initial, settled };
}
