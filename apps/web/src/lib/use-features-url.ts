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
 * Filtres, fiche et formulaire ouverts, lus dans l'adresse (`useSearchParams`) et écrits par l'API History :
 * la fiche et le formulaire s'empilent (Retour les ferme), les filtres remplacent l'entrée courante.
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
    openCreate: useCallback(() => write({ new: true, edit: null, feature: null }, "push"), []),
    openEdit: useCallback(
      (specId: string) => write({ edit: specId, new: null, feature: null }, "push"),
      [],
    ),
    /** Ferme le formulaire ; `feature` rend la fiche d'où venait la modification. */
    closeForm: useCallback(
      (feature?: string) => write({ new: null, edit: null, feature: feature ?? null }, "replace"),
      [],
    ),
    /** Sans droit d'écriture : `?edit=F-001` devient la fiche en lecture. */
    showFeature: useCallback(
      (feature: string) => write({ edit: null, new: null, feature }, "replace"),
      [],
    ),
  };
}
