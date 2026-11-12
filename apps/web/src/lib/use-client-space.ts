"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";

/** Pages de la vue client : 50 fonctionnalités, 6 parcours, 24 règles (mêmes tailles que la vue équipe). */
export const CLIENT_PAGE_SIZE = { features: 50, flows: 6, rules: 24 } as const;

/** Progression du cahier pour le lecteur (`clientSpace.progress`) : compteurs d'onglet, suivante, éléments modifiés. */
export function useClientProgress(projectId: string, enabled = true) {
  return useQuery({
    ...orpc.clientSpace.progress.queryOptions({ input: { projectId } }),
    enabled,
  });
}

interface FeaturesOptions {
  projectId: string;
  untreated: boolean;
  /** Fonctionnalité à amener dans la page (la suivante non traitée, hors de la page chargée). */
  around: string | undefined;
}

/** Fonctionnalités (`clientSpace.features`) : curseur opaque, `total` du serveur, filtre « Non traitées », `around`. */
export function useClientFeatures({ projectId, untreated, around }: FeaturesOptions) {
  const query = useInfiniteQuery({
    ...orpc.clientSpace.features.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: CLIENT_PAGE_SIZE.features,
        ...(untreated ? { untreated: "true" as const } : {}),
        ...(cursor ? { cursor } : around ? { around } : {}),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
  });
  const pages = query.data?.pages ?? [];
  return {
    query,
    items: pages.flatMap((page) => page.items),
    total: pages.at(-1)?.total ?? 0,
    aroundMissing: Boolean(around) && query.isError && errorCode(query.error) === "NOT_FOUND",
  };
}

/** Fiche client d'une fonctionnalité (`clientSpace.feature`) ; sans identifiant, rien n'est lu. */
export function useClientFeature(projectId: string, featureId: string | undefined) {
  return useQuery({
    ...orpc.clientSpace.feature.queryOptions({ input: { projectId, featureId: featureId ?? "" } }),
    enabled: featureId !== undefined,
  });
}

/** Parcours (`clientSpace.flows`, 6 par page) ou règles (`clientSpace.rules`, 24 par page) en pages à curseur. */
export function useClientCards(projectId: string, tab: "flows" | "rules") {
  const input = (cursor: string | undefined) => ({
    projectId,
    limit: CLIENT_PAGE_SIZE[tab],
    ...(cursor ? { cursor } : {}),
  });
  const flows = useInfiniteQuery({
    ...orpc.clientSpace.flows.infiniteOptions({
      input,
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
    enabled: tab === "flows",
  });
  const rules = useInfiniteQuery({
    ...orpc.clientSpace.rules.infiniteOptions({
      input,
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
    enabled: tab === "rules",
  });
  return { flows, rules };
}

/** Rôles et matrice de permissions du client (`clientSpace.roles`). */
export function useClientRoles(projectId: string, enabled: boolean) {
  return useQuery({ ...orpc.clientSpace.roles.queryOptions({ input: { projectId } }), enabled });
}

/** Dernière demande de changement de la fonctionnalité (texte du client), lue seulement quand elle est « à revoir ». */
export function useChangeRequest(projectId: string, featureId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.review.list.queryOptions({
      input: { projectId, targetKind: "feature", targetRef: featureId, limit: 5 },
    }),
    enabled,
  });
  return query.data?.items.find((item) => item.status === "changes_requested" && item.current)
    ?.comment;
}

/** État du pied d'une liste à curseur : « Charger la suite », chargement, échec de la suite, fin. */
export function footerState(query: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
}) {
  if (query.isFetchNextPageError) return "error" as const;
  if (query.isFetchingNextPage) return "loading" as const;
  return query.hasNextPage ? ("more" as const) : ("end" as const);
}
