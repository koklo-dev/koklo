"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { orpc } from "./orpc.ts";

export const ACTIVITY_PAGE_SIZE = 50;

/**
 * Vue d'ensemble d'un projet (`project.overview`, un seul appel). Rafraîchie à l'ouverture et au retour sur
 * l'onglet (`visibilitychange`), jamais par sondage ; l'ancienne vue reste affichée pendant le rechargement.
 */
export function useProjectOverview(projectId: string) {
  const query = useQuery({
    ...orpc.project.overview.queryOptions({ input: { projectId } }),
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });
  const { refetch } = query;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);
  return query;
}

/** Activité complète du projet par pages de 50 (curseur opaque, `total` du serveur). */
export function useProjectActivity(projectId: string) {
  return useInfiniteQuery(
    orpc.project.activity.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: ACTIVITY_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );
}
