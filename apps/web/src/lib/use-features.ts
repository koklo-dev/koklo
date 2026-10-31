"use client";

import type { FeatureSummary } from "@koklo/contract";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { FeaturePriority, FeatureStatus } from "./feature-labels.ts";
import { orpc } from "./orpc.ts";

export const PAGE_SIZE = 50;

interface FeaturesOptions {
  projectId: string;
  status: FeatureStatus | undefined;
  priority: FeaturePriority | undefined;
  enabled: boolean;
}

/** Fonctionnalités d'un projet par pages de 50 (curseur opaque) ; un filtre change la clé, donc repart du début. */
export function useFeatures({ projectId, status, priority, enabled }: FeaturesOptions) {
  const query = useInfiniteQuery({
    ...orpc.spec.listFeatures.infiniteOptions({
      input: (cursor: string | undefined) => ({
        projectId,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(cursor ? { cursor } : {}),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
    enabled,
  });
  const items: FeatureSummary[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  return { query, items };
}
