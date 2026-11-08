"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";

export const PRESENCE_INTERVAL_MS = 15_000;

/**
 * Présence (toutes les 15 s) : qui est dans le dossier, et sur quelle page. Un échec est silencieux. Le business lit
 * sans être annoncé (procédure fermée côté serveur, B203) : pas de sondage tant que `enabled` est faux.
 */
export function useIdeaPresence(projectId: string, pageId: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ["idea", "presence", projectId, pageId],
    queryFn: () => orpc.idea.presence.call({ projectId, pageId }),
    refetchInterval: PRESENCE_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    enabled,
  });
  return query.data?.present ?? [];
}
