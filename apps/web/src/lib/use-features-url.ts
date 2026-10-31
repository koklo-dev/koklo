"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { type FeaturesUrlPatch, readFeaturesUrl, withFeaturesUrl } from "./features-url.ts";

function write(patch: FeaturesUrlPatch, mode: "push" | "replace"): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${withFeaturesUrl(search, patch)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Filtres et fiche ouverte, lus dans l'adresse (`useSearchParams`) et écrits par l'API History : la fiche
 * s'empile (Retour la ferme), les filtres remplacent l'entrée courante.
 */
export function useFeaturesUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readFeaturesUrl(search), [search]);
  return {
    ...state,
    search,
    setFilters: useCallback((patch: FeaturesUrlPatch) => write(patch, "replace"), []),
    openFeature: useCallback((feature: string) => write({ feature }, "push"), []),
    closeFeature: useCallback(() => write({ feature: null }, "replace"), []),
  };
}
