"use client";

import type { FeatureSummary } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { errorCode } from "./api-error.ts";
import type { FeaturePriority, FeatureStatus } from "./feature-labels.ts";
import { orpc } from "./orpc.ts";

export const PAGE_SIZE = 50;

interface FeaturesOptions {
  projectId: string;
  status: FeatureStatus | undefined;
  priority: FeaturePriority | undefined;
  q: string | undefined;
  /** Identifiant d'une fonctionnalité à amener dans la page (lien direct `?sel=`). */
  around: string | undefined;
  enabled: boolean;
}

/**
 * Lien direct : l'identifiant de `?sel=` présent à l'ouverture sert une fois de `around` pour les filtres
 * d'alors. Ouvrir une autre ligne ne recharge rien ; changer de filtre ou de recherche l'oublie.
 */
export function useDeepLink(selected: string | undefined, signature: string) {
  const [link, setLink] = useState<{ id: string | undefined; signature: string }>({
    id: selected,
    signature,
  });
  const drop = useCallback(() => setLink((current) => ({ ...current, id: undefined })), []);
  return { around: link.signature === signature ? link.id : undefined, drop };
}

/**
 * Fonctionnalités d'un projet par pages de 50 (curseur opaque, `total` du serveur). Un filtre ou la recherche change
 * la clé, donc repart du début en gardant la liste précédente à l'écran jusqu'à la réponse ; `around` ouvre la
 * liste sur la page qui contient la ligne, `fetchPreviousPage` remonte avec `previousCursor`.
 */
export function useFeatures({ projectId, status, priority, q, around, enabled }: FeaturesOptions) {
  const query = useInfiniteQuery({
    ...orpc.spec.listFeatures.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(q ? { q } : {}),
        ...(cursor ? { cursor } : around ? { around } : {}),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      getPreviousPageParam: (page) => page.previousCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
    enabled,
  });
  const pages = query.data?.pages ?? [];
  const items: FeatureSummary[] = pages.flatMap((page) => page.items);
  const stale = query.isPlaceholderData;
  return {
    query,
    items,
    /** Nombre de fonctionnalités de la liste filtrée, selon le serveur. */
    total: pages.at(-1)?.total ?? 0,
    /** Rang (0 pour la première) de la première ligne chargée. */
    offset: pages[0]?.offset ?? 0,
    /** La liste affichée est celle d'avant le dernier changement de filtre ou de recherche. */
    stale,
    hasNext: Boolean(query.hasNextPage) && !stale,
    hasPrevious: Boolean(query.hasPreviousPage) && !stale,
    /** `around` n'a pas trouvé la ligne (supprimée ou inconnue) : la liste se relit sans lui. */
    aroundMissing: Boolean(around) && query.isError && errorCode(query.error) === "NOT_FOUND",
  };
}
