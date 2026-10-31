"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import type { useFeaturesData } from "./use-features-data.ts";
import type { useFeaturesUrl } from "./use-features-url.ts";

type Data = ReturnType<typeof useFeaturesData>;
type Url = ReturnType<typeof useFeaturesUrl>;

function moreFailure(failed: boolean, error: unknown): "validation" | "other" | null {
  if (!failed) return null;
  return errorCode(error) === "VALIDATION" ? "validation" : "other";
}

/** « Afficher plus » : page suivante, annonce du nombre réel, reprise depuis le début si le curseur est périmé. */
export function useMore(data: Data, moreShown: (count: number) => void) {
  const queryClient = useQueryClient();
  const { query } = data.features;
  return {
    hasNext: Boolean(query.hasNextPage),
    fetching: query.isFetchingNextPage,
    failure: moreFailure(query.isFetchNextPageError, query.error),
    onMore: () => {
      void query.fetchNextPage().then((result) => {
        const last = result.data?.pages.at(-1);
        if (!result.isError && last) moreShown(last.items.length);
      });
    },
    onRestart: () => void queryClient.resetQueries({ queryKey: orpc.spec.listFeatures.key() }),
  };
}

/** Filtres : le changement efface l'annonce et relance la requête ; « Effacer » rend le focus au premier `Select`. */
export function useFilterActions(url: Url, announce: (text: string) => void) {
  const statusRef = useRef<HTMLButtonElement>(null);
  return {
    statusRef,
    onChange: (patch: Parameters<Url["setFilters"]>[0]) => {
      announce("");
      url.setFilters(patch);
    },
    onClear: () => {
      announce("");
      url.setFilters({ status: null, priority: null });
      statusRef.current?.focus();
    },
  };
}
