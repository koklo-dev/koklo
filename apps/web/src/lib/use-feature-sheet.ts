"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useCallback } from "react";
import { withFeaturesUrl } from "./features-url.ts";
import { orpc } from "./orpc.ts";
import type { useFeaturesUrl } from "./use-features-url.ts";

/** Fiche ouverte par `?feature=` : lien partageable d'une ligne, retour du focus, relecture si elle a disparu. */
export function useFeatureSheet(
  projectId: string,
  url: ReturnType<typeof useFeaturesUrl>,
  titleRef: RefObject<HTMLHeadingElement | null>,
) {
  const queryClient = useQueryClient();
  return {
    hrefFor: (specId: string) =>
      `/projects/${projectId}/features${withFeaturesUrl(`?${url.search}`, { feature: specId })}`,
    returnFocus: useCallback(
      (specId: string) => {
        const link = document.querySelector<HTMLElement>(`[data-feature-link="${specId}"]`);
        (link ?? titleRef.current)?.focus();
      },
      [titleRef],
    ),
    refetchList: useCallback(
      () => void queryClient.invalidateQueries({ queryKey: orpc.spec.listFeatures.key() }),
      [queryClient],
    ),
  };
}
